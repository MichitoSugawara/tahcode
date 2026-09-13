import { appendFileSync } from "node:fs";

import { parseCloudflareUrl } from "./wrangler-classify.mjs";

const output = await new Response(process.stdin).text();
const url = parseCloudflareUrl(output);

if (!url) {
  console.error("Could not parse a Cloudflare URL from wrangler output.");
  process.exit(1);
}

const githubOutput = process.env.GITHUB_OUTPUT;
if (githubOutput) {
  appendFileSync(githubOutput, `cloudflare_url=${url}\n`);
}

console.log(`Parsed Cloudflare URL: ${url}`);
