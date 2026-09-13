// Preview-only Convex deploy. Claims `--preview-name`, and if the team
// quota (DeploymentQuotaReached) blocks creating a new identifier, retries
// with fallback names that already exist (merged PR branches).
// Staging/production must keep calling `npx convex deploy` directly.
import { spawnSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  isDeploymentQuotaError,
  nextPreviewClaim,
  previewNameCandidates,
} from "./convex-preview-names.mjs";

const DEFAULT_CMD =
  'echo "CONVEX_URL=$VITE_CONVEX_URL" >> "$GITHUB_ENV" && npm run cf:build';

function usage() {
  console.error(
    "Usage: node scripts/convex-preview-deploy.mjs --dotenv <file> --preview-name <name> [--fallback-names a,b] [--exclude-names a,b] [--cmd <shell>]"
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

function main() {
  const args = parseArgv(process.argv);
  const candidates = previewNameCandidates({
    exclude: args.exclude,
    fallbacks: args.fallbacks,
    preferred: args.previewName,
  });
  if (candidates.length === 0) {
    console.error("::error::No Convex preview names to claim.");
    process.exit(2);
  }

  let name = candidates[0];
  while (name) {
    console.log(`::notice::Claiming Convex preview "${name}"`);
    const result = runConvexDeploy(args.dotenv, name, args.cmd);
    if (result.status === 0) {
      writeOutput("preview_name", name);
      console.log(`::notice::Convex preview ready: ${name}`);
      process.exit(0);
    }
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
  main();
}
