/**
 * Detect Developer ID + Apple notarization materials and compute the
 * electron-builder CLI overrides for signed vs unsigned macOS builds.
 *
 * Never log secret values. Missing GitHub secrets are empty strings;
 * treat whitespace-only as absent so CI stays on the unsigned path.
 *
 * @see https://www.electron.build/code-signing
 * @see https://www.electron.build/mac
 */

import { appendFileSync } from "node:fs";
import { resolve } from "node:path";

export const DEVELOPER_ID_ENV = ["CSC_LINK", "CSC_KEY_PASSWORD"];

export const NOTARIZE_ENV = [
  "APPLE_ID",
  "APPLE_APP_SPECIFIC_PASSWORD",
  "APPLE_TEAM_ID",
];

export const SIGNED_DISTRIBUTION_ENV = [...DEVELOPER_ID_ENV, ...NOTARIZE_ENV];

export function envFlag(env, name) {
  const value = env[name];
  return typeof value === "string" && value.trim().length > 0;
}

export function missingEnvNames(names, env = process.env) {
  return names.filter((name) => !envFlag(env, name));
}

export function hasDeveloperIdMaterials(env = process.env) {
  return missingEnvNames(DEVELOPER_ID_ENV, env).length === 0;
}

export function hasNotarizeMaterials(env = process.env) {
  return missingEnvNames(NOTARIZE_ENV, env).length === 0;
}

/**
 * All five distribution secrets are present. CI uses this as the
 * signed+notarized gate — a partial set must not fail the job.
 */
export function hasSignedDistributionMaterials(env = process.env) {
  return missingEnvNames(SIGNED_DISTRIBUTION_ENV, env).length === 0;
}

export function wantsSignedBuild(env = process.env) {
  return (
    env.TAHCODE_DESKTOP_SIGNED === "1" || hasSignedDistributionMaterials(env)
  );
}

/**
 * Extra `electron-builder -c.*` flags. Unsigned keeps `mac.identity: null`
 * so local/dev machines without a cert still produce a .dmg.
 */
export function electronBuilderMacOverrides(env = process.env) {
  if (!wantsSignedBuild(env)) {
    return [
      "-c.mac.identity=null",
      "-c.dmg.sign=false",
      "-c.mac.notarize=false",
    ];
  }
  const overrides = ["-c.dmg.sign=true", "-c.forceCodeSigning=true"];
  if (hasNotarizeMaterials(env)) {
    overrides.push("-c.mac.notarize=true");
  } else {
    overrides.push("-c.mac.notarize=false");
  }
  return overrides;
}

export function compileTimeSignedFlag(env = process.env) {
  return env.TAHCODE_DESKTOP_SIGNED === "1" ? "1" : "";
}

function printMissingDistributionEnv(missing) {
  console.error("dist:mac:signed requires these environment variables:");
  for (const name of SIGNED_DISTRIBUTION_ENV) {
    const mark = missing.includes(name) ? "missing" : "set";
    console.error(`  ${name} (${mark})`);
  }
  console.error(
    "See apps/desktop/README.md (署名と公証). Do not commit certificates or passwords."
  );
}

export function requireSignedDistributionEnv(env = process.env) {
  const missing = missingEnvNames(SIGNED_DISTRIBUTION_ENV, env);
  if (missing.length > 0) {
    printMissingDistributionEnv(missing);
    process.exitCode = 1;
    return false;
  }
  return true;
}

function writeGithubOutput(signed, env = process.env) {
  const output = env.GITHUB_OUTPUT;
  if (!output) {
    return;
  }
  appendFileSync(output, `signed=${signed ? "true" : "false"}\n`);
}

export function detectCiSigning(env = process.env) {
  const signed = hasSignedDistributionMaterials(env);
  const missing = missingEnvNames(SIGNED_DISTRIBUTION_ENV, env);
  const presentCount = SIGNED_DISTRIBUTION_ENV.length - missing.length;
  if (signed) {
    console.log(
      "mac-dmg: Developer ID + notarization secrets present; building signed+notarized"
    );
  } else if (presentCount > 0) {
    console.log(
      `mac-dmg: incomplete signing secrets (${presentCount}/5). Falling back to unsigned. Missing: ${missing.join(", ")}`
    );
  } else {
    console.log(
      "mac-dmg: signing secrets not configured; building unsigned (job stays green)"
    );
  }
  writeGithubOutput(signed, env);
  return signed;
}

function main(argv) {
  if (argv.includes("--require")) {
    if (!requireSignedDistributionEnv()) {
      process.exit(1);
    }
    return;
  }
  if (argv.includes("--detect-ci")) {
    detectCiSigning();
    return;
  }
  if (argv.includes("--print-args")) {
    console.log(electronBuilderMacOverrides().join(" "));
    return;
  }
  console.error(
    "Usage: desktop-signing.mjs --require | --detect-ci | --print-args"
  );
  process.exit(1);
}

const invokedDirectly =
  process.argv[1] !== undefined &&
  import.meta.filename === resolve(process.argv[1]);

if (invokedDirectly) {
  main(process.argv.slice(2));
}
