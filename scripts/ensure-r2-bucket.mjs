// Preview-only R2 preflight. Lists team-harness-files-preview and creates it
// when credentials allow. Staging/production must never call this script.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  PREVIEW_RETRY,
  PREVIEW_R2_BUCKET,
  classifyCreateOutput,
  classifyWranglerOutput,
  decideEnsureAction,
  nextBackoffMs,
  outputListsBucket,
  previewSkipReason,
  readEnvPresence,
} from "./wrangler-classify.mjs";

function usage() {
  console.error(
    "Usage: node scripts/ensure-r2-bucket.mjs [--bucket name] [--dotenv file]"
  );
  process.exit(2);
}

function parseArgv(argv) {
  const args = { bucket: PREVIEW_R2_BUCKET, dotenv: "" };
  for (let i = 2; i < argv.length; i++) {
    const token = argv[i];
    if (token === "--bucket") {
      args.bucket = argv[++i] ?? "";
    } else if (token === "--dotenv") {
      args.dotenv = argv[++i] ?? "";
    } else {
      usage();
    }
  }
  if (!args.bucket) {
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
    encoding: "utf8",
    env: process.env,
    maxBuffer: 16 * 1024 * 1024,
  });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  process.stdout.write(output);
  return { output, status: result.status ?? 1 };
}

function credentialPresence(dotenv) {
  const keys = ["CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ACCOUNT_ID"];
  if (dotenv && existsSync(dotenv)) {
    return readEnvPresence(readFileSync(dotenv, "utf8"), keys);
  }
  return readEnvPresence("", keys);
}

function main() {
  const args = parseArgv(process.argv);
  const presence = credentialPresence(args.dotenv);
  const skip = previewSkipReason({
    accountId: presence.CLOUDFLARE_ACCOUNT_ID,
    name: "preview",
    token: presence.CLOUDFLARE_API_TOKEN,
  });
  if (skip) {
    console.log(`::warning::Skipping preview R2 preflight: ${skip}`);
    process.exit(0);
  }

  let listAttempts = 0;
  let listStatus = 1;
  let listKind = "unknown";
  let bucketListed = false;

  while (true) {
    listAttempts += 1;
    console.log(
      `::notice::Listing R2 buckets (attempt ${listAttempts}/${PREVIEW_RETRY.maxAttempts}) for ${args.bucket}`
    );
    let listed = runWrangler(args.dotenv, ["r2", "bucket", "list", "--json"]);
    if (listed.status !== 0 && /unknown argument/i.test(listed.output)) {
      listed = runWrangler(args.dotenv, ["r2", "bucket", "list"]);
    }
    listStatus = listed.status;
    listKind =
      listed.status === 0 ? "ok" : classifyWranglerOutput(listed.output);
    bucketListed = outputListsBucket(listed.output, args.bucket);

    const decision = decideEnsureAction({
      accountPresent: presence.CLOUDFLARE_ACCOUNT_ID,
      bucketListed,
      listAttempts,
      listKind,
      listStatus,
      maxListAttempts: PREVIEW_RETRY.maxAttempts,
      tokenPresent: presence.CLOUDFLARE_API_TOKEN,
    });

    if (decision.action === "skip") {
      console.log(`::warning::Skipping preview R2 preflight: ${decision.reason}`);
      process.exit(0);
    }
    if (decision.action === "exists") {
      console.log(`::notice::Preview R2 bucket already exists: ${args.bucket}`);
      process.exit(0);
    }
    if (decision.action === "retry_list") {
      const wait = nextBackoffMs(listAttempts);
      console.log(
        `::warning::R2 list failed (${listKind}). Retrying in ${wait}ms.`
      );
      sleepSync(wait);
      continue;
    }
    break;
  }

  let createAttempt = 0;
  while (createAttempt < PREVIEW_RETRY.maxAttempts) {
    createAttempt += 1;
    console.log(
      `::notice::Creating preview R2 bucket ${args.bucket} (attempt ${createAttempt}/${PREVIEW_RETRY.maxAttempts})`
    );
    const created = runWrangler(args.dotenv, [
      "r2",
      "bucket",
      "create",
      args.bucket,
    ]);
    const kind = classifyCreateOutput(created.output, created.status);
    if (kind === "ok" || kind === "already_exists") {
      console.log(
        `::notice::Preview R2 bucket ready: ${args.bucket} (${kind})`
      );
      process.exit(0);
    }
    if (kind === "transient" && createAttempt < PREVIEW_RETRY.maxAttempts) {
      const wait = nextBackoffMs(createAttempt);
      console.log(
        `::warning::R2 create failed (${kind}). Retrying in ${wait}ms.`
      );
      sleepSync(wait);
      continue;
    }
    console.error(
      `::error::Failed to create preview R2 bucket ${args.bucket} (${kind}, exit ${created.status}).`
    );
    process.exit(created.status || 1);
  }
}

if (invokedAsCli(import.meta.url)) {
  main();
}
