import convexPlugin from "@convex-dev/eslint-plugin";
import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

export default [
  {
    ignores: [
      "dist/**",
      "node_modules/**",
      "convex/_generated/**",
      "agent-tools/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...convexPlugin.configs.recommended,
  {
    files: ["src/**/*.{ts,tsx}", "runtime/**/*.ts", "worker/**/*.ts", "shared/**/*.ts"],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
];
