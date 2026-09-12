// Emit ::add-mask:: for every non-empty value in a dotenv file so decrypted
// secrets never leak into Actions logs.
//
// Usage: node scripts/mask-env.mjs .env.preview
import { readFileSync } from "node:fs";

const [file] = process.argv.slice(2);
if (!file) {
  console.error("Usage: node scripts/mask-env.mjs <dotenv-file>");
  process.exit(1);
}

for (const line of readFileSync(file, "utf8").split("\n")) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const index = trimmed.indexOf("=");
  if (index === -1) continue;
  let value = trimmed.slice(index + 1).trim();
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }
  if (value) console.log(`::add-mask::${value}`);
}
