// Prune stale Convex preview deployments and tahcode-preview Worker leftovers.
// Dry-run is the default. --apply deletes only after open-PR names are known.
// Never deletes production / staging Convex deployments or non-preview Workers.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  FORBIDDEN_IDENTIFIERS,
  deletePreviewDeployment,
  getDeploymentByName,
  getProjectBySlug,
  isForbiddenPreviewIdentifier,
  isPreviewDeploymentRecord,
  isUntouchableDeploymentType,
  listProjectDeployments,
  parsePreviewDeployKey,
  previewIdentifierFromDeployment,
  resolvePreviewDeployment,
} from "./convex-preview-isolate.mjs";
import {
  SHARED_PREVIEW_NAME,
  protectedPreviewNames,
  slugPreviewName,
  splitNameList,
} from "./convex-preview-names.mjs";
import {
  discoverGithubPreviewNames,
  mergeNameLists,
} from "./preview-github.mjs";
import {
  KEEP_PREVIEW_VERSIONS_DEFAULT,
  PREVIEW_WORKER_NAME,
  assertPreviewWorkerName,
  collectCloudflarePreviewState,
  deletePreviewWorkerAlias,
  deletePreviewWorkerVersion,
  planCloudflarePreviewPrune,
} from "./preview-prune-cloudflare.mjs";

const DEFAULT_DOTENV = ".env.preview";
const DEFAULT_MAX_DELETES = 40;

function usage() {
  console.error(`Usage: node scripts/preview-prune.mjs [--dry-run|--apply] [options]

List or delete stale preview resources. Dry-run is the default.

  --dry-run              Print the plan only (default)
  --apply                Delete after the same guards as dry-run
  --dotenv <file>        Decrypted preview env (default: .env.preview)
  --decrypt              Decrypt .env.preview.enc first
  --exclude-names a,b    Extra protected identifiers (open PR pr-N)
  --prune-names a,b      Extra stale identifiers to claim-then-delete
  --skip-github          Do not call gh (requires --exclude-names for --apply)
  --convex-only          Convex Management API only
  --cloudflare-only      tahcode-preview versions / aliases only
  --sweep-unmapped       Also delete leftover preview deployments not in open PRs
  --include-ci           Allow deleting the shared Convex preview name "ci"
  --keep-versions <n>    Cloudflare versions to keep (default: ${KEEP_PREVIEW_VERSIONS_DEFAULT})
  --max-deletes <n>      Max Convex identifier deletes (default: ${DEFAULT_MAX_DELETES})
`);
  process.exit(2);
}

export function parsePruneArgv(argv) {
  const args = {
    apply: false,
    cloudflare: true,
    convex: true,
    decrypt: false,
    dotenv: DEFAULT_DOTENV,
    exclude: "",
    includeCi: false,
    keepVersions: KEEP_PREVIEW_VERSIONS_DEFAULT,
    maxDeletes: DEFAULT_MAX_DELETES,
    prune: "",
    skipGithub: false,
    sweepUnmapped: false,
    worker: PREVIEW_WORKER_NAME,
  };
  const tokens = argv.slice(2);
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token === "--dry-run") {
      args.apply = false;
    } else if (token === "--apply") {
      args.apply = true;
    } else if (token === "--decrypt") {
      args.decrypt = true;
    } else if (token === "--skip-github") {
      args.skipGithub = true;
    } else if (token === "--convex-only") {
      args.convex = true;
      args.cloudflare = false;
    } else if (token === "--cloudflare-only") {
      args.convex = false;
      args.cloudflare = true;
    } else if (token === "--sweep-unmapped") {
      args.sweepUnmapped = true;
    } else if (token === "--include-ci") {
      args.includeCi = true;
    } else if (token === "--dotenv") {
      args.dotenv = tokens[++i] ?? "";
    } else if (token === "--exclude-names") {
      args.exclude = tokens[++i] ?? "";
    } else if (token === "--prune-names") {
      args.prune = tokens[++i] ?? "";
    } else if (token === "--keep-versions") {
      args.keepVersions = Number(tokens[++i] ?? KEEP_PREVIEW_VERSIONS_DEFAULT);
    } else if (token === "--max-deletes") {
      args.maxDeletes = Number(tokens[++i] ?? DEFAULT_MAX_DELETES);
    } else if (token === "--worker") {
      args.worker = tokens[++i] ?? "";
    } else if (token === "--help" || token === "-h") {
      usage();
    } else {
      usage();
    }
  }
  if (!args.dotenv) {
    usage();
  }
  if (!Number.isFinite(args.keepVersions) || args.keepVersions < 1) {
    usage();
  }
  if (!Number.isFinite(args.maxDeletes) || args.maxDeletes < 1) {
    usage();
  }
  return args;
}

export function planConvexHygiene(input) {
  const protectedNames = new Set(
    [...(input.protectedNames ?? [])]
      .map((name) => slugPreviewName(name))
      .filter((name) => name.length > 0)
  );
  if (!input.includeCi) {
    protectedNames.add(SHARED_PREVIEW_NAME);
  }
  for (const forbidden of FORBIDDEN_IDENTIFIERS) {
    protectedNames.add(forbidden);
  }

  const deletes = [];
  const kept = [];
  const skipped = [];
  const seenIdentifiers = new Set();

  for (const raw of input.staleIdentifiers ?? []) {
    const identifier = slugPreviewName(raw);
    if (!identifier || seenIdentifiers.has(identifier)) {
      continue;
    }
    seenIdentifiers.add(identifier);
    if (
      protectedNames.has(identifier) ||
      isForbiddenPreviewIdentifier(identifier)
    ) {
      kept.push({ identifier, reason: "protected" });
      continue;
    }
    deletes.push({ action: "claim-delete", identifier });
  }

  const protectedDeploymentNames = new Set(
    input.protectedDeploymentNames ?? []
  );
  const plannedIdentifiers = new Set(
    deletes.map((item) => item.identifier).filter(Boolean)
  );

  if (input.sweepUnmapped) {
    for (const deployment of input.listed ?? []) {
      const deploymentName = String(
        deployment.name ?? deployment.deploymentName ?? ""
      );
      if (!deploymentName) {
        continue;
      }
      if (
        isUntouchableDeploymentType(deployment) ||
        !isPreviewDeploymentRecord(deployment)
      ) {
        skipped.push({ deploymentName, reason: "not-preview" });
        continue;
      }
      const fromRecord = slugPreviewName(
        previewIdentifierFromDeployment(deployment) ?? ""
      );
      if (fromRecord && protectedNames.has(fromRecord)) {
        kept.push({
          deploymentName,
          identifier: fromRecord,
          reason: "protected",
        });
        continue;
      }
      if (protectedDeploymentNames.has(deploymentName)) {
        kept.push({
          deploymentName,
          reason: "open-pr-deployment",
        });
        continue;
      }
      if (fromRecord && plannedIdentifiers.has(fromRecord)) {
        continue;
      }
      deletes.push({
        action: "delete-named",
        deploymentName,
        identifier: fromRecord || null,
      });
    }
  }

  return { deletes, kept, skipped };
}

export function readDotenvVar(dotenv, name, spawnImpl = spawnSync) {
  if (!dotenv || !existsSync(dotenv)) {
    return "";
  }
  const result = spawnImpl(
    "npx",
    ["dotenvx", "run", "-f", dotenv, "--", "printenv", name],
    { encoding: "utf-8" }
  );
  if ((result.status ?? 1) !== 0) {
    return "";
  }
  return (result.stdout ?? "").trim();
}

export function refuseApplyWithoutOpenPrs(input) {
  if (!input.apply) {
    return null;
  }
  if (input.openOk || input.explicitExclude) {
    return null;
  }
  return "Refusing --apply: open pull requests were not listed. Pass --exclude-names or fix gh auth.";
}

function invokedAsCli(metaUrl) {
  const entry = process.argv[1];
  if (!entry) {
    return false;
  }
  return pathToFileURL(path.resolve(entry)).href === metaUrl;
}

function decryptPreviewEnv() {
  const result = spawnSync(
    process.execPath,
    ["scripts/env.mjs", "decrypt", "preview"],
    {
      env: process.env,
      stdio: "inherit",
    }
  );
  if ((result.status ?? 1) !== 0) {
    throw new Error("Failed to decrypt .env.preview");
  }
}

function modeLabel(apply) {
  return apply ? "apply" : "dry-run";
}

function logLine(kind, message) {
  if (kind === "error") {
    console.error(`::error::${message}`);
    return;
  }
  if (kind === "warning") {
    console.log(`::warning::${message}`);
    return;
  }
  console.log(`::notice::${message}`);
}

async function resolveProtectedDeploymentNames(input) {
  const names = new Set();
  for (const identifier of input.protectedIdentifiers) {
    if (isForbiddenPreviewIdentifier(identifier)) {
      continue;
    }
    const resolved = await resolvePreviewDeployment({
      allowClaim: false,
      deployKey: input.deployKey,
      fetchImpl: input.fetchImpl,
      identifier,
    });
    if (resolved.kind === "ok" && resolved.deploymentName) {
      names.add(resolved.deploymentName);
    }
  }
  return names;
}

async function applyConvexDelete(input) {
  const { deployKey, fetchImpl, item } = input;
  if (item.action === "delete-named") {
    const fetched = await getDeploymentByName({
      deployKey,
      deploymentName: item.deploymentName,
      fetchImpl,
    });
    if (fetched.kind === "missing") {
      return { kind: "missing" };
    }
    if (fetched.kind !== "ok") {
      return fetched;
    }
    if (
      isUntouchableDeploymentType(fetched.deployment) ||
      !isPreviewDeploymentRecord(fetched.deployment)
    ) {
      return { kind: "forbidden" };
    }
    return await deletePreviewDeployment({
      deployKey,
      deploymentName: item.deploymentName,
      fetchImpl,
    });
  }

  const resolved = await resolvePreviewDeployment({
    allowClaim: true,
    deployKey,
    fetchImpl,
    identifier: item.identifier,
  });
  if (resolved.kind === "missing" || resolved.kind === "quota") {
    return { kind: "missing" };
  }
  if (resolved.kind === "forbidden") {
    return { kind: "forbidden" };
  }
  if (resolved.kind !== "ok" || !resolved.deploymentName) {
    return resolved;
  }
  if (resolved.deployment && !isPreviewDeploymentRecord(resolved.deployment)) {
    if (isUntouchableDeploymentType(resolved.deployment)) {
      return { kind: "forbidden" };
    }
    if (deploymentTypeOfSafe(resolved.deployment)) {
      return { kind: "forbidden" };
    }
  }
  return await deletePreviewDeployment({
    deployKey,
    deploymentName: resolved.deploymentName,
    fetchImpl,
  });
}

function deploymentTypeOfSafe(deployment) {
  return Boolean(
    deployment?.deployment_type ??
    deployment?.deploymentType ??
    deployment?.kind
  );
}

async function pruneConvex(args, names, fetchImpl) {
  const deployKey = readDotenvVar(args.dotenv, "CONVEX_DEPLOY_KEY");
  if (!parsePreviewDeployKey(deployKey)) {
    logLine(
      "warning",
      "CONVEX_DEPLOY_KEY is missing or not a preview deploy key; skipping Convex prune."
    );
    return { deleted: 0, failed: 0, planned: 0 };
  }

  const protectedNames = protectedPreviewNames({
    exclude: names.exclude.join(","),
    preferred: "",
  });
  for (const name of names.exclude) {
    protectedNames.add(name);
  }
  if (args.includeCi) {
    protectedNames.delete(SHARED_PREVIEW_NAME);
  }

  let listed = [];
  let listedOk = false;
  const project = await getProjectBySlug({ deployKey, fetchImpl });
  const listedResult = await listProjectDeployments({
    deployKey,
    fetchImpl,
    projectId: project.kind === "ok" ? project.projectId : undefined,
  });
  if (listedResult.kind === "ok") {
    listed = listedResult.deployments;
    listedOk = true;
  }

  let protectedDeploymentNames = new Set();
  if (args.sweepUnmapped && listedOk) {
    protectedDeploymentNames = await resolveProtectedDeploymentNames({
      deployKey,
      fetchImpl,
      protectedIdentifiers: [...protectedNames],
    });
  } else if (args.sweepUnmapped && !listedOk) {
    logLine(
      "warning",
      "Convex list_deployments failed; --sweep-unmapped skipped (identifier deletes still run)."
    );
  }

  const plan = planConvexHygiene({
    includeCi: args.includeCi,
    listed: args.sweepUnmapped && listedOk ? listed : [],
    protectedDeploymentNames,
    protectedNames,
    staleIdentifiers: names.prune,
    sweepUnmapped: args.sweepUnmapped && listedOk,
  });

  const limited = plan.deletes.slice(0, args.maxDeletes);
  logLine(
    "notice",
    `Convex preview prune (${modeLabel(args.apply)}): ${limited.length} candidate(s), ${plan.kept.length} kept, ${plan.skipped.length} skipped`
  );
  for (const item of plan.kept) {
    logLine(
      "notice",
      `keep Convex ${item.identifier ?? item.deploymentName} (${item.reason})`
    );
  }
  for (const item of plan.skipped) {
    logLine("notice", `skip Convex ${item.deploymentName} (${item.reason})`);
  }

  let deleted = 0;
  let failed = 0;
  for (const item of limited) {
    const label = item.identifier ?? item.deploymentName;
    if (!args.apply) {
      logLine(
        "notice",
        `would delete Convex preview ${label} (${item.action})`
      );
      continue;
    }
    const result = await applyConvexDelete({ deployKey, fetchImpl, item });
    if (result.kind === "ok" || result.kind === "missing") {
      deleted += 1;
      logLine("notice", `deleted Convex preview ${label}`);
      continue;
    }
    if (result.kind === "forbidden") {
      logLine("warning", `refused Convex delete for ${label} (not a preview)`);
      continue;
    }
    failed += 1;
    logLine(
      "warning",
      `Convex delete failed for ${label} (${result.status ?? result.kind})`
    );
  }
  return { deleted, failed, planned: limited.length };
}

async function pruneCloudflare(args, names, fetchImpl) {
  const worker = assertPreviewWorkerName(args.worker || PREVIEW_WORKER_NAME);
  const token = readDotenvVar(args.dotenv, "CLOUDFLARE_API_TOKEN");
  const accountId = readDotenvVar(args.dotenv, "CLOUDFLARE_ACCOUNT_ID");
  if (!(token && accountId)) {
    logLine(
      "warning",
      "CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID missing; skipping Cloudflare prune."
    );
    return { deleted: 0, failed: 0, planned: 0 };
  }

  const state = await collectCloudflarePreviewState({
    accountId,
    fetchImpl,
    token,
    worker,
  });
  if (state.versionsKind === "error") {
    logLine(
      "warning",
      "Could not list tahcode-preview versions; skipping Cloudflare prune."
    );
    return { deleted: 0, failed: 0, planned: 0 };
  }

  const plan = planCloudflarePreviewPrune({
    aliases: state.aliases,
    deployedVersionIds: state.deployedVersionIds,
    keepVersions: args.keepVersions,
    openAliases: names.exclude,
    versions: state.versions,
    worker,
  });

  logLine(
    "notice",
    `Cloudflare ${worker} prune (${modeLabel(args.apply)}): ${plan.aliasDeletes.length} alias(es), ${plan.versionDeletes.length} version(s)`
  );
  for (const item of plan.aliasKept) {
    logLine("notice", `keep alias ${item.name} (${item.reason})`);
  }
  for (const item of plan.versionKept) {
    logLine("notice", `keep version ${item.id} (${item.reason})`);
  }

  let deleted = 0;
  let failed = 0;
  for (const alias of plan.aliasDeletes) {
    if (!args.apply) {
      logLine("notice", `would delete alias ${alias.name}`);
      continue;
    }
    const result = await deletePreviewWorkerAlias({
      accountId,
      alias: alias.name,
      fetchImpl,
      token,
      worker,
    });
    if (result.kind === "ok" || result.kind === "missing") {
      deleted += 1;
      logLine("notice", `deleted alias ${alias.name}`);
      continue;
    }
    if (result.kind === "forbidden") {
      logLine("warning", `refused alias delete ${alias.name}`);
      continue;
    }
    failed += 1;
    logLine(
      "warning",
      `alias delete failed ${alias.name} (${result.status ?? result.kind})`
    );
  }
  for (const version of plan.versionDeletes) {
    if (!args.apply) {
      logLine("notice", `would delete version ${version.id}`);
      continue;
    }
    const result = await deletePreviewWorkerVersion({
      accountId,
      fetchImpl,
      token,
      versionId: version.id,
      worker,
    });
    if (result.kind === "ok" || result.kind === "missing") {
      deleted += 1;
      logLine("notice", `deleted version ${version.id}`);
      continue;
    }
    failed += 1;
    logLine(
      "warning",
      `version delete failed ${version.id} (${result.status ?? result.kind})`
    );
  }
  return {
    deleted,
    failed,
    planned: plan.aliasDeletes.length + plan.versionDeletes.length,
  };
}

export async function runPreviewPrune(argv, options = {}) {
  const args = parsePruneArgv(argv);
  assertPreviewWorkerName(args.worker);
  if (args.decrypt) {
    decryptPreviewEnv();
  }

  const explicitExclude = splitNameList(args.exclude).map((name) =>
    slugPreviewName(name)
  );
  const explicitPrune = splitNameList(args.prune).map((name) =>
    slugPreviewName(name)
  );
  const github = args.skipGithub
    ? { exclude: [], openOk: false, prune: [] }
    : discoverGithubPreviewNames({ spawnImpl: options.spawnImpl });

  const exclude = mergeNameLists(github.exclude, explicitExclude);
  const prune = mergeNameLists(github.prune, explicitPrune).filter(
    (name) => !exclude.includes(name)
  );
  const refusal = refuseApplyWithoutOpenPrs({
    apply: args.apply,
    explicitExclude: explicitExclude.length > 0,
    openOk: github.openOk,
  });
  if (refusal) {
    logLine("error", refusal);
    return { exitCode: 2 };
  }

  logLine(
    "notice",
    `Protected preview names: ${exclude.join(", ") || "(none listed)"}`
  );
  const fetchImpl = options.fetchImpl ?? fetch;
  let failed = 0;
  if (args.convex) {
    const convex = await pruneConvex(args, { exclude, prune }, fetchImpl);
    failed += convex.failed;
  }
  if (args.cloudflare) {
    const cloudflare = await pruneCloudflare(
      args,
      { exclude, prune },
      fetchImpl
    );
    failed += cloudflare.failed;
  }
  return { exitCode: failed > 0 ? 1 : 0 };
}

if (invokedAsCli(import.meta.url)) {
  runPreviewPrune(process.argv).then(
    (result) => {
      process.exit(result.exitCode);
    },
    (error) => {
      console.error(
        error instanceof Error ? error.message : "Preview prune failed"
      );
      process.exit(1);
    }
  );
}
