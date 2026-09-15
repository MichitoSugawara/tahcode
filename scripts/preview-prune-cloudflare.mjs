// List and delete stale tahcode-preview Worker versions / unused aliases.
// Production (`tahcode`) and staging (`tahcode-staging`) are never touched.
import { slugPreviewName } from "./convex-preview-names.mjs";
import { PREVIEW_WORKER_NAME } from "./wrangler-classify.mjs";

export { PREVIEW_WORKER_NAME };

export const CLOUDFLARE_API_BASE = "https://api.cloudflare.com/client/v4";
export const KEEP_PREVIEW_VERSIONS_DEFAULT = 10;
export const FORBIDDEN_WORKER_NAMES = new Set([
  "tahcode",
  "tahcode-staging",
  "team-harness",
  "team-harness-staging",
]);
export const FORBIDDEN_ALIASES = new Set([
  "dev",
  "local",
  "prod",
  "production",
  "staging",
]);

export function assertPreviewWorkerName(name) {
  const worker = String(name ?? "").trim();
  if (worker !== PREVIEW_WORKER_NAME || FORBIDDEN_WORKER_NAMES.has(worker)) {
    throw new Error(
      `Refusing to prune Worker "${worker || "(empty)"}". Only ${PREVIEW_WORKER_NAME} is allowed.`
    );
  }
  return worker;
}

export function parseJsonObject(text) {
  try {
    return JSON.parse(String(text ?? ""));
  } catch {
    return null;
  }
}

export function parseCloudflareResultList(payload) {
  if (Array.isArray(payload)) {
    return payload;
  }
  if (Array.isArray(payload?.result)) {
    return payload.result;
  }
  if (Array.isArray(payload?.result?.items)) {
    return payload.result.items;
  }
  if (Array.isArray(payload?.versions)) {
    return payload.versions;
  }
  if (Array.isArray(payload?.previews)) {
    return payload.previews;
  }
  return [];
}

export function versionIdOf(version) {
  const id = version?.id ?? version?.version_id ?? version?.versionId;
  return typeof id === "string" && id ? id : "";
}

export function versionCreatedAt(version) {
  const raw =
    version?.metadata?.created_on ??
    version?.created_on ??
    version?.createdOn ??
    "";
  const parsed = Date.parse(String(raw));
  return Number.isFinite(parsed) ? parsed : 0;
}

export function aliasFromVersion(version) {
  const annotations = version?.annotations ?? {};
  const alias =
    annotations["workers/preview-alias"] ??
    annotations["preview-alias"] ??
    version?.preview_alias ??
    version?.previewAlias;
  return typeof alias === "string" && alias.trim() ? alias.trim() : "";
}

export function parsePreviewAliases(payload) {
  const items = parseCloudflareResultList(payload);
  const aliases = [];
  const seen = new Set();
  for (const item of items) {
    const name = String(
      item?.alias ?? item?.name ?? item?.preview_identifier ?? item?.id ?? ""
    ).trim();
    if (!name || seen.has(name)) {
      continue;
    }
    seen.add(name);
    aliases.push({
      name,
      versionId: versionIdOf(item.version ?? item) || versionIdOf(item),
    });
  }
  return aliases;
}

export function aliasesFromVersions(versions) {
  const aliases = [];
  for (const version of versions ?? []) {
    const name = aliasFromVersion(version);
    if (!name) {
      continue;
    }
    aliases.push({ name, versionId: versionIdOf(version) });
  }
  return aliases;
}

export function mergeAliases(...lists) {
  const seen = new Set();
  const out = [];
  for (const list of lists) {
    for (const alias of list ?? []) {
      const name = String(alias.name ?? "").trim();
      if (!name || seen.has(name)) {
        continue;
      }
      seen.add(name);
      out.push({ name, versionId: alias.versionId ?? "" });
    }
  }
  return out;
}

export function deployedVersionIdsFrom(deployments) {
  const ids = new Set();
  for (const deployment of deployments ?? []) {
    for (const version of deployment.versions ?? []) {
      const id = versionIdOf(version);
      const percentage = Number(version.percentage ?? version.percent ?? 0);
      if (id && percentage > 0) {
        ids.add(id);
      }
    }
    const direct = versionIdOf(deployment);
    if (direct) {
      ids.add(direct);
    }
  }
  return ids;
}

export function isProtectedAlias(name, openAliases) {
  const slug = slugPreviewName(name);
  if (!slug || FORBIDDEN_ALIASES.has(slug)) {
    return true;
  }
  return openAliases.has(slug);
}

export function planCloudflarePreviewPrune(input) {
  const worker = assertPreviewWorkerName(input.worker ?? PREVIEW_WORKER_NAME);
  const openAliases = new Set(
    [...(input.openAliases ?? [])]
      .map((name) => slugPreviewName(name))
      .filter(Boolean)
  );
  const keepVersions = input.keepVersions ?? KEEP_PREVIEW_VERSIONS_DEFAULT;
  const versions = [...(input.versions ?? [])].sort(
    (left, right) => versionCreatedAt(right) - versionCreatedAt(left)
  );
  const deployed = input.deployedVersionIds ?? new Set();
  const newest = new Set(
    versions
      .slice(0, Math.max(0, keepVersions))
      .map((version) => versionIdOf(version))
  );
  const aliases = mergeAliases(input.aliases, aliasesFromVersions(versions));
  const protectedVersionIds = new Set(deployed);
  for (const id of newest) {
    if (id) {
      protectedVersionIds.add(id);
    }
  }
  for (const alias of aliases) {
    if (isProtectedAlias(alias.name, openAliases) && alias.versionId) {
      protectedVersionIds.add(alias.versionId);
    }
  }

  const aliasDeletes = [];
  const aliasKept = [];
  for (const alias of aliases) {
    if (isProtectedAlias(alias.name, openAliases)) {
      aliasKept.push({ ...alias, reason: "protected" });
      continue;
    }
    aliasDeletes.push({ ...alias, reason: "unused-alias" });
  }

  const versionDeletes = [];
  const versionKept = [];
  const seenVersions = new Set();
  for (const version of versions) {
    const id = versionIdOf(version);
    if (!id || seenVersions.has(id)) {
      continue;
    }
    seenVersions.add(id);
    if (protectedVersionIds.has(id)) {
      const reason = deployed.has(id)
        ? "deployed"
        : newest.has(id)
          ? "recent"
          : "open-pr-alias";
      versionKept.push({
        alias: aliasFromVersion(version),
        createdAt: versionCreatedAt(version),
        id,
        reason,
      });
      continue;
    }
    versionDeletes.push({
      alias: aliasFromVersion(version),
      createdAt: versionCreatedAt(version),
      id,
      reason: "unused-version",
    });
  }

  return {
    aliasDeletes,
    aliasKept,
    versionDeletes,
    versionKept,
    worker,
  };
}

async function cloudflareRequest(input) {
  const fetchImpl = input.fetchImpl ?? fetch;
  const response = await fetchImpl(`${CLOUDFLARE_API_BASE}${input.path}`, {
    headers: {
      Authorization: `Bearer ${input.token}`,
      "Content-Type": "application/json",
    },
    method: input.method ?? "GET",
  });
  const text = await response.text();
  return {
    json: parseJsonObject(text),
    ok: response.ok,
    status: response.status,
    text,
  };
}

export async function listPreviewWorkerVersions(input) {
  assertPreviewWorkerName(input.worker);
  const listed = [];
  let page = 1;
  const perPage = input.perPage ?? 50;
  const maxPages = input.maxPages ?? 10;
  while (page <= maxPages) {
    const result = await cloudflareRequest({
      fetchImpl: input.fetchImpl,
      path: `/accounts/${encodeURIComponent(input.accountId)}/workers/scripts/${encodeURIComponent(input.worker)}/versions?per_page=${perPage}&page=${page}`,
      token: input.token,
    });
    if (!result.ok) {
      return { ...result, kind: "error", versions: listed };
    }
    const pageItems = parseCloudflareResultList(result.json);
    listed.push(...pageItems);
    const totalPages = Number(result.json?.result_info?.total_pages ?? 1);
    if (pageItems.length < perPage || page >= totalPages) {
      break;
    }
    page += 1;
  }
  return { kind: "ok", versions: listed };
}

export async function listPreviewWorkerDeployments(input) {
  assertPreviewWorkerName(input.worker);
  const result = await cloudflareRequest({
    fetchImpl: input.fetchImpl,
    path: `/accounts/${encodeURIComponent(input.accountId)}/workers/scripts/${encodeURIComponent(input.worker)}/deployments`,
    token: input.token,
  });
  if (!result.ok) {
    return { ...result, deployments: [], kind: "error" };
  }
  return {
    deployments: parseCloudflareResultList(result.json),
    kind: "ok",
  };
}

export async function listPreviewWorkerAliases(input) {
  assertPreviewWorkerName(input.worker);
  const paths = [
    `/accounts/${encodeURIComponent(input.accountId)}/workers/workers/${encodeURIComponent(input.worker)}/previews`,
    `/accounts/${encodeURIComponent(input.accountId)}/workers/scripts/${encodeURIComponent(input.worker)}/previews`,
  ];
  for (const path of paths) {
    const result = await cloudflareRequest({
      fetchImpl: input.fetchImpl,
      path,
      token: input.token,
    });
    if (result.ok) {
      return { aliases: parsePreviewAliases(result.json), kind: "ok" };
    }
    if (result.status !== 404) {
      return { ...result, aliases: [], kind: "error" };
    }
  }
  return { aliases: [], kind: "missing" };
}

export async function deletePreviewWorkerAlias(input) {
  assertPreviewWorkerName(input.worker);
  const slug = slugPreviewName(input.alias);
  if (!slug || FORBIDDEN_ALIASES.has(slug)) {
    return { kind: "forbidden" };
  }
  const paths = [
    `/accounts/${encodeURIComponent(input.accountId)}/workers/workers/${encodeURIComponent(input.worker)}/previews/${encodeURIComponent(slug)}`,
    `/accounts/${encodeURIComponent(input.accountId)}/workers/scripts/${encodeURIComponent(input.worker)}/previews/${encodeURIComponent(slug)}`,
  ];
  for (const path of paths) {
    const result = await cloudflareRequest({
      fetchImpl: input.fetchImpl,
      method: "DELETE",
      path,
      token: input.token,
    });
    if (result.ok || result.status === 404) {
      return { kind: result.ok ? "ok" : "missing" };
    }
    if (result.status !== 404) {
      return { ...result, kind: "error" };
    }
  }
  return { kind: "missing" };
}

export async function deletePreviewWorkerVersion(input) {
  assertPreviewWorkerName(input.worker);
  const paths = [
    `/accounts/${encodeURIComponent(input.accountId)}/workers/scripts/${encodeURIComponent(input.worker)}/versions/${encodeURIComponent(input.versionId)}`,
    `/accounts/${encodeURIComponent(input.accountId)}/workers/workers/${encodeURIComponent(input.worker)}/versions/${encodeURIComponent(input.versionId)}`,
  ];
  for (const path of paths) {
    const result = await cloudflareRequest({
      fetchImpl: input.fetchImpl,
      method: "DELETE",
      path,
      token: input.token,
    });
    if (result.ok || result.status === 404) {
      return { kind: result.ok ? "ok" : "missing" };
    }
  }
  return { kind: "error", status: 404 };
}

export async function collectCloudflarePreviewState(input) {
  const worker = assertPreviewWorkerName(input.worker ?? PREVIEW_WORKER_NAME);
  const versionsResult = await listPreviewWorkerVersions({ ...input, worker });
  const deploymentsResult = await listPreviewWorkerDeployments({
    ...input,
    worker,
  });
  const aliasesResult = await listPreviewWorkerAliases({ ...input, worker });
  return {
    aliases: aliasesResult.aliases ?? [],
    aliasesKind: aliasesResult.kind,
    deployedVersionIds: deployedVersionIdsFrom(deploymentsResult.deployments),
    deploymentsKind: deploymentsResult.kind,
    versions: versionsResult.versions ?? [],
    versionsKind: versionsResult.kind,
    worker,
  };
}
