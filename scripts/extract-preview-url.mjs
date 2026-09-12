import { appendFileSync } from "node:fs";

const output = await new Response(process.stdin).text();

const aliasMatch = output.match(/Version Preview Alias URL:\s+(\S+)/);
const previewMatch = output.match(/Version Preview URL:\s+(\S+)/);
const publishedMatch = output.match(/https:\/\/[a-z0-9.-]+\.workers\.dev\/?/i);
const url = aliasMatch?.[1] ?? previewMatch?.[1] ?? publishedMatch?.[0];

if (!url) {
  console.error("Could not parse a Cloudflare URL from wrangler output.");
  process.exit(1);
}

const githubOutput = process.env.GITHUB_OUTPUT;
if (githubOutput) {
  appendFileSync(githubOutput, `cloudflare_url=${url}\n`);
}

console.log(`Parsed Cloudflare URL: ${url}`);
