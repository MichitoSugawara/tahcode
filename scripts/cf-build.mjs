// Production build for the Cloudflare Worker + static assets.
//
// This repo is Vite + a plain Worker (no opennextjs-cloudflare): the Worker
// in worker/index.ts serves ./dist via the ASSETS binding (see wrangler.jsonc).
// Keep this script as the single build entry used by CI deploy-stack --cmd.
//
// convex/_generated is gitignored, and `convex deploy` runs this --cmd BEFORE it
// pushes/generates code, so we must codegen here first.
//
// `convex codegen` refuses to run with a *preview* CONVEX_DEPLOY_KEY
// ("Codegen requires an existing deployment so doesn't support CONVEX_DEPLOY_KEY"),
// which broke every PR preview build. During `convex deploy --cmd` the target
// deployment already exists and its URL is injected as VITE_CONVEX_URL, so we
// fall back to codegen against that URL with the deploy key as the admin key.
// Passing --url/--admin-key selects an existing deployment and bypasses the
// preview guard. Plain codegen still runs first so staging/production and local
// builds are unchanged.
import { execFileSync } from "node:child_process";

function codegen(args) {
  execFileSync("npx", ["convex", "codegen", ...args], { stdio: "inherit" });
}

try {
  codegen([]);
} catch (error) {
  const url = process.env.VITE_CONVEX_URL;
  const adminKey = process.env.CONVEX_DEPLOY_KEY;
  if (!url || !adminKey) {
    throw error;
  }
  console.log(
    "convex codegen failed with the deploy key; retrying against the deployment URL (preview path)…"
  );
  codegen(["--url", url, "--admin-key", adminKey]);
}

execFileSync("npm", ["run", "build"], { stdio: "inherit" });
console.log("cf:build done (dist/ ready for wrangler)");
