import { appendFileSync } from "node:fs";

import { resolvePublicSiteUrl } from "./wrangler-classify.mjs";

const environment = process.argv[2] ?? "deploy";
const cloudflareUrl = process.env.CLOUDFLARE_URL ?? "";
const publicSiteUrl = resolvePublicSiteUrl({
  cloudflareUrl,
  name: environment,
  override: process.env.PUBLIC_SITE_URL,
});
const convexUrl = process.env.CONVEX_URL ?? "";

const lines = [
  `## ${environment}`,
  "",
  publicSiteUrl ? `- **App:** ${publicSiteUrl}` : "- **App:** (missing)",
  cloudflareUrl && cloudflareUrl !== publicSiteUrl
    ? `- **Worker:** ${cloudflareUrl}`
    : null,
  convexUrl ? `- **Convex:** ${convexUrl}` : null,
  "",
].filter((line) => line !== null);

const body = `${lines.join("\n")}\n`;
process.stdout.write(body);

const summary = process.env.GITHUB_STEP_SUMMARY;
if (summary) {
  appendFileSync(summary, body);
}

if (publicSiteUrl) {
  console.log(`::notice title=${environment} app::${publicSiteUrl}`);
}
if (cloudflareUrl && cloudflareUrl !== publicSiteUrl) {
  console.log(`::notice title=${environment} worker::${cloudflareUrl}`);
}
