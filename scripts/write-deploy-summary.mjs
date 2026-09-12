// Append the deploy URLs to the Actions step summary (falls back to stdout
// when run outside Actions).
//
// Usage: CLOUDFLARE_URL=... CONVEX_URL=... node scripts/write-deploy-summary.mjs <preview|staging|production>
import { appendFileSync } from "node:fs";

const [name] = process.argv.slice(2);
if (!name) {
  console.error("Usage: node scripts/write-deploy-summary.mjs <name>");
  process.exit(1);
}
const cloudflareUrl = process.env.CLOUDFLARE_URL ?? "";
const convexUrl = process.env.CONVEX_URL ?? "";
const lines = [
  `## Deploy: ${name}`,
  "",
  `- Cloudflare: ${cloudflareUrl || "(unknown)"}`,
  `- Convex: ${convexUrl || "(unknown)"}`,
  "",
];
const summary = lines.join("\n");
if (process.env.GITHUB_STEP_SUMMARY) {
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
} else {
  console.log(summary);
}
