// Production build for the Cloudflare Worker + static assets.
//
// This repo is Vite + a plain Worker (no opennextjs-cloudflare): the Worker
// in worker/index.ts serves ./dist via the ASSETS binding (see wrangler.jsonc).
// Keep this script as the single build entry used by CI deploy-stack --cmd.
//
// convex/_generated is gitignored, so CI must codegen before tsc/vite.
import { execFileSync } from "node:child_process";

execFileSync("npx", ["convex", "codegen"], { stdio: "inherit" });
execFileSync("npm", ["run", "build"], { stdio: "inherit" });
console.log("cf:build done (dist/ ready for wrangler)");
