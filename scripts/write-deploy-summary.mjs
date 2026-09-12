import { appendFileSync } from "node:fs";

const environment = process.argv[2] ?? "deploy";
const cloudflareUrl = process.env.CLOUDFLARE_URL ?? "";
const convexUrl = process.env.CONVEX_URL ?? "";

const lines = [
  `## ${environment}`,
  "",
  cloudflareUrl ? `- **App:** ${cloudflareUrl}` : "- **App:** (missing)",
  convexUrl ? `- **Convex:** ${convexUrl}` : null,
  "",
].filter((line) => line !== null);

const body = `${lines.join("\n")}\n`;
process.stdout.write(body);

const summary = process.env.GITHUB_STEP_SUMMARY;
if (summary) {
  appendFileSync(summary, body);
}

if (cloudflareUrl) {
  console.log(`::notice title=${environment} app::${cloudflareUrl}`);
}
