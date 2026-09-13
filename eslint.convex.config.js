import convexPlugin from "@convex-dev/eslint-plugin";
import tseslint from "typescript-eslint";

/**
 * Narrow ESLint path for Convex-only rules that Oxlint does not cover
 * (argument validators, registered-function syntax, explicit table IDs).
 * Kept off the Ultracite-detected `eslint.config.*` filenames so Oxlint
 * remains the primary toolchain.
 */
export default tseslint.config(
  {
    ignores: ["convex/_generated/**"],
  },
  {
    files: ["convex/**/*.ts"],
    languageOptions: {
      parser: tseslint.parser,
    },
  },
  ...convexPlugin.configs.recommended
);
