// Bundles the Electron main process and the preload script into dist/.
// Both are emitted as CommonJS: sandboxed preload scripts cannot be ESM, and
// keeping main in CJS too avoids the ESM/CJS split that trips up
// electron-builder's asar packaging.
import { build } from "esbuild";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(resolve(here, "package.json"), "utf8"));
mkdirSync(resolve(here, "dist"), { recursive: true });

const shared = {
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node22",
  external: ["electron"],
  sourcemap: true,
  logLevel: "info",
  define: {
    "process.env.DALECODE_DESKTOP_VERSION": JSON.stringify(pkg.version),
  },
};

await Promise.all([
  build({ ...shared, entryPoints: [resolve(here, "src/main/index.ts")], outfile: resolve(here, "dist/main.cjs") }),
  build({ ...shared, entryPoints: [resolve(here, "src/preload/index.ts")], outfile: resolve(here, "dist/preload.cjs") }),
]);
