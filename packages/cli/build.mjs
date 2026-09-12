// Bundles the CLI (and the bridge it reuses from ../../runtime + ../../shared)
// into a single ESM file so `npm publish` ships without workspace links.
import { build } from "esbuild";
import { chmodSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const outfile = resolve(here, "dist/dalecode");
mkdirSync(dirname(outfile), { recursive: true });

await build({
  entryPoints: [resolve(here, "src/index.ts")],
  outfile,
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  external: ["convex", "convex/*"],
  banner: { js: "#!/usr/bin/env node" },
  logLevel: "info",
});
chmodSync(outfile, 0o755);
