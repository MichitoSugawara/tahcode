// Convex preview identifiers for CI.
// Unique per-branch names (`cursor-…-40chars`) fill the team quota (40).
// Prefer a stable `pr-<number>`. On DeploymentQuotaReached, prune a stale
// leftover (closed/merged branch) and retry `pr-<number>` instead of sharing.

export const PREVIEW_NAME_MAX = 40;
export const SHARED_PREVIEW_NAME = "ci";

export function slugPreviewName(raw, max = PREVIEW_NAME_MAX) {
  const slug = String(raw ?? "")
    .trim()
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/^-+|-+$/g, "");
  return slug.slice(0, max);
}

export function splitNameList(value) {
  if (!value) {
    return [];
  }
  return String(value)
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

export function isDeploymentQuotaError(text) {
  return /DeploymentQuotaReached/i.test(String(text ?? ""));
}

/** Reused previews sometimes race `convex deploy --cmd` against env writes. */
export function isEnvChangedDuringPush(text) {
  return /Environment variables have changed during push/i.test(
    String(text ?? "")
  );
}

export function nextPreviewClaim(candidates, failedName) {
  const index = candidates.indexOf(failedName);
  if (index === -1) {
    return candidates[0] ?? null;
  }
  return candidates[index + 1] ?? null;
}

/** Open-PR slugs plus the preferred `pr-N` must never be deleted to free quota. */
export function protectedPreviewNames(input) {
  const names = new Set(
    splitNameList(input.exclude)
      .map((name) => slugPreviewName(name))
      .filter((name) => name.length > 0)
  );
  const preferred = slugPreviewName(input.preferred);
  if (preferred) {
    names.add(preferred);
  }
  names.add(SHARED_PREVIEW_NAME);
  return names;
}

/**
 * Ordered claim attempts: preferred first, then the shared `ci` name, then
 * fallbacks (typically merged-PR branch slugs). Open-PR names are excluded
 * so we do not steal an in-flight preview.
 */
export function previewNameCandidates(input) {
  const exclude = new Set(
    splitNameList(input.exclude)
      .map((name) => slugPreviewName(name))
      .filter((name) => name.length > 0)
  );
  const seen = new Set();
  const out = [];
  const push = (raw) => {
    const slug = slugPreviewName(raw);
    if (!slug || seen.has(slug) || exclude.has(slug)) {
      return;
    }
    seen.add(slug);
    out.push(slug);
  };
  push(input.preferred);
  push(SHARED_PREVIEW_NAME);
  for (const name of splitNameList(input.fallbacks)) {
    push(name);
  }
  return out;
}
