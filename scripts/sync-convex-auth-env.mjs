// Syncs the Convex Auth environment variables (SITE_URL, JWT_PRIVATE_KEY, JWKS,
// optional OAuth client credentials) onto a Convex deployment from CI.
//
// Why this exists: `npx convex env set "JWKS=${JWKS}"` used to forward the raw
// dotenv value. A JWKS written as JWKS="{\"keys\":...}" keeps the backslashes
// (dotenv does not unescape \" inside double quotes), so the deployment served
// invalid JSON from /.well-known/jwks.json and the backend rejected every JWT
// it had just issued (`AuthProviderDiscoveryFailed`) — sign-up "succeeded" but
// nobody could stay signed in. This script validates both keys with jose, repairs
// the common escaping mistakes, and derives the JWKS from the private key when
// the provided one is missing, malformed, or does not match.
//
// Usage (env vars):
//   SITE_URL          required  public URL of the web app (OAuth redirect target).
//                               Production CI sets https://tahcode.com, not workers.dev.
//   DEPLOY_NAME       optional  preview | staging | production. Production
//                               (or CONVEX_ENV_ARGS containing --prod) fail-closes
//                               if SITE_URL is workers.dev or not the public origin.
//   JWT_PRIVATE_KEY   required  PKCS8 PEM (newlines may be spaces or literal "\n")
//   JWKS              optional  JSON web key set; derived from the key if unusable
//   AUTH_GOOGLE_ID    optional  Google OAuth client id (synced when present)
//   AUTH_GOOGLE_SECRET optional Google OAuth client secret (synced when present)
//   OPENCONNECTOR_*   optional  self-hosted OpenConnector admin/runtime tokens
//                               and base URL (synced when present)
//   CONVEX_ENV_ARGS   optional  deployment selector flags, e.g. "--prod" or
//                               "--preview-name my-branch"
//   DRY_RUN=1         optional  print what would change without calling convex
import { spawnSync } from "node:child_process";

import { exportJWK, importPKCS8 } from "jose";

import {
  parseConvexEnvGetOutput,
  productionSiteUrlError,
  resolvePublicSiteUrl,
} from "./wrangler-classify.mjs";

const dryRun = process.env.DRY_RUN === "1";
const convexArgs = (process.env.CONVEX_ENV_ARGS ?? "")
  .split(/\s+/)
  .filter(Boolean);

function fail(message) {
  console.error(`::error::${message}`);
  process.exit(1);
}

function warn(message) {
  console.log(`::warning::${message}`);
}

/** Undo the escaping that survives a dotenv round-trip: \" -> " and \n -> newline. */
function unescapeDotenv(value) {
  return value.replaceAll('\\"', '"').replaceAll("\\n", "\n");
}

/** Drop private JWK fields (d/p/q/…) so JWKS published to Convex is public-only. */
function publicOnlyJwks(jwks) {
  if (!jwks || !Array.isArray(jwks.keys)) {
    throw new Error("JWKS must be an object with a keys array");
  }
  const fields = ["alg", "crv", "e", "kid", "kty", "n", "use", "x", "y"];
  return {
    keys: jwks.keys.map((key) => {
      const next = {};
      for (const field of fields) {
        if (typeof key[field] === "string") {
          next[field] = key[field];
        }
      }
      return next;
    }),
  };
}

function tryParseJwks(raw) {
  try {
    const parsed = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.keys) && parsed.keys.length > 0) {
      return parsed;
    }
  } catch {
    // not JSON
  }
  return null;
}

async function normalizePrivateKey(raw) {
  const candidates = [raw.trim(), unescapeDotenv(raw).trim()];
  for (const candidate of candidates) {
    try {
      const key = await importPKCS8(candidate, "RS256");
      return { key, pem: candidate };
    } catch {
      // try the next candidate
    }
  }
  return null;
}

function setEnv(name, value) {
  if (dryRun) {
    console.log(
      `[dry-run] convex env set ${convexArgs.join(" ")} ${name}=<${value.length} chars>`
    );
    return;
  }
  // Single "NAME=value" argument (convex splits on the first '='). Passing the
  // value as a separate argv element makes commander treat a leading '-' (the
  // PEM's "-----BEGIN") as an unknown option, so this form is required.
  const result = spawnSync(
    "npx",
    ["convex", "env", "set", ...convexArgs, `${name}=${value}`],
    {
      env: process.env,
      stdio: "inherit",
    }
  );
  if (result.status !== 0) {
    fail(`convex env set ${name} failed (exit ${result.status ?? "signal"})`);
  }
}

function isProductionDeploy() {
  const name = (process.env.DEPLOY_NAME ?? "").trim();
  if (name === "production") {
    return true;
  }
  return convexArgs.includes("--prod");
}

function expectedProductionSiteUrl() {
  return resolvePublicSiteUrl({
    name: "production",
    override: process.env.PUBLIC_SITE_URL,
  });
}

function assertProductionSiteUrl(effective, label) {
  if (!isProductionDeploy()) {
    return;
  }
  const err = productionSiteUrlError(effective, expectedProductionSiteUrl());
  if (err) {
    fail(`${label}: ${err}`);
  }
}

function getEnv(name) {
  const result = spawnSync(
    "npx",
    ["convex", "env", "get", ...convexArgs, name],
    {
      encoding: "utf-8",
      env: process.env,
    }
  );
  if (result.status !== 0) {
    fail(`convex env get ${name} failed (exit ${result.status ?? "signal"})`);
  }
  return parseConvexEnvGetOutput(
    `${result.stdout ?? ""}${result.stderr ?? ""}`
  );
}

function assertEffectiveProductionSiteUrl() {
  if (!isProductionDeploy() || dryRun) {
    return;
  }
  const effective = getEnv("SITE_URL");
  assertProductionSiteUrl(effective, "Convex deployment SITE_URL after sync");
  console.log(`Verified production SITE_URL=${effective}`);
}

function syncOptionalConnectorEnv() {
  const pairs = [
    ["OPENCONNECTOR_BASE_URL", process.env.OPENCONNECTOR_BASE_URL],
    [
      "OPENCONNECTOR_ADMIN_TOKEN",
      process.env.OPENCONNECTOR_ADMIN_TOKEN ||
        process.env.OOMOL_CONNECT_ADMIN_TOKEN,
    ],
    [
      "OPENCONNECTOR_RUNTIME_TOKEN",
      process.env.OPENCONNECTOR_RUNTIME_TOKEN ||
        process.env.OOMOL_CONNECT_RUNTIME_TOKEN,
    ],
  ];
  const synced = [];
  for (const [name, raw] of pairs) {
    const value = (raw ?? "").trim();
    if (!value) {
      continue;
    }
    setEnv(name, value);
    synced.push(name);
  }
  if (synced.length === 0) {
    console.log(
      "OPENCONNECTOR_* not in env file; leaving dashboard-configured OpenConnector secrets untouched."
    );
    return;
  }
  console.log(`Synced ${synced.join(" / ")}.`);
}

const siteUrl = (process.env.SITE_URL ?? "").trim().replace(/\/$/, "");
if (!siteUrl) {
  fail(
    "SITE_URL is empty; refusing to sync Convex Auth env (OAuth redirects would break)."
  );
}
if (!/^https?:\/\//.test(siteUrl)) {
  fail(`SITE_URL must be an absolute http(s) URL, got: ${siteUrl}`);
}
assertProductionSiteUrl(siteUrl, "Refusing to write SITE_URL");

const rawPrivateKey = process.env.JWT_PRIVATE_KEY ?? "";
if (!rawPrivateKey.trim()) {
  warn(
    "JWT_PRIVATE_KEY is empty; sign-in will fail until the env file is updated. " +
      "Generate a pair with `node scripts/generate-auth-keys.mjs` and add both values to the env file."
  );
  setEnv("SITE_URL", siteUrl);
  syncOptionalConnectorEnv();
  assertEffectiveProductionSiteUrl();
  console.log("Synced SITE_URL only.");
  process.exit(0);
}

const privateKey = await normalizePrivateKey(rawPrivateKey);
if (!privateKey) {
  fail(
    "JWT_PRIVATE_KEY is not a valid PKCS8 RSA private key. Store the PEM on one line " +
      "(newlines replaced by spaces) or with literal \\n sequences inside double quotes."
  );
}

// exportJWK on a private key includes the private components (d, p, q, ...);
// only the public modulus/exponent may ever be published.
const { kty, n, e } = await exportJWK(privateKey.key);
const publicJwk = { e, kty, n };
const derivedJwks = { keys: [{ alg: "RS256", use: "sig", ...publicJwk }] };
const matchesPrivateKey = (jwks) =>
  jwks.keys.some(
    (key) => key.kty === "RSA" && key.n === publicJwk.n && key.e === publicJwk.e
  );

let jwks = null;
let jwksSource = "provided";
const rawJwks = (process.env.JWKS ?? "").trim();
if (rawJwks) {
  jwks = tryParseJwks(rawJwks);
  if (!jwks) {
    jwks = tryParseJwks(unescapeDotenv(rawJwks));
    if (jwks) {
      jwksSource = "provided (repaired escaped quotes)";
      warn(
        'JWKS contained escaped quotes (\\"); repaired before syncing. Store it unquoted or in single quotes in the env file.'
      );
    }
  }
  if (jwks && !matchesPrivateKey(jwks)) {
    warn(
      "JWKS does not contain the public key of JWT_PRIVATE_KEY; deriving the JWKS from the private key instead."
    );
    jwks = null;
  }
}
if (!jwks) {
  jwks = derivedJwks;
  jwksSource = rawJwks
    ? "derived from JWT_PRIVATE_KEY (provided value unusable)"
    : "derived from JWT_PRIVATE_KEY";
}
let publicJwks;
try {
  publicJwks = publicOnlyJwks(jwks);
} catch (error) {
  fail(error instanceof Error ? error.message : "JWKS is not publishable.");
}
const jwksValue = JSON.stringify(publicJwks);
if (!tryParseJwks(jwksValue)) {
  fail("Internal error: computed JWKS is not valid JSON.");
}

setEnv("SITE_URL", siteUrl);
assertEffectiveProductionSiteUrl();
setEnv("JWT_PRIVATE_KEY", privateKey.pem);
setEnv("JWKS", jwksValue);
console.log(
  `Synced SITE_URL=${siteUrl}, JWT_PRIVATE_KEY (valid PKCS8), JWKS (${jwksSource}, ${publicJwks.keys.length} public key(s)).`
);

const googleId = (process.env.AUTH_GOOGLE_ID ?? "").trim();
const googleSecret = (process.env.AUTH_GOOGLE_SECRET ?? "").trim();
if (googleId && googleSecret) {
  setEnv("AUTH_GOOGLE_ID", googleId);
  setEnv("AUTH_GOOGLE_SECRET", googleSecret);
  console.log(
    "Synced Google OAuth client credentials (AUTH_GOOGLE_ID / AUTH_GOOGLE_SECRET)."
  );
} else if (googleId || googleSecret) {
  warn(
    "Only one of AUTH_GOOGLE_ID / AUTH_GOOGLE_SECRET is set; skipped Google OAuth sync. Set both or neither."
  );
} else {
  console.log(
    "AUTH_GOOGLE_ID / AUTH_GOOGLE_SECRET not in env file; leaving any dashboard-configured Google credentials untouched."
  );
}

syncOptionalConnectorEnv();
