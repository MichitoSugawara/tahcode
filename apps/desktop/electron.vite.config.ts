import { readFileSync } from "node:fs";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";

// Same tool as Multica's apps/desktop. Only `main` and `preload` are built:
// the renderer is the deployed tahcode web app, loaded by URL (see
// src/main/config.ts), so nothing from the Vite/React app is duplicated here.
const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")) as { version: string };

const define = {
  "process.env.TAHCODE_DESKTOP_VERSION": JSON.stringify(pkg.version),
};

export default defineConfig({
  main: {
    // @tahcode/core ships TypeScript sources, so it must be bundled rather
    // than left as a runtime require.
    plugins: [externalizeDepsPlugin({ exclude: ["@tahcode/core"] })],
    define,
    build: {
      lib: { entry: "src/main/index.ts" },
      sourcemap: true,
    },
  },
  preload: {
    // Sandboxed preloads can only `require("electron")`; everything else has
    // to be inlined into the single CJS bundle electron-vite emits.
    plugins: [externalizeDepsPlugin({ exclude: ["@tahcode/core"] })],
    define,
    build: {
      lib: { entry: "src/preload/index.ts" },
      sourcemap: true,
    },
  },
});
