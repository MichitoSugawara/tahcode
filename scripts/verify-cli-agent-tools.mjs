import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const bin = resolve(root, "packages/cli/dist/tahcode");
const pkg = JSON.parse(
  readFileSync(resolve(root, "packages/cli/package.json"), "utf-8")
);

if (!existsSync(bin)) {
  console.error("missing packages/cli/dist/tahcode — run npm run cli:build");
  process.exit(1);
}

const version = spawnSync(process.execPath, [bin, "--version"], {
  encoding: "utf-8",
});
const versionText = `${version.stdout}${version.stderr}`;
if (!versionText.includes(`tahcode v${pkg.version}`)) {
  console.error(
    `version mismatch: expected tahcode v${pkg.version}, got:\n${versionText}`
  );
  process.exit(1);
}

const tool = spawnSync(process.execPath, [bin, "tool"], { encoding: "utf-8" });
const toolText = `${tool.stdout}${tool.stderr}`;
if (/不明なコマンド:\s*tool/.test(toolText)) {
  console.error("tahcode tool is missing from the built CLI:\n", toolText);
  process.exit(1);
}
if (!toolText.includes("tahcode tool はジョブ実行中だけ")) {
  console.error("unexpected tahcode tool output:\n", toolText);
  process.exit(1);
}

const help = spawnSync(process.execPath, [bin, "--help"], {
  encoding: "utf-8",
});
const helpText = `${help.stdout}${help.stderr}`;
if (!helpText.includes("tahcode tool") || !helpText.includes("tool-mcp")) {
  console.error("help does not list tool / tool-mcp:\n", helpText);
  process.exit(1);
}

console.log(`ok: tahcode v${pkg.version} recognizes tool / tool-mcp`);
