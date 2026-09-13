// Run wrangler for CI deploys. Preview retries transient fetch/connectivity
// failures with backoff, bootstraps a missing Worker, and can create the
// preview R2 bucket. Staging/production keep a single attempt plus the
// existing Worker-missing bootstrap; they never auto-create R2.
import { spawnSync } from "node:child_process";
import {
  appendFileSync,
  existsSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  PREVIEW_RETRY,
  PREVIEW_R2_BUCKET,
  classifyWranglerOutput,
  failureHint,
  nextBackoffMs,
  nextDeployAction,
  parseCloudflareUrl,
  previewSkipReason,
  readEnvPresence,
  toConvexSiteUrl,
} from "./wrangler-classify.mjs";

function usage() {
  console.error(
    "Usage: node scripts/wrangler-deploy.mjs --name <preview|staging|production> [--dotenv file] [--output path] -- <wrangler args>"
  );
  process.exit(2);
}

function parseArgv(argv) {
  const args = {
    dotenv: "",
    name: "",
    output: "/tmp/wrangler.out",
    wrangler: [],
  };
  const tokens = argv.slice(2);
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token === "--") {
      args.wrangler = tokens.slice(i + 1);
      break;
    }
    if (token === "--name") {
      args.name = tokens[++i] ?? "";
    } else if (token === "--dotenv") {
      args.dotenv = tokens[++i] ?? "";
    } else if (token === "--output") {
      args.output = tokens[++i] ?? args.output;
    } else {
      args.wrangler = tokens.slice(i);
      break;
    }
  }
  if (!args.name || args.wrangler.length === 0) {
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

function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function writeOutputs(values) {
  const githubOutput = process.env.GITHUB_OUTPUT;
  if (!githubOutput) {
    return;
  }
  const lines = Object.entries(values).map(
    ([key, value]) => `${key}=${String(value).replaceAll("\n", " ")}`
  );
  appendFileSync(githubOutput, `${lines.join("\n")}\n`);
}

function extraVars() {
  const site = toConvexSiteUrl(process.env.CONVEX_URL ?? "");
  return site ? ["--var", `CONVEX_SITE_URL:${site}`] : [];
}

function runWrangler(dotenv, wranglerArgs) {
  const command = dotenv
    ? [
        "npx",
        [
          "dotenvx",
          "run",
          "-f",
          dotenv,
          "--",
          "npx",
          "wrangler",
          ...wranglerArgs,
        ],
      ]
    : ["npx", ["wrangler", ...wranglerArgs]];
  const result = spawnSync(command[0], command[1], {
    encoding: "utf-8",
    env: process.env,
    maxBuffer: 32 * 1024 * 1024,
  });
  return {
    output: `${result.stdout ?? ""}${result.stderr ?? ""}`,
    status: result.status ?? 1,
  };
}

function persist(outputPath, output) {
  writeFileSync(outputPath, output);
  process.stdout.write(output);
}

function credentialPresence(dotenv) {
  const keys = ["CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ACCOUNT_ID"];
  if (dotenv && existsSync(dotenv)) {
    return readEnvPresence(readFileSync(dotenv, "utf-8"), keys);
  }
  return readEnvPresence("", keys);
}

function runEnsureR2(dotenv) {
  const result = spawnSync(
    process.execPath,
    [
      path.resolve("scripts/ensure-r2-bucket.mjs"),
      "--bucket",
      PREVIEW_R2_BUCKET,
      ...(dotenv ? ["--dotenv", dotenv] : []),
    ],
    {
      encoding: "utf-8",
      env: process.env,
      maxBuffer: 16 * 1024 * 1024,
    }
  );
  process.stdout.write(`${result.stdout ?? ""}${result.stderr ?? ""}`);
  return result.status === 0;
}

function failFinal(name, kind, status) {
  const hint = failureHint(kind, name);
  console.error(
    `::error::wrangler ${name} failed (exit ${status}, classified as ${kind}). ${hint}`
  );
  process.exit(status || 1);
}

function succeed(output) {
  const url = parseCloudflareUrl(output);
  if (!url) {
    console.error(
      "::error::Could not parse a Cloudflare URL from wrangler output."
    );
    process.exit(1);
  }
  writeOutputs({ cloudflare_url: url, skip_reason: "", skipped: "false" });
  console.log(`Parsed Cloudflare URL: ${url}`);
}

function runBootstrap(name, dotenv, extra) {
  const bootstrapArgs =
    name === "production"
      ? ["deploy", ...extra]
      : ["deploy", "--env", name, ...extra];
  console.log(
    `Named Worker is missing; deploying once so versions upload can target it (${bootstrapArgs.join(" ")}).`
  );
  return runWrangler(dotenv, bootstrapArgs);
}

function main() {
  const args = parseArgv(process.argv);
  const extra = extraVars();
  const wranglerArgs = [...args.wrangler, ...extra];
  const presence = credentialPresence(args.dotenv);
  const skip = previewSkipReason({
    accountId: presence.CLOUDFLARE_ACCOUNT_ID,
    name: args.name,
    token: presence.CLOUDFLARE_API_TOKEN,
  });
  if (skip) {
    console.log(`::warning::Skipping Cloudflare preview deploy: ${skip}`);
    writeOutputs({ cloudflare_url: "", skip_reason: skip, skipped: "true" });
    return;
  }

  const maxAttempts = args.name === "preview" ? PREVIEW_RETRY.maxAttempts : 1;
  let bootstrapped = false;
  let ensuredR2 = false;
  let transientAttempt = 0;

  while (true) {
    console.log(
      `::notice::Cloudflare ${args.name} wrangler: ${wranglerArgs.join(" ")}`
    );
    const result = runWrangler(args.dotenv, wranglerArgs);
    persist(args.output, result.output);
    const kind =
      result.status === 0 ? "ok" : classifyWranglerOutput(result.output);
    const decisionAttempt =
      kind === "transient" ? transientAttempt + 1 : transientAttempt;
    const action = nextDeployAction({
      bootstrapped,
      ensuredR2,
      kind,
      maxAttempts,
      name: args.name,
      transientAttempt: decisionAttempt,
    });

    console.log(
      `::notice::Wrangler ${args.name} exit ${result.status}, classified as ${kind}, next=${action.type}`
    );

    if (action.type === "succeed") {
      succeed(result.output);
      return;
    }

    if (action.type === "retry") {
      transientAttempt = decisionAttempt;
      console.log(
        `::warning::Transient Cloudflare API failure (exit ${result.status}). Retry ${transientAttempt + 1}/${maxAttempts} in ${action.backoffMs}ms.`
      );
      sleepSync(action.backoffMs);
      continue;
    }

    if (action.type === "bootstrap") {
      let boot = runBootstrap(args.name, args.dotenv, extra);
      persist(args.output, boot.output);
      let bootKind =
        boot.status === 0 ? "ok" : classifyWranglerOutput(boot.output);
      let bootTransient = 0;
      while (
        bootKind === "transient" &&
        args.name === "preview" &&
        bootTransient + 1 < PREVIEW_RETRY.maxAttempts
      ) {
        bootTransient += 1;
        const wait = nextBackoffMs(bootTransient);
        console.log(
          `::warning::Bootstrap deploy hit a transient failure. Retry ${bootTransient + 1}/${PREVIEW_RETRY.maxAttempts} in ${wait}ms.`
        );
        sleepSync(wait);
        boot = runBootstrap(args.name, args.dotenv, extra);
        persist(args.output, boot.output);
        bootKind =
          boot.status === 0 ? "ok" : classifyWranglerOutput(boot.output);
      }
      if (bootKind === "r2_missing" && args.name === "preview" && !ensuredR2) {
        console.log(
          `::warning::Bootstrap failed because ${PREVIEW_R2_BUCKET} is missing; creating it.`
        );
        if (!runEnsureR2(args.dotenv)) {
          failFinal(args.name, "r2_missing", boot.status);
        }
        ensuredR2 = true;
        boot = runBootstrap(args.name, args.dotenv, extra);
        persist(args.output, boot.output);
        bootKind =
          boot.status === 0 ? "ok" : classifyWranglerOutput(boot.output);
      }
      if (bootKind !== "ok") {
        failFinal(args.name, bootKind, boot.status);
      }
      bootstrapped = true;
      continue;
    }

    if (action.type === "ensure_r2") {
      console.log(
        `::warning::Preview R2 bucket ${PREVIEW_R2_BUCKET} is missing; creating it and retrying wrangler.`
      );
      if (!runEnsureR2(args.dotenv)) {
        failFinal(args.name, "r2_missing", result.status);
      }
      ensuredR2 = true;
      continue;
    }

    failFinal(args.name, kind, result.status);
  }
}

if (invokedAsCli(import.meta.url)) {
  main();
}
