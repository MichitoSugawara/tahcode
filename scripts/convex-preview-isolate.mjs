// Isolate a per-PR Convex preview when the team deployment quota is full.
//
// `npx convex deploy --preview-name pr-N` calls claim_preview_deployment.
// At quota, that API returns DeploymentQuotaReached for names that do not
// already exist — including the stable `pr-N` — and CI used to walk merged
// branch slugs until one leftover reused. Every open PR then stamped the
// same leftover (zany-owl-295), so Cloudflare stayed per-PR while Convex
// was last-writer-wins.
//
// Preview deploy keys can DELETE preview deployments via the Management API.
// We claim a stale leftover only to learn its deployment name, delete it,
// then retry `pr-N` so this PR gets its own functions.

export const CLAIM_PREVIEW_URL =
  "https://api.convex.dev/api/claim_preview_deployment";
export const MANAGEMENT_API_BASE = "https://api.convex.dev/v1";
export const PREVIEW_TOOL_CANARIES = [
  "list_connectors",
  "get_connector_status",
  "list_linear_issues",
];
export const DELETE_SETTLE_MS = 8000;
export const MAX_PRUNE_DELETES = 3;
export const FORBIDDEN_IDENTIFIERS = new Set([
  "dev",
  "local",
  "prod",
  "production",
  "staging",
]);

const PREVIEW_ANNOUNCEMENT_RE =
  /\[Preview\]\s+\S+:preview\/([^\s(]+)\s+\(dashboard:\s+https:\/\/dashboard\.convex\.dev\/t\/[^/]+\/[^/]+\/([^)\s]+)/;
const DEPLOYED_FUNCTIONS_URL_RE =
  /Deployed Convex functions to https:\/\/([a-z0-9-]+)\.convex\.cloud/;
const QUOTA_REACHED_RE = /DeploymentQuotaReached/i;
const NOT_FOUND_RE = /not found/i;

export function parsePreviewDeployKey(value) {
  const raw = String(value ?? "").trim();
  const prefix = raw.split("|")[0] ?? "";
  const parts = prefix.split(":");
  if (parts[0] !== "preview" || parts.length !== 3 || !parts[1] || !parts[2]) {
    return null;
  }
  return { projectSlug: parts[2], teamSlug: parts[1] };
}

export function previewKeyAuthHeader(deployKey) {
  return `Bearer ${deployKey}`;
}

export function managementHeaders(
  deployKey,
  client = "tahcode-preview-isolate"
) {
  return {
    Authorization: previewKeyAuthHeader(deployKey),
    "Convex-Client": client,
  };
}

export function parseJsonObject(text) {
  try {
    return JSON.parse(String(text ?? ""));
  } catch {
    return null;
  }
}

export function deploymentTypeOf(deployment) {
  return String(
    deployment?.deployment_type ??
      deployment?.deploymentType ??
      deployment?.kind ??
      ""
  ).toLowerCase();
}

export function isPreviewDeploymentRecord(deployment) {
  return deploymentTypeOf(deployment) === "preview";
}

export function isUntouchableDeploymentType(deployment) {
  const type = deploymentTypeOf(deployment);
  return (
    type === "prod" ||
    type === "production" ||
    type === "dev" ||
    type === "custom"
  );
}

export function previewIdentifierFromDeployment(deployment) {
  const reference = String(
    deployment?.reference ?? deployment?.previewReference ?? ""
  );
  const matched = reference.match(/^preview\/(.+)$/i);
  if (matched?.[1]) {
    return matched[1].trim();
  }
  const direct =
    deployment?.previewName ??
    deployment?.preview_name ??
    deployment?.identifier ??
    deployment?.preview_identifier;
  if (typeof direct === "string" && direct.trim()) {
    return direct.trim();
  }
  return null;
}

export function parseDeploymentList(payload) {
  if (Array.isArray(payload)) {
    return payload;
  }
  if (Array.isArray(payload?.deployments)) {
    return payload.deployments;
  }
  if (Array.isArray(payload?.items)) {
    return payload.items;
  }
  if (Array.isArray(payload?.result)) {
    return payload.result;
  }
  return [];
}

function projectIdFrom(payload) {
  if (typeof payload?.id === "number" || typeof payload?.id === "string") {
    return String(payload.id);
  }
  if (
    typeof payload?.project?.id === "number" ||
    typeof payload?.project?.id === "string"
  ) {
    return String(payload.project.id);
  }
  if (
    typeof payload?.projectId === "number" ||
    typeof payload?.projectId === "string"
  ) {
    return String(payload.projectId);
  }
  return "";
}

function deploymentNameFrom(payload) {
  if (typeof payload?.name === "string" && payload.name) {
    return payload.name;
  }
  if (typeof payload?.deploymentName === "string" && payload.deploymentName) {
    return payload.deploymentName;
  }
  if (
    typeof payload?.deployment?.name === "string" &&
    payload.deployment.name
  ) {
    return payload.deployment.name;
  }
  return "";
}

export function isForbiddenPreviewIdentifier(name) {
  const slug = String(name ?? "")
    .trim()
    .toLowerCase();
  return !slug || FORBIDDEN_IDENTIFIERS.has(slug);
}

export function isProtectedPreviewName(name, input) {
  const slug = String(name ?? "");
  if (!slug || isForbiddenPreviewIdentifier(slug)) {
    return true;
  }
  if (slug === input.preferred) {
    return true;
  }
  return input.exclude.has(slug);
}

export function pruneNameCandidates(input) {
  const exclude = new Set(input.exclude ?? []);
  const seen = new Set();
  const out = [];
  for (const raw of input.names ?? []) {
    const name = String(raw ?? "").trim();
    if (
      !name ||
      seen.has(name) ||
      isProtectedPreviewName(name, {
        exclude,
        preferred: input.preferred,
      })
    ) {
      continue;
    }
    seen.add(name);
    out.push(name);
  }
  return out;
}

export function parseClaimedPreviewFromDeployOutput(text) {
  const output = String(text ?? "");
  const labeled = output.match(PREVIEW_ANNOUNCEMENT_RE);
  if (labeled) {
    return {
      deploymentName: labeled[2],
      previewName: labeled[1],
    };
  }
  const url = output.match(DEPLOYED_FUNCTIONS_URL_RE);
  if (url) {
    return { deploymentName: url[1], previewName: null };
  }
  return null;
}

export function functionSpecHasCanaryTools(
  specText,
  canaries = PREVIEW_TOOL_CANARIES
) {
  const text = String(specText ?? "");
  if (!text.includes("agentTools")) {
    return false;
  }
  return canaries.every(
    (name) => text.includes(`"${name}"`) || text.includes(name)
  );
}

export async function claimPreviewDeployment(input) {
  const slugs = parsePreviewDeployKey(input.deployKey);
  if (!slugs) {
    return { kind: "invalid-key" };
  }
  const fetchImpl = input.fetchImpl ?? fetch;
  const response = await fetchImpl(CLAIM_PREVIEW_URL, {
    body: JSON.stringify({
      identifier: input.identifier,
      projectSelection: {
        kind: "teamAndProjectSlugs",
        projectSlug: slugs.projectSlug,
        teamSlug: slugs.teamSlug,
      },
      reuse: true,
    }),
    headers: {
      ...managementHeaders(input.deployKey),
      "Content-Type": "application/json",
    },
    method: "POST",
  });
  const bodyText = await response.text();
  if (response.ok) {
    let data = {};
    try {
      data = JSON.parse(bodyText);
    } catch {
      return { body: bodyText, kind: "error", status: response.status };
    }
    if (typeof data.deploymentName === "string" && data.deploymentName) {
      return {
        adminKey: data.adminKey,
        deploymentName: data.deploymentName,
        instanceUrl: data.instanceUrl,
        kind: "ok",
      };
    }
    return { body: bodyText, kind: "error", status: response.status };
  }
  if (QUOTA_REACHED_RE.test(bodyText)) {
    return { kind: "quota" };
  }
  return { body: bodyText, kind: "error", status: response.status };
}

export async function deletePreviewDeployment(input) {
  const fetchImpl = input.fetchImpl ?? fetch;
  const response = await fetchImpl(
    `${MANAGEMENT_API_BASE}/deployments/${encodeURIComponent(input.deploymentName)}/delete`,
    {
      headers: managementHeaders(input.deployKey),
      method: "POST",
    }
  );
  if (response.ok) {
    return { kind: "ok" };
  }
  const body = await response.text();
  if (response.status === 404 || NOT_FOUND_RE.test(body)) {
    return { kind: "missing" };
  }
  return { body, kind: "error", status: response.status };
}

export async function getProjectBySlug(input) {
  const slugs = parsePreviewDeployKey(input.deployKey);
  if (!slugs) {
    return { kind: "invalid-key" };
  }
  const fetchImpl = input.fetchImpl ?? fetch;
  const response = await fetchImpl(
    `${MANAGEMENT_API_BASE}/teams/${encodeURIComponent(slugs.teamSlug)}/projects/${encodeURIComponent(slugs.projectSlug)}`,
    { headers: managementHeaders(input.deployKey) }
  );
  const bodyText = await response.text();
  if (!response.ok) {
    return { body: bodyText, kind: "error", status: response.status };
  }
  const data = parseJsonObject(bodyText);
  const projectId = projectIdFrom(data);
  if (!projectId) {
    return { body: bodyText, kind: "error", status: response.status };
  }
  return { kind: "ok", projectId, slugs };
}

export async function listProjectDeployments(input) {
  const slugs = parsePreviewDeployKey(input.deployKey);
  if (!slugs) {
    return { kind: "invalid-key" };
  }
  const fetchImpl = input.fetchImpl ?? fetch;
  const paths = [];
  if (input.projectId) {
    paths.push(
      `${MANAGEMENT_API_BASE}/projects/${encodeURIComponent(input.projectId)}/list_deployments`,
      `${MANAGEMENT_API_BASE}/projects/${encodeURIComponent(input.projectId)}/deployments/list`
    );
  }
  paths.push(
    `${MANAGEMENT_API_BASE}/teams/${encodeURIComponent(slugs.teamSlug)}/projects/${encodeURIComponent(slugs.projectSlug)}/list_deployments`
  );
  let lastError = { body: "", kind: "error", status: 0 };
  for (const url of paths) {
    const response = await fetchImpl(url, {
      headers: managementHeaders(input.deployKey),
    });
    const bodyText = await response.text();
    if (!response.ok) {
      lastError = { body: bodyText, kind: "error", status: response.status };
      continue;
    }
    const deployments = parseDeploymentList(parseJsonObject(bodyText));
    return { deployments, kind: "ok" };
  }
  return lastError;
}

export async function getDeploymentByName(input) {
  const fetchImpl = input.fetchImpl ?? fetch;
  const response = await fetchImpl(
    `${MANAGEMENT_API_BASE}/deployments/${encodeURIComponent(input.deploymentName)}`,
    { headers: managementHeaders(input.deployKey) }
  );
  const bodyText = await response.text();
  if (response.status === 404 || NOT_FOUND_RE.test(bodyText)) {
    return { kind: "missing" };
  }
  if (!response.ok) {
    return { body: bodyText, kind: "error", status: response.status };
  }
  const data = parseJsonObject(bodyText);
  const deploymentName = deploymentNameFrom(data) || input.deploymentName;
  if (!data || !deploymentName) {
    return { body: bodyText, kind: "error", status: response.status };
  }
  return { deployment: { ...data, name: deploymentName }, kind: "ok" };
}

export async function getPreviewDeploymentByReference(input) {
  const slugs = parsePreviewDeployKey(input.deployKey);
  if (!slugs) {
    return { kind: "invalid-key" };
  }
  if (isForbiddenPreviewIdentifier(input.identifier)) {
    return { kind: "forbidden" };
  }
  const fetchImpl = input.fetchImpl ?? fetch;
  const reference = `preview/${input.identifier}`;
  const url = `${MANAGEMENT_API_BASE}/teams/${encodeURIComponent(slugs.teamSlug)}/projects/${encodeURIComponent(slugs.projectSlug)}/deployment?reference=${encodeURIComponent(reference)}`;
  const response = await fetchImpl(url, {
    headers: managementHeaders(input.deployKey),
  });
  const bodyText = await response.text();
  if (response.status === 404 || NOT_FOUND_RE.test(bodyText)) {
    return { kind: "missing" };
  }
  if (!response.ok) {
    return { body: bodyText, kind: "error", status: response.status };
  }
  const data = parseJsonObject(bodyText);
  const deploymentName = deploymentNameFrom(data);
  if (!deploymentName) {
    return { body: bodyText, kind: "error", status: response.status };
  }
  return {
    deployment: { ...data, name: deploymentName },
    deploymentName,
    kind: "ok",
  };
}

/**
 * Resolve a preview identifier to a deployment name without inventing one.
 * Prefer the Management API GET-by-reference; fall back to claim (reuse).
 */
export async function resolvePreviewDeployment(input) {
  if (isForbiddenPreviewIdentifier(input.identifier)) {
    return { kind: "forbidden" };
  }
  const byRef = await getPreviewDeploymentByReference(input);
  if (byRef.kind === "ok") {
    if (
      byRef.deployment &&
      deploymentTypeOf(byRef.deployment) &&
      !isPreviewDeploymentRecord(byRef.deployment)
    ) {
      return { kind: "forbidden", deployment: byRef.deployment };
    }
    return byRef;
  }
  if (input.allowClaim === false) {
    return byRef;
  }
  const claimed = await claimPreviewDeployment(input);
  if (claimed.kind === "ok") {
    return {
      deploymentName: claimed.deploymentName,
      instanceUrl: claimed.instanceUrl,
      kind: "ok",
    };
  }
  if (claimed.kind === "quota") {
    return { kind: "missing" };
  }
  return claimed;
}

/**
 * Delete stale leftover previews so `preferred` can be claimed.
 * Never deletes open-PR names (`exclude`) or the preferred identifier.
 */
export async function isolatePreferredPreview(input) {
  const targets = pruneNameCandidates({
    exclude: input.exclude,
    names: input.pruneNames,
    preferred: input.preferred,
  });
  const deleted = [];
  const errors = [];
  for (const identifier of targets) {
    if (deleted.length >= (input.maxDeletes ?? MAX_PRUNE_DELETES)) {
      break;
    }
    const claimed = await claimPreviewDeployment({
      deployKey: input.deployKey,
      fetchImpl: input.fetchImpl,
      identifier,
    });
    if (claimed.kind === "error" || claimed.kind === "invalid-key") {
      errors.push({ identifier, stage: "claim", ...claimed });
      continue;
    }
    if (claimed.kind !== "ok") {
      continue;
    }
    const removed = await deletePreviewDeployment({
      deployKey: input.deployKey,
      deploymentName: claimed.deploymentName,
      fetchImpl: input.fetchImpl,
    });
    if (removed.kind === "ok" || removed.kind === "missing") {
      deleted.push({
        deploymentName: claimed.deploymentName,
        identifier,
      });
      continue;
    }
    errors.push({
      deploymentName: claimed.deploymentName,
      identifier,
      stage: "delete",
      ...removed,
    });
  }
  return { deleted, errors };
}
