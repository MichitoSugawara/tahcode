// Preview-only Convex deploy. Claims `--preview-name` (stable `pr-N`).
// When DeploymentQuotaReached blocks creating that identifier, delete a
// stale leftover preview (closed/merged branch) so `pr-N` can be created.
// Do not leave this PR's Worker pointed at a leftover that other PRs reuse.
// Staging/production must keep calling `npx convex deploy` directly.
import { spawnSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  DELETE_SETTLE_MS,
  functionSpecHasCanaryTools,
  isolatePreferredPreview,
  parsePreviewDeployKey,
  PREVIEW_TOOL_CANARIES,
} from "./convex-preview-isolate.mjs";
import {
  isDeploymentQuotaError,
  isEnvChangedDuringPush,
  nextPreviewClaim,
  previewNameCandidates,
  protectedPreviewNames,
  slugPreviewName,
  splitNameList,
} from "./convex-preview-names.mjs";

const ENV_PUSH_RETRIES = 2;
const PREFERRED_RETRIES_AFTER_PRUNE = 3;

const DEFAULT_CMD =
  'echo "CONVEX_URL=$VITE_CONVEX_URL" >> "$GITHUB_ENV" && npm run cf:build';

function usage() {
  console.error(
    "Usage: node scripts/convex-preview-deploy.mjs --dotenv <file> --preview-name <name> [--fallback-names a,b] [--exclude-names a,b] [--prune-names a,b] [--cmd <shell>]"
  );
  process.exit(2);
}

function parseArgv(argv) {
  const args = {
    cmd: DEFAULT_CMD,
    dotenv: "",
    exclude: "",
    fallbacks: "",
    previewName: "",
    prune: "",
  };
  for (let i = 2; i < argv.length; i++) {
    const token = argv[i];
    if (token === "--dotenv") {
      args.dotenv = argv[++i] ?? "";
    } else if (token === "--preview-name") {
      args.previewName = argv[++i] ?? "";
    } else if (token === "--fallback-names") {
      args.fallbacks = argv[++i] ?? "";
    } else if (token === "--exclude-names") {
      args.exclude = argv[++i] ?? "";
    } else if (token === "--prune-names") {
      args.prune = argv[++i] ?? "";
    } else if (token === "--cmd") {
      args.cmd = argv[++i] ?? DEFAULT_CMD;
    } else {
      usage();
    }
  }
  if (!args.dotenv || !args.previewName) {
    usage();
  }
  return args;
}

function invokedAsCli(metaUrl) {
  const entry = process.argv[1];
  if (!entry) {
    return false;
  }
  return pathToFileURL(path.resolve(entry)).href === metaUrl;
}

function writeOutput(name, value) {
  const githubOutput = process.env.GITHUB_OUTPUT;
  if (!githubOutput) {
    return;
  }
  appendFileSync(githubOutput, `${name}=${value}\n`);
}

function sleepMs(ms) {
  spawnSync("sleep", [String(Math.max(1, Math.ceil(ms / 1000)))], {
    stdio: "ignore",
  });
}

function runConvexDeploy(dotenv, previewName, cmd) {
  const result = spawnSync(
    "npx",
    [
      "dotenvx",
      "run",
      "-f",
      dotenv,
      "--",
      "npx",
      "convex",
      "deploy",
      "--preview-name",
      previewName,
      "--cmd-url-env-var-name",
      "VITE_CONVEX_URL",
      "--cmd",
      cmd,
    ],
    {
      encoding: "utf-8",
      env: process.env,
      maxBuffer: 32 * 1024 * 1024,
    }
  );
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  process.stdout.write(output);
  return { output, status: result.status ?? 1 };
}

export function readPreviewDeployKey(dotenv) {
  const result = spawnSync(
    "npx",
    ["dotenvx", "run", "-f", dotenv, "--", "printenv", "CONVEX_DEPLOY_KEY"],
    { encoding: "utf-8", env: process.env }
  );
  const value = (result.stdout ?? "").trim();
  if (result.status !== 0 || !value) {
    return "";
  }
  return value;
}

export function verifyPreviewAgentTools(dotenv, previewName) {
  const result = spawnSync(
    "npx",
    [
      "dotenvx",
      "run",
      "-f",
      dotenv,
      "--",
      "npx",
      "convex",
      "function-spec",
      "--preview-name",
      previewName,
    ],
    {
      encoding: "utf-8",
      env: process.env,
      maxBuffer: 32 * 1024 * 1024,
    }
  );
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  if (result.status !== 0) {
    return { ok: false, output, reason: "function-spec-failed" };
  }
  if (!functionSpecHasCanaryTools(output, PREVIEW_TOOL_CANARIES)) {
    return { ok: false, output, reason: "missing-canary-tools" };
  }
  return { ok: true, output, reason: "ok" };
}

function finishSuccess(previewName, verify) {
  if (!verify.ok) {
    console.error(
      `::error::Preview Convex ${previewName} is up but agentTools:invoke is missing ${PREVIEW_TOOL_CANARIES.join(", ")} (${verify.reason}).`
    );
    process.exit(1);
  }
  console.log(
    `::notice::Preview agentTools canaries present on ${previewName}: ${PREVIEW_TOOL_CANARIES.join(", ")}`
  );
  writeOutput("preview_name", previewName);
  console.log(`::notice::Convex preview ready: ${previewName}`);
  process.exit(0);
}

async function tryIsolatePreferred(args, preferred) {
  const deployKey = readPreviewDeployKey(args.dotenv);
  if (!parsePreviewDeployKey(deployKey)) {
    console.log(
      "::warning::CONVEX_DEPLOY_KEY is not a preview deploy key; cannot prune leftover previews."
    );
    return { deleted: [] };
  }
  const exclude = protectedPreviewNames({
    exclude: args.exclude,
    preferred,
  });
  const pruneNames = [
    ...splitNameList(args.prune).map((name) => slugPreviewName(name)),
    ...splitNameList(args.fallbacks).map((name) => slugPreviewName(name)),
  ].filter((name) => name.length > 0);
  console.log(
    `::notice::Pruning stale Convex previews so "${preferred}" can be claimed`
  );
  const isolated = await isolatePreferredPreview({
    deployKey,
    exclude,
    preferred,
    pruneNames,
  });
  for (const item of isolated.deleted) {
    console.log(
      `::notice::Deleted leftover preview "${item.identifier}" (${item.deploymentName})`
    );
  }
  if (isolated.deleted.length === 0) {
    console.log("::warning::No stale Convex preview could be deleted.");
  }
  for (const error of isolated.errors ?? []) {
    console.log(
      `::warning::Preview isolate ${error.stage} failed for "${error.identifier}" (${error.status ?? error.kind})`
    );
  }
  return isolated;
}

async function deployPreferred(args, preferred, options = {}) {
  const quotaRetries = options.quotaRetries ?? 0;
  let envRetries = 0;
  let quotaAttempts = 0;
  while (true) {
    console.log(`::notice::Claiming Convex preview "${preferred}"`);
    const result = runConvexDeploy(args.dotenv, preferred, args.cmd);
    if (result.status === 0) {
      return result;
    }
    if (
      isEnvChangedDuringPush(result.output) &&
      envRetries < ENV_PUSH_RETRIES
    ) {
      envRetries += 1;
      console.log(
        `::warning::Convex env changed during push for "${preferred}". Retrying (${envRetries}/${ENV_PUSH_RETRIES}).`
      );
      sleepMs(4000 * envRetries);
      continue;
    }
    if (!isDeploymentQuotaError(result.output)) {
      console.error(
        `::error::convex deploy --preview-name ${preferred} failed (exit ${result.status}).`
      );
      process.exit(result.status);
    }
    if (quotaAttempts < quotaRetries) {
      quotaAttempts += 1;
      console.log(
        `::warning::DeploymentQuotaReached for "${preferred}" after prune. Retrying (${quotaAttempts}/${quotaRetries}).`
      );
      sleepMs(DELETE_SETTLE_MS);
      continue;
    }
    return result;
  }
}

async function main() {
  const args = parseArgv(process.argv);
  const preferred = slugPreviewName(args.previewName);
  const candidates = previewNameCandidates({
    exclude: args.exclude,
    fallbacks: args.fallbacks,
    preferred: args.previewName,
  });
  if (!preferred || candidates.length === 0) {
    console.error("::error::No Convex preview names to claim.");
    process.exit(2);
  }

  let preferredResult = await deployPreferred(args, preferred);
  if (preferredResult.status === 0) {
    finishSuccess(preferred, verifyPreviewAgentTools(args.dotenv, preferred));
  }

  const isolated = await tryIsolatePreferred(args, preferred);
  if (isolated.deleted.length > 0) {
    console.log(
      `::notice::Waiting ${DELETE_SETTLE_MS}ms for Convex quota to settle after prune`
    );
    sleepMs(DELETE_SETTLE_MS);
    preferredResult = await deployPreferred(args, preferred, {
      quotaRetries: PREFERRED_RETRIES_AFTER_PRUNE,
    });
    if (preferredResult.status === 0) {
      finishSuccess(preferred, verifyPreviewAgentTools(args.dotenv, preferred));
    }
  }

  console.log(
    `::warning::Could not claim isolated preview "${preferred}". Falling back to a leftover name (last-writer-wins until the next prune).`
  );

  let name = nextPreviewClaim(candidates, preferred);
  let envRetries = 0;
  while (name) {
    console.log(`::notice::Claiming Convex preview "${name}"`);
    const result = runConvexDeploy(args.dotenv, name, args.cmd);
    if (result.status === 0) {
      finishSuccess(name, verifyPreviewAgentTools(args.dotenv, name));
    }
    if (
      isEnvChangedDuringPush(result.output) &&
      envRetries < ENV_PUSH_RETRIES
    ) {
      envRetries += 1;
      console.log(
        `::warning::Convex env changed during push for "${name}". Retrying (${envRetries}/${ENV_PUSH_RETRIES}).`
      );
      sleepMs(4000 * envRetries);
      continue;
    }
    envRetries = 0;
    if (!isDeploymentQuotaError(result.output)) {
      console.error(
        `::error::convex deploy --preview-name ${name} failed (exit ${result.status}).`
      );
      process.exit(result.status);
    }
    const next = nextPreviewClaim(candidates, name);
    if (!next) {
      console.error(
        "::error::Convex team deployment quota reached and no reusable preview name remained. Close unused preview deployments in the Convex dashboard or reuse pr-<number>."
      );
      process.exit(result.status);
    }
    console.log(
      `::warning::DeploymentQuotaReached for "${name}". Reusing existing preview "${next}".`
    );
    name = next;
  }
}

if (invokedAsCli(import.meta.url)) {
  main().catch((error) => {
    console.error(
      error instanceof Error ? error.message : "Preview Convex deploy failed"
    );
    process.exit(1);
  });
}
