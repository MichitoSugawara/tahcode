// dotenvx-style encrypted env flow for deploy targets.
// Committed:  .env.preview.enc / .env.staging.enc / .env.production.enc
// Plaintext:  .env.preview / .env.staging / .env.production (gitignored)
//
// Usage:
//   DOTENV_PRIVATE_KEY_PREVIEW=... node scripts/env.mjs decrypt preview
//   DOTENV_PRIVATE_KEY_PREVIEW=... node scripts/env.mjs encrypt preview
//   (omit the name to operate on all three targets)
//
// The key comes from DOTENV_PRIVATE_KEY_<NAME> (GitHub secret per target).
// File format is JSON: { alg: "aes-256-gcm", iv, tag, data } (base64).
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const TARGETS = ["preview", "staging", "production"];

function keyFor(name) {
  const envVar = `DOTENV_PRIVATE_KEY_${name.toUpperCase()}`;
  const secret = process.env[envVar];
  if (!secret) {
    console.error(`Missing ${envVar}. Set it from the GitHub secret of the same name.`);
    process.exit(1);
  }
  return createHash("sha256").update(secret, "utf8").digest();
}

function encryptFile(name) {
  const plain = `.env.${name}`;
  const enc = `${plain}.enc`;
  if (!existsSync(plain)) {
    console.error(`Missing ${plain}. Copy .env.example and fill in deploy secrets first.`);
    process.exit(1);
  }
  const key = keyFor(name);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const data = Buffer.concat([
    cipher.update(readFileSync(plain, "utf8"), "utf8"),
    cipher.final(),
  ]);
  writeFileSync(
    enc,
    JSON.stringify({
      alg: "aes-256-gcm",
      iv: iv.toString("base64"),
      tag: cipher.getAuthTag().toString("base64"),
      data: data.toString("base64"),
    }) + "\n",
  );
  console.log(`Wrote ${enc} (commit this file)`);
}

function decryptFile(name) {
  const plain = `.env.${name}`;
  const enc = `${plain}.enc`;
  if (!existsSync(enc)) {
    console.error(
      `Missing ${enc}. Ask a maintainer to run \`npm run env:enc -- ${name}\` and commit it.`,
    );
    process.exit(1);
  }
  const key = keyFor(name);
  const payload = JSON.parse(readFileSync(enc, "utf8"));
  if (payload.alg !== "aes-256-gcm") {
    console.error(`Unsupported alg in ${enc}: ${payload.alg}`);
    process.exit(1);
  }
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(payload.iv, "base64"),
  );
  decipher.setAuthTag(Buffer.from(payload.tag, "base64"));
  const data = Buffer.concat([
    decipher.update(Buffer.from(payload.data, "base64")),
    decipher.final(),
  ]);
  writeFileSync(plain, data.toString("utf8"));
  console.log(`Wrote ${plain} (gitignored, do not commit)`);
}

const [command, only] = process.argv.slice(2);
if (command !== "encrypt" && command !== "decrypt") {
  console.error("Usage: node scripts/env.mjs <encrypt|decrypt> [preview|staging|production]");
  process.exit(1);
}
const names = only ? [only] : TARGETS;
for (const name of names) {
  if (!TARGETS.includes(name)) {
    console.error(`Unknown target: ${name}`);
    process.exit(1);
  }
  if (command === "encrypt") encryptFile(name);
  else decryptFile(name);
}
