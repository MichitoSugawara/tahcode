import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync } from "node:fs";

const ENVS = ["preview", "staging", "production"];

const [command, target] = process.argv.slice(2);
const selected = target ? [target] : ENVS;

function usage() {
  console.error(
    "Usage: node scripts/env.mjs <decrypt|encrypt> [preview|staging|production]"
  );
  process.exit(1);
}

if (command !== "decrypt" && command !== "encrypt") {
  usage();
}

for (const envName of selected) {
  if (!ENVS.includes(envName)) {
    console.error(`Unknown env: ${envName}`);
    usage();
  }
}

function runDotenvx(args) {
  const result = spawnSync("npx", ["dotenvx", ...args], {
    env: process.env,
    shell: process.platform === "win32",
    stdio: "inherit",
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function plainPath(envName) {
  return `.env.${envName}`;
}

function encPath(envName) {
  return `.env.${envName}.enc`;
}

for (const envName of selected) {
  const plain = plainPath(envName);
  const enc = encPath(envName);

  if (command === "decrypt") {
    if (!existsSync(enc)) {
      console.error(`Missing ${enc}`);
      process.exit(1);
    }
    copyFileSync(enc, plain);
    runDotenvx(["decrypt", "-f", plain]);
    console.log(`decrypted ${enc} -> ${plain}`);
    continue;
  }

  if (!existsSync(plain)) {
    console.error(`Missing ${plain}. Run npm run env:dec first.`);
    process.exit(1);
  }
  runDotenvx(["encrypt", "-f", plain]);
  copyFileSync(plain, enc);
  runDotenvx(["decrypt", "-f", plain]);
  console.log(`encrypted ${plain} -> ${enc}`);
}
