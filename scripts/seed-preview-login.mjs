// Seeds the well-known preview/staging password user after Convex deploy.
// Production is fail-closed: this script never calls convex run --prod.
//
// Usage (env vars):
//   DEPLOY_NAME        required  preview | staging  (production is refused)
//   CONVEX_ENV_ARGS    optional  deployment selector, e.g. "--preview-name pr-12"
//   DRY_RUN=1          optional  print the convex run argv without executing
import { spawnSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const PREVIEW_LOGIN_FUNCTION = "seed:ensurePreviewLogin";
export const PREVIEW_LOGIN_EMAIL = "test@test.com";
export const PREVIEW_LOGIN_PASSWORD = "test1234";

export function parseConvexEnvArgs(raw) {
  return String(raw ?? "")
    .split(/\s+/)
    .filter(Boolean);
}

export function previewLoginSeedDeployAllowed({ convexArgs, deployName }) {
  if (deployName === "production" || convexArgs.includes("--prod")) {
    return { allowed: false, reason: "production" };
  }
  if (deployName !== "preview" && deployName !== "staging") {
    return { allowed: false, reason: "unknown-deploy" };
  }
  if (deployName === "preview" && !convexArgs.includes("--preview-name")) {
    return { allowed: false, reason: "missing-preview-name" };
  }
  return { allowed: true, reason: "" };
}

export function convexRunArgv(convexArgs) {
  return ["convex", "run", ...convexArgs, PREVIEW_LOGIN_FUNCTION];
}

function fail(message) {
  console.error(`::error::${message}`);
  process.exit(1);
}

function invokedAsCli(metaUrl) {
  const entry = process.argv[1];
  if (!entry) {
    return false;
  }
  return pathToFileURL(path.resolve(entry)).href === metaUrl;
}

function main() {
  const dryRun = process.env.DRY_RUN === "1";
  const deployName = (process.env.DEPLOY_NAME ?? "").trim();
  const convexArgs = parseConvexEnvArgs(process.env.CONVEX_ENV_ARGS);
  const decision = previewLoginSeedDeployAllowed({ convexArgs, deployName });
  if (!decision.allowed) {
    fail(
      `Refusing to seed preview login (${decision.reason}). Never seed production.`
    );
  }

  const argv = convexRunArgv(convexArgs);
  if (dryRun) {
    console.log(`[dry-run] npx ${argv.join(" ")}`);
    return;
  }

  const result = spawnSync("npx", argv, {
    env: process.env,
    stdio: "inherit",
  });
  if (result.status !== 0) {
    fail(
      `npx ${argv.join(" ")} failed (exit ${result.status ?? "signal"}). Preview review needs ${PREVIEW_LOGIN_EMAIL}.`
    );
  }
  console.log(
    `::notice::Preview login ready: ${PREVIEW_LOGIN_EMAIL} / ${PREVIEW_LOGIN_PASSWORD}`
  );
}

if (invokedAsCli(import.meta.url)) {
  main();
}
