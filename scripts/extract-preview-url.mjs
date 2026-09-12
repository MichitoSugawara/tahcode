// Parse the Cloudflare URL out of wrangler output (stdin) and expose it as
// the `cloudflare_url` step output.
//
// Handles both `wrangler versions upload` ("Version Preview URL: https://…")
// and `wrangler deploy` ("https://….workers.dev") output shapes.
//
// Usage: npx wrangler ... | tee /tmp/wrangler.out; node scripts/extract-preview-url.mjs < /tmp/wrangler.out
import { readFileSync, appendFileSync } from "node:fs";

const input = readFileSync(0, "utf8");
const patterns = [
  /Version Preview URL:\s*(https:\/\/\S+)/i,
  /Version Preview Alias URL:\s*(https:\/\/\S+)/i,
  /Preview Alias:\s*(https:\/\/\S+)/i,
  /Preview URL:\s*(https:\/\/\S+)/i,
  /(https:\/\/[A-Za-z0-9.-]+\.workers\.dev\S*)/,
];
let url = "";
for (const pattern of patterns) {
  const match = input.match(pattern);
  if (match?.[1]) {
    url = match[1].replace(/[),."]+$/, "");
    break;
  }
}
if (!url) {
  console.error("Could not find a Cloudflare URL in wrangler output.");
  console.error(input.slice(0, 2000));
  process.exit(1);
}
console.log(`Cloudflare URL: ${url}`);
const outputFile = process.env.GITHUB_OUTPUT;
if (outputFile) {
  appendFileSync(outputFile, `cloudflare_url=${url}\n`);
} else {
  console.log(`cloudflare_url=${url}`);
}
