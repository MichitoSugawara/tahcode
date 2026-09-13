import { chmodSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

// Bundles the CLI (and the bridge it reuses from ../../runtime + ../../shared)
// into a single ESM file so `npm publish` ships without workspace links.
import { build } from "esbuild";

const here = import.meta.dirname;
const outfile = resolve(here, "dist/tahcode");
mkdirSync(dirname(outfile), { recursive: true });

await build({
  banner: { js: "#!/usr/bin/env node" },
  bundle: true,
  entryPoints: [resolve(here, "src/index.ts")],
  external: ["convex", "convex/*"],
  format: "esm",
  logLevel: "info",
  outfile,
  platform: "node",
  target: "node20",
});
chmodSync(outfile, 0o755);
