// Shared classification for Cloudflare preview deploys.
// Preview retries transient API/connectivity failures. Staging/production do
// not retry and never auto-create R2 buckets.

export const PREVIEW_R2_BUCKET = "team-harness-files-preview";
export const PREVIEW_WORKER_NAME = "tahcode-preview";

export const PREVIEW_RETRY = {
  factor: 2,
  initialMs: 2000,
  maxAttempts: 5,
  maxMs: 16_000,
};

const ANSI_ESCAPE = new RegExp(`${String.fromCodePoint(0x1b)}\\[[0-9;]*m`, "g");

const WORKER_MISSING = [
  /does not yet exist/i,
  /has not been created/i,
  /Worker does not exist/i,
  /You haven't deployed this Worker yet/i,
];

const R2_MISSING = [
  /R2 bucket ['"`]?[\w-]+['"`]? does not exist/i,
  /Please create it with `?wrangler r2 bucket create/i,
  /The specified bucket does not exist/i,
  /Could not find bucket/i,
  /binding FILES refers to .*bucket that does not exist/i,
];

const AUTH = [
  /Invalid API token/i,
  /Authentication error/i,
  /401 Unauthorized/i,
  /error code:?\s*9109/i,
  /not authorized to access/i,
];

const TRANSIENT = [
  /fetch failed/i,
  /likely due to a connectivity issue/i,
  /ECONNRESET/i,
  /ETIMEDOUT/i,
  /ENOTFOUND/i,
  /EAI_AGAIN/i,
  /EPIPE/i,
  /socket hang up/i,
  /UND_ERR_/i,
  /network timeout/i,
  /503 Service Unavailable/i,
  /502 Bad Gateway/i,
  /504 Gateway Timeout/i,
  /429 Too Many Requests/i,
  /rate.?limit/i,
  /A request to the Cloudflare API \(.+\) failed/i,
];

const CREATE_EXISTS = [
  /already exists/i,
  /The bucket you are trying to create already exists/i,
];

export function stripAnsi(text) {
  return text.replace(ANSI_ESCAPE, "");
}

function matchesAny(text, patterns) {
  return patterns.some((pattern) => pattern.test(text));
}

export function classifyWranglerOutput(output, status = 1) {
  if (status === 0) {
    return "ok";
  }
  const text = stripAnsi(output);
  if (matchesAny(text, AUTH)) {
    return "auth";
  }
  if (matchesAny(text, WORKER_MISSING)) {
    return "worker_missing";
  }
  if (matchesAny(text, R2_MISSING)) {
    return "r2_missing";
  }
  if (matchesAny(text, TRANSIENT)) {
    return "transient";
  }
  return "unknown";
}

export function classifyCreateOutput(output, status = 1) {
  if (status === 0) {
    return "ok";
  }
  const text = stripAnsi(output);
  if (matchesAny(text, CREATE_EXISTS)) {
    return "already_exists";
  }
  return classifyWranglerOutput(text, status);
}

export function nextBackoffMs(failedAttempt, retry = PREVIEW_RETRY) {
  if (failedAttempt < 1) {
    throw new Error("failedAttempt must be >= 1");
  }
  return Math.min(
    retry.maxMs,
    retry.initialMs * retry.factor ** (failedAttempt - 1)
  );
}

export function nextDeployAction(state) {
  const { bootstrapped, ensuredR2, kind, maxAttempts, name, transientAttempt } =
    state;
  if (kind === "ok") {
    return { type: "succeed" };
  }
  if (
    kind === "transient" &&
    name === "preview" &&
    transientAttempt < maxAttempts
  ) {
    return { backoffMs: nextBackoffMs(transientAttempt), type: "retry" };
  }
  if (kind === "worker_missing" && !bootstrapped) {
    return { type: "bootstrap" };
  }
  if (kind === "r2_missing" && name === "preview" && !ensuredR2) {
    return { type: "ensure_r2" };
  }
  return { type: "fail" };
}

export function previewSkipReason(input) {
  if (input.name !== "preview") {
    return null;
  }
  if (!(input.token || input.accountId)) {
    return "CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID are not set after decrypt";
  }
  if (!input.token) {
    return "CLOUDFLARE_API_TOKEN is not set after decrypt";
  }
  if (!input.accountId) {
    return "CLOUDFLARE_ACCOUNT_ID is not set after decrypt";
  }
  return null;
}

export function toConvexSiteUrl(convexUrl) {
  if (!convexUrl) {
    return "";
  }
  return convexUrl.endsWith(".convex.cloud")
    ? `${convexUrl.slice(0, -".convex.cloud".length)}.convex.site`
    : convexUrl;
}

export function parseCloudflareUrl(output) {
  const text = stripAnsi(output);
  const aliasMatch = text.match(/Version Preview Alias URL:\s+(\S+)/);
  const previewMatch = text.match(/Version Preview URL:\s+(\S+)/);
  const publishedMatch = text.match(/https:\/\/[a-z0-9.-]+\.workers\.dev\/?/i);
  return aliasMatch?.[1] ?? previewMatch?.[1] ?? publishedMatch?.[0] ?? "";
}

export function parseBucketNames(output) {
  const text = stripAnsi(output).trim();
  const fromJson = bucketsFromJson(text);
  if (fromJson.length > 0) {
    return fromJson;
  }
  const names = [];
  for (const match of text.matchAll(
    /(?:^|\n|│)\s*(?:name:\s*)?([a-z0-9][a-z0-9-]{2,62})(?:\s|│|$)/gi
  )) {
    const name = match[1];
    if (name && !["name", "json", "created"].includes(name.toLowerCase())) {
      names.push(name);
    }
  }
  return [...new Set(names)];
}

function bucketsFromJson(text) {
  const candidates = [];
  const trimmed = text.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    candidates.push(trimmed);
  }
  const embedded = text.match(/\{[\s\S]*"buckets"[\s\S]*\}/);
  if (embedded?.[0]) {
    candidates.push(embedded[0]);
  }
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      const buckets = Array.isArray(parsed)
        ? parsed
        : (parsed.buckets ?? parsed.result?.buckets ?? []);
      if (!Array.isArray(buckets)) {
        continue;
      }
      return buckets
        .map((bucket) => (typeof bucket === "string" ? bucket : bucket?.name))
        .filter((name) => typeof name === "string" && name.length > 0);
    } catch {
      // Try the next candidate.
    }
  }
  return [];
}

export function outputListsBucket(output, bucketName) {
  if (parseBucketNames(output).includes(bucketName)) {
    return true;
  }
  const escaped = bucketName.replaceAll(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|\\s|│)${escaped}(?:\\s|│|$)`, "m").test(
    stripAnsi(output)
  );
}

export function decideEnsureAction(input) {
  if (!(input.tokenPresent && input.accountPresent)) {
    return {
      action: "skip",
      reason:
        "Cloudflare credentials are not set after decrypt; cannot list or create the preview R2 bucket",
    };
  }
  if (input.bucketListed) {
    return { action: "exists" };
  }
  if (input.listStatus !== 0) {
    if (input.listKind === "auth") {
      return {
        action: "skip",
        reason:
          "Cloudflare API token cannot list R2 buckets; skipping auto-create",
      };
    }
    if (
      input.listKind === "transient" &&
      input.listAttempts < input.maxListAttempts
    ) {
      return { action: "retry_list" };
    }
    return { action: "create" };
  }
  return { action: "create" };
}

export function failureHint(kind, name) {
  if (kind === "transient") {
    return name === "preview"
      ? "Wrangler lost connectivity to the Cloudflare API (fetch failed). Preview retries this with backoff; staging/production fail immediately."
      : "Wrangler lost connectivity to the Cloudflare API (fetch failed). Staging/production do not retry this automatically.";
  }
  if (kind === "worker_missing") {
    return `Worker ${PREVIEW_WORKER_NAME} is missing. deploy-stack bootstraps with wrangler deploy --env preview, then retries versions upload.`;
  }
  if (kind === "r2_missing") {
    return `R2 bucket ${PREVIEW_R2_BUCKET} is missing. Preview preflight creates it when credentials allow. Staging/production buckets are never auto-created.`;
  }
  if (kind === "auth") {
    return "Cloudflare authentication failed. Check CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID in the decrypted env file.";
  }
  return "See wrangler stdout/stderr above.";
}

export function readEnvPresence(fileContents, keys, env = process.env) {
  const present = Object.fromEntries(keys.map((key) => [key, false]));
  for (const line of fileContents.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
      continue;
    }
    const index = trimmed.indexOf("=");
    const key = trimmed.slice(0, index);
    if (!Object.hasOwn(present, key)) {
      continue;
    }
    let value = trimmed.slice(index + 1);
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    present[key] = value.length > 0;
  }
  for (const key of keys) {
    if (env[key]) {
      present[key] = true;
    }
  }
  return present;
}
