import { readFileSync } from "node:fs";

const SECRET_KEYS = new Set([
  "CONVEX_DEPLOY_KEY",
  "CLOUDFLARE_API_TOKEN",
  "JWT_PRIVATE_KEY",
  "JWKS",
  "AUTH_GOOGLE_SECRET",
]);

const file = process.argv[2];
if (!file) {
  console.error("Usage: node scripts/mask-env.mjs <env-file>");
  process.exit(1);
}

for (const line of readFileSync(file, "utf-8").split("\n")) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
    continue;
  }
  const index = trimmed.indexOf("=");
  const key = trimmed.slice(0, index);
  if (!SECRET_KEYS.has(key)) {
    continue;
  }
  const value = trimmed.slice(index + 1).replaceAll(/^["']|["']$/g, "");
  if (value.length > 8) {
    console.log(`::add-mask::${value}`);
  }
}
