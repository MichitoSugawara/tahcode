import { defineConfig } from "oxfmt";
import ultracite from "ultracite/oxfmt";

export default defineConfig({
  ...ultracite,
  ignorePatterns: [
    ...(ultracite.ignorePatterns ?? []),
    "**/*.enc",
    "**/.env.keys",
    "**/.env.preview",
    "**/.env.staging",
    "**/.env.production",
    "**/artifacts",
    "**/agent-tools",
    "**/.tahcode",
    "**/.agents/skills/**",
    "**/.claude/skills/**",
    "**/apps/desktop/out/**",
    "**/apps/desktop/release/**",
    "**/src/harness/workbench/terminal/ghostty/**",
  ],
});
