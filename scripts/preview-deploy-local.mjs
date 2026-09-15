// One-command local preview deploy (the path used when GitHub Actions is down).
// Decrypts .env.preview, claims/reuses Convex `pr-N`, uploads tahcode-preview
// with --preview-alias pr-N, syncs Convex Auth, and seeds the review login.
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { slugPreviewName, splitNameList } from "./convex-preview-names.mjs";
import {
  discoverGithubPreviewNames,
  mergeNameLists,
} from "./preview-github.mjs";

const DEFAULT_DOTENV = ".env.preview";

function usage() {
  console.error(`Usage: node scripts/preview-deploy-local.mjs --pr <number> [options]

Deploy the same Convex + Cloudflare preview stack as CI, from this machine.

  --pr <n>               Pull request number (preview name pr-N, alias pr-N)
  --dotenv <file>        Decrypted preview env (default: .env.preview)
  --exclude-names a,b    Extra open-PR names to never steal
  --prune-names a,b      Extra stale names to delete if quota blocks pr-N
  --prune                Run preview-prune --apply --convex first
  --skip-cloudflare      Convex only
  --skip-seed            Skip the preview password user
  --skip-github          Do not call gh for open/closed PR names
  --dry-run              Print the plan without running it
`);
  process.exit(2);
}

export function parseLocalDeployArgv(argv) {
  const args = {
    dotenv: DEFAULT_DOTENV,
    dryRun: false,
    exclude: "",
    pr: "",
    prune: false,
    pruneNames: "",
    skipCloudflare: false,
    skipGithub: false,
    skipSeed: false,
  };
  const tokens = argv.slice(2);
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token === "--pr") {
      args.pr = tokens[++i] ?? "";
    } else if (token === "--dotenv") {
      args.dotenv = tokens[++i] ?? "";
    } else if (token === "--exclude-names") {
      args.exclude = tokens[++i] ?? "";
    } else if (token === "--prune-names") {
      args.pruneNames = tokens[++i] ?? "";
    } else if (token === "--prune") {
      args.prune = true;
    } else if (token === "--skip-cloudflare") {
      args.skipCloudflare = true;
    } else if (token === "--skip-seed") {
      args.skipSeed = true;
    } else if (token === "--skip-github") {
      args.skipGithub = true;
    } else if (token === "--dry-run") {
      args.dryRun = true;
    } else if (token === "--help" || token === "-h") {
      usage();
    } else {
      usage();
    }
  }
  const prNumber = Number(args.pr);
  if (!Number.isInteger(prNumber) || prNumber <= 0) {
    usage();
  }
  return { ...args, pr: prNumber, previewName: `pr-${prNumber}` };
}

export function parseGithubKvFile(text) {
  const values = {};
  for (const line of String(text ?? "").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const index = trimmed.indexOf("=");
    if (index === -1) {
      continue;
    }
    values[trimmed.slice(0, index)] = trimmed.slice(index + 1);
  }
  return values;
}

export function planLocalPreviewDeploy(input) {
  const previewName = slugPreviewName(input.previewName);
  const exclude = mergeNameLists(input.exclude ?? [], []).filter(
    (name) => name !== previewName
  );
  const prune = mergeNameLists(input.pruneNames ?? [], []).filter(
    (name) => name !== previewName && !exclude.includes(name)
  );
  const dotenv = input.dotenv || DEFAULT_DOTENV;
  const withNames = (argv, flag, names) =>
    names.length > 0 ? [...argv, flag, names.join(",")] : argv;
  const steps = [
    {
      argv: [process.execPath, "scripts/env.mjs", "decrypt", "preview"],
      id: "decrypt",
    },
  ];
  if (input.prune) {
    steps.push({
      argv: withNames(
        withNames(
          [
            process.execPath,
            "scripts/preview-prune.mjs",
            "--apply",
            "--convex-only",
            "--dotenv",
            dotenv,
            "--sweep-unmapped",
          ],
          "--exclude-names",
          [previewName, ...exclude]
        ),
        "--prune-names",
        prune
      ),
      id: "prune",
    });
  }
  steps.push({
    argv: withNames(
      withNames(
        [
          process.execPath,
          "scripts/convex-preview-deploy.mjs",
          "--dotenv",
          dotenv,
          "--preview-name",
          previewName,
        ],
        "--exclude-names",
        exclude
      ),
      "--prune-names",
      prune
    ),
    id: "convex",
  });
  if (!input.skipCloudflare) {
    steps.push(
      {
        argv: [
          process.execPath,
          "scripts/wrangler-deploy.mjs",
          "--name",
          "preview",
          "--dotenv",
          dotenv,
          "--",
          "versions",
          "upload",
          "--env",
          "preview",
          "--preview-alias",
          previewName,
        ],
        id: "cloudflare",
      },
      {
        argv: [process.execPath, "scripts/sync-convex-auth-env.mjs"],
        env: {
          CONVEX_ENV_ARGS: `--preview-name ${previewName}`,
          DEPLOY_NAME: "preview",
        },
        id: "sync-auth",
        viaDotenvx: true,
      }
    );
  }
  if (!input.skipSeed) {
    steps.push({
      env: {
        CONVEX_ENV_ARGS: `--preview-name ${previewName}`,
        DEPLOY_NAME: "preview",
      },
      id: "seed",
      viaDotenvx: true,
      argv: [process.execPath, "scripts/seed-preview-login.mjs"],
    });
  }
  return { dotenv, exclude, previewName, prune, steps };
}

function invokedAsCli(metaUrl) {
  const entry = process.argv[1];
  if (!entry) {
    return false;
  }
  return pathToFileURL(path.resolve(entry)).href === metaUrl;
}

function runSpawn(command, argv, env) {
  const result = spawnSync(command, argv, {
    env,
    stdio: "inherit",
  });
  return result.status ?? 1;
}

function fail(message) {
  console.error(`::error::${message}`);
  process.exit(1);
}

function discoverNames(args) {
  const explicitExclude = splitNameList(args.exclude);
  const explicitPrune = splitNameList(args.pruneNames);
  if (args.skipGithub) {
    return { exclude: explicitExclude, prune: explicitPrune };
  }
  const github = discoverGithubPreviewNames();
  if (!github.openOk) {
    console.log(
      "::warning::gh pr list failed; continuing with --exclude-names only."
    );
  }
  return {
    exclude: mergeNameLists(github.exclude, explicitExclude),
    prune: mergeNameLists(github.prune, explicitPrune),
  };
}

export function formatLocalDeployPlan(plan) {
  return plan.steps.map((step) => {
    const prefix = step.viaDotenvx
      ? `npx dotenvx run -f ${plan.dotenv} -- `
      : "";
    return `${step.id}: ${prefix}${step.argv.join(" ")}`;
  });
}

function applyGithubKv(filePath, env) {
  if (!existsSync(filePath)) {
    return env;
  }
  const values = parseGithubKvFile(readFileSync(filePath, "utf-8"));
  return { ...env, ...values };
}

export function runLocalPreviewDeploy(argv) {
  const args = parseLocalDeployArgv(argv);
  const names = discoverNames(args);
  const plan = planLocalPreviewDeploy({
    dotenv: args.dotenv,
    exclude: names.exclude,
    previewName: args.previewName,
    prune: args.prune,
    pruneNames: names.prune,
    skipCloudflare: args.skipCloudflare,
    skipSeed: args.skipSeed,
  });

  console.log(`::notice::Local preview deploy for ${plan.previewName}`);
  for (const line of formatLocalDeployPlan(plan)) {
    console.log(`::notice::${line}`);
  }
  if (args.dryRun) {
    return { exitCode: 0, plan };
  }

  if (!process.env.DOTENV_PRIVATE_KEY_PREVIEW && !existsSync(args.dotenv)) {
    fail(
      "DOTENV_PRIVATE_KEY_PREVIEW is unset and .env.preview is missing. Export the decrypt key (same as the GitHub secret)."
    );
  }

  const workdir = mkdtempSync(path.join(tmpdir(), "tahcode-preview-deploy-"));
  const githubEnv = path.join(workdir, "github.env");
  const githubOutput = path.join(workdir, "github.output");
  writeFileSync(githubEnv, "");
  writeFileSync(githubOutput, "");

  let env = {
    ...process.env,
    GITHUB_ENV: githubEnv,
    GITHUB_OUTPUT: githubOutput,
  };

  for (const step of plan.steps) {
    env = applyGithubKv(githubEnv, env);
    env = applyGithubKv(githubOutput, env);
    if (step.id === "sync-auth") {
      const siteUrl = env.public_site_url || env.cloudflare_url || env.SITE_URL;
      if (!siteUrl) {
        fail("Cloudflare upload did not produce a public_site_url.");
      }
      env = { ...env, PUBLIC_SITE_URL: siteUrl, SITE_URL: siteUrl };
    }
    const childEnv = { ...env, ...step.env };
    let status;
    if (step.viaDotenvx) {
      status = runSpawn(
        "npx",
        ["dotenvx", "run", "-f", plan.dotenv, "--", ...step.argv],
        childEnv
      );
    } else {
      status = runSpawn(step.argv[0], step.argv.slice(1), childEnv);
    }
    if (status !== 0) {
      fail(`${step.id} failed (exit ${status}).`);
    }
  }

  env = applyGithubKv(githubEnv, env);
  env = applyGithubKv(githubOutput, env);
  const appUrl = env.public_site_url || env.cloudflare_url || "";
  const convexUrl = env.CONVEX_URL || env.VITE_CONVEX_URL || "";
  if (appUrl) {
    console.log(`::notice::Preview app: ${appUrl}`);
  }
  if (convexUrl) {
    console.log(`::notice::Preview Convex: ${convexUrl}`);
  }
  console.log(
    "::notice::Preview login: test@test.com / test1234 (Google OAuth is not registered on preview)"
  );
  return { exitCode: 0, plan };
}

if (invokedAsCli(import.meta.url)) {
  try {
    const result = runLocalPreviewDeploy(process.argv);
    process.exit(result.exitCode);
  } catch (error) {
    fail(
      error instanceof Error ? error.message : "Local preview deploy failed"
    );
  }
}
