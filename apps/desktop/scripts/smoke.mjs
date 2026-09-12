// Launches the built shell once, lets it render, saves a screenshot and exits.
// Used by the desktop CI workflow on Linux and handy for a quick local check:
//   node scripts/smoke.mjs [out.png] [--url=https://…]
// On Linux without a display it wraps Electron in xvfb-run when available.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const require = createRequire(import.meta.url);
const electronBinary = require("electron");

const positional = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
const passthrough = process.argv.slice(2).filter((arg) => arg.startsWith("--"));
const out = resolve(positional[0] ?? resolve(root, "release/smoke.png"));
mkdirSync(dirname(out), { recursive: true });

const args = [root, ...passthrough];
if (process.platform === "linux") {
  // Chromium's SUID sandbox is unavailable on most CI runners and in containers.
  args.push("--no-sandbox", "--disable-gpu");
}

let command = electronBinary;
if (process.platform === "linux" && !process.env.DISPLAY && !process.env.WAYLAND_DISPLAY) {
  const hasXvfb = spawnSync("sh", ["-c", "command -v xvfb-run"], { stdio: "ignore" }).status === 0;
  if (!hasXvfb) {
    console.error("smoke: no DISPLAY and xvfb-run is not installed (apt-get install xvfb)");
    process.exit(1);
  }
  args.unshift("--auto-servernum", "--server-args=-screen 0 1440x900x24", command);
  command = "xvfb-run";
}

const result = spawnSync(command, args, {
  stdio: "inherit",
  env: { ...process.env, DALECODE_DESKTOP_SMOKE: out, ELECTRON_ENABLE_LOGGING: process.env.ELECTRON_ENABLE_LOGGING ?? "0" },
  timeout: Number(process.env.DALECODE_DESKTOP_SMOKE_TIMEOUT_MS ?? 45000) + 30000,
});

if (result.error) {
  console.error("smoke: failed to start electron", result.error);
  process.exit(1);
}
if (result.status !== 0 || !existsSync(out)) {
  console.error(`smoke: electron exited with ${result.status}; screenshot ${existsSync(out) ? "written" : "missing"}`);
  process.exit(result.status || 1);
}
console.log(`smoke: ok -> ${out}`);
