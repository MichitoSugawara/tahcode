/**
 * Run electron-builder with signed/unsigned macOS overrides from
 * desktop-signing.mjs. Forwards every CLI argument (targets, --projectDir,
 * --publish, …).
 */

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

import {
  electronBuilderMacOverrides,
  wantsSignedBuild,
} from "./desktop-signing.mjs";

const here = import.meta.dirname;
const desktopRoot = join(here, "..");
const repoRoot = join(desktopRoot, "../..");

function resolveBuilderCli() {
  const requireFromDesktop = createRequire(join(desktopRoot, "package.json"));
  try {
    return requireFromDesktop.resolve("electron-builder/cli.js");
  } catch {
    const hoisted = join(repoRoot, "node_modules/electron-builder/cli.js");
    if (existsSync(hoisted)) {
      return hoisted;
    }
    throw new Error("electron-builder is not installed; run npm install");
  }
}

const signed = wantsSignedBuild();
const overrides = electronBuilderMacOverrides();
const env = {
  ...process.env,
  CSC_IDENTITY_AUTO_DISCOVERY:
    process.env.CSC_IDENTITY_AUTO_DISCOVERY ?? (signed ? "true" : "false"),
};

console.log(
  signed
    ? "electron-builder: signed macOS path (Developer ID; notarize if Apple env is set)"
    : "electron-builder: unsigned macOS path (mac.identity=null)"
);

const child = spawn(
  process.execPath,
  [resolveBuilderCli(), ...process.argv.slice(2), ...overrides],
  { env, stdio: "inherit" }
);

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
