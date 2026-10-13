// Pause tahcode hosting. Replaces Workers with the 503 page, deploys the
// empty Convex cron table to staging/production, and deletes Convex preview
// deployments. Never deletes production/staging Convex data or R2 buckets.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const PAUSED_MARKER = "infra/PAUSED";
export const PAUSED_WORKER_CONFIG = "wrangler.paused.jsonc";

export const PAUSE_TARGETS = {
  preview: {
    convexArgs: null,
    dotenv: ".env.preview",
    env: "preview",
    name: "preview",
    prunePreview: true,
    publicUrl: "https://tahcode-preview.gawara.workers.dev",
    worker: "tahcode-preview",
  },
  production: {
    convexArgs: ["--prod", "--yes"],
    dotenv: ".env.production",
    env: "",
    name: "production",
    prunePreview: false,
    publicUrl: "https://tahcode.com",
    worker: "tahcode",
  },
  staging: {
    convexArgs: ["--yes"],
    dotenv: ".env.staging",
    env: "staging",
    name: "staging",
    prunePreview: false,
    publicUrl: "https://tahcode-staging.gawara.workers.dev",
    worker: "tahcode-staging",
  },
};

export const ALLOWED_WORKERS = new Set(
  Object.values(PAUSE_TARGETS).map((target) => target.worker)
);

const FORBIDDEN_WRANGLER = new Set(["delete", "r2", "d1", "kv"]);

function usage() {
  console.error(`Usage: node scripts/infra-pause.mjs [--dry-run|--apply] [options]

Replace live Workers with the 503 pause page. Dry-run is the default.

  --dry-run              Print the plan only (default)
  --apply                Deploy the pause Worker and stop Convex crons / previews
  --decrypt              Decrypt .env.<target>.enc first
  --target <name>        production | staging | preview | all (default all)
  --skip-cloudflare      Do not deploy Workers
  --skip-convex          Do not deploy empty crons or prune previews
`);
  process.exit(2);
}

export function parsePauseArgv(argv) {
  const args = {
    apply: false,
    cloudflare: true,
    convex: true,
    decrypt: false,
    target: "all",
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
    } else if (token === "--skip-cloudflare") {
      args.cloudflare = false;
    } else if (token === "--skip-convex") {
      args.convex = false;
    } else if (token === "--target") {
      args.target = tokens[++i] ?? "";
    } else if (token === "--help" || token === "-h") {
      usage();
    } else {
      console.error(`Unknown argument: ${token}`);
      usage();
    }
  }
  return args;
}

export function resolvePauseTargets(name) {
  const key = String(name ?? "all").trim() || "all";
  if (key === "all") {
    return [
      PAUSE_TARGETS.production,
      PAUSE_TARGETS.staging,
      PAUSE_TARGETS.preview,
    ];
  }
  const target = PAUSE_TARGETS[key];
  if (!target) {
    throw new Error(
      `Unknown pause target "${key}". Use production, staging, preview, or all.`
    );
  }
  return [target];
}

export function assertAllowedWorker(name) {
  const worker = String(name ?? "").trim();
  if (!ALLOWED_WORKERS.has(worker)) {
    throw new Error(
      `Refusing Worker "${worker || "(empty)"}". Allowed: ${[...ALLOWED_WORKERS].join(", ")}`
    );
  }
  return worker;
}

export function wranglerPauseArgs(target) {
  assertAllowedWorker(target.worker);
  const args = [
    "deploy",
    "--config",
    PAUSED_WORKER_CONFIG,
    "--env",
    target.env,
  ];
  return args;
}

export function assertSafeWranglerArgs(args) {
  for (const token of args) {
    const lower = String(token).toLowerCase();
    if (FORBIDDEN_WRANGLER.has(lower)) {
      throw new Error(`Refusing wrangler argument "${token}" during pause`);
    }
  }
  if (!args.includes("--config") || !args.includes(PAUSED_WORKER_CONFIG)) {
    throw new Error("Pause deploy must use wrangler.paused.jsonc");
  }
  return args;
}

export function convexPausePlan(target) {
  if (target.prunePreview) {
    return {
      action: "prune-previews",
      argv: [
        "scripts/preview-prune.mjs",
        "--apply",
        "--sweep-unmapped",
        "--include-ci",
        "--skip-github",
        "--exclude-names",
        "production,staging",
        "--dotenv",
        target.dotenv,
      ],
    };
  }
  if (target.convexArgs) {
    return {
      action: "deploy-crons",
      argv: ["convex", "deploy", ...target.convexArgs],
    };
  }
  return { action: "skip", argv: [] };
}

export function planInfraPause(input) {
  const steps = [];
  for (const target of input.targets) {
    if (input.cloudflare) {
      steps.push({
        action: "wrangler-deploy-paused",
        apply: input.apply,
        args: assertSafeWranglerArgs(wranglerPauseArgs(target)),
        dotenv: target.dotenv,
        publicUrl: target.publicUrl,
        target: target.name,
        worker: target.worker,
      });
    }
    if (input.convex) {
      const convex = convexPausePlan(target);
      steps.push({
        ...convex,
        apply: input.apply,
        dotenv: target.dotenv,
        target: target.name,
      });
    }
  }
  return steps;
}

export function isPausedCronSource(source) {
  const uncommented = String(source)
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("//"))
    .join("\n");
  return (
    source.includes("Infrastructure is paused") &&
    !/crons\.interval\(/.test(uncommented)
  );
}

export function markerExists(cwd = process.cwd()) {
  return existsSync(path.join(cwd, PAUSED_MARKER));
}

function invokedAsCli(metaUrl) {
  const entry = process.argv[1];
  if (!entry) {
    return false;
  }
  return pathToFileURL(path.resolve(entry)).href === metaUrl;
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

function run(command, argv, env) {
  const result = spawnSync(command, argv, {
    encoding: "utf-8",
    env,
    stdio: "inherit",
  });
  return result.status ?? 1;
}

function decryptEnv(name) {
  const status = run(process.execPath, ["scripts/env.mjs", "decrypt", name], {
    ...process.env,
  });
  if (status !== 0) {
    throw new Error(`Failed to decrypt .env.${name}`);
  }
}

function dotenvRun(dotenv, argv) {
  return run(
    "npx",
    ["dotenvx", "run", "-f", dotenv, "--", ...argv],
    process.env
  );
}

function applyStep(step) {
  if (step.action === "wrangler-deploy-paused") {
    assertAllowedWorker(step.worker);
    assertSafeWranglerArgs(step.args);
    logLine(
      "notice",
      `Deploying pause Worker ${step.worker} (${step.publicUrl})`
    );
    const status = dotenvRun(step.dotenv, ["npx", "wrangler", ...step.args]);
    if (status !== 0) {
      throw new Error(`wrangler deploy failed for ${step.worker}`);
    }
    return;
  }
  if (step.action === "deploy-crons") {
    logLine("notice", `Deploying empty Convex crons to ${step.target}`);
    const status = dotenvRun(step.dotenv, ["npx", ...step.argv]);
    if (status !== 0) {
      throw new Error(`convex deploy failed for ${step.target}`);
    }
    return;
  }
  if (step.action === "prune-previews") {
    logLine("notice", "Deleting Convex / Cloudflare preview leftovers");
    const status = run(process.execPath, step.argv, process.env);
    if (status !== 0) {
      throw new Error("preview prune failed");
    }
  }
}

function printPlan(steps, apply) {
  const mode = apply ? "apply" : "dry-run";
  logLine("notice", `infra-pause ${mode}: ${steps.length} step(s)`);
  for (const step of steps) {
    const detail =
      step.action === "wrangler-deploy-paused"
        ? `${step.worker} ${step.args.join(" ")}`
        : (step.argv ?? []).join(" ");
    console.log(`- ${step.target}: ${step.action} ${detail}`.trim());
  }
}

function main() {
  const args = parsePauseArgv(process.argv);
  const targets = resolvePauseTargets(args.target);
  const steps = planInfraPause({
    apply: args.apply,
    cloudflare: args.cloudflare,
    convex: args.convex,
    targets,
  });
  printPlan(steps, args.apply);
  if (!args.apply) {
    logLine(
      "notice",
      "Dry-run only. Pass --apply to pause live infrastructure."
    );
    return;
  }
  if (!markerExists()) {
    throw new Error(
      `Refusing --apply: ${PAUSED_MARKER} is missing. Create it to confirm the pause.`
    );
  }
  if (args.decrypt) {
    for (const target of targets) {
      decryptEnv(target.name);
    }
  }
  for (const step of steps) {
    applyStep(step);
  }
  logLine(
    "notice",
    "Pause apply finished. Data in Convex prod/staging and R2 was not deleted."
  );
}

if (invokedAsCli(import.meta.url)) {
  try {
    main();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logLine("error", message);
    process.exit(1);
  }
}
