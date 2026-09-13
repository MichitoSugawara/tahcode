import { defineConfig } from "oxlint";
import antiSlop from "ultracite/oxlint/anti-slop";
import core from "ultracite/oxlint/core";
import react from "ultracite/oxlint/react";
import vitest from "ultracite/oxlint/vitest";

const projectIgnores = [
  "**/*.enc",
  "**/.env.keys",
  "**/.env.preview",
  "**/.env.staging",
  "**/.env.production",
  "**/artifacts",
  "**/agent-tools",
  "**/.tahcode",
];

export default defineConfig({
  extends: [core, react, vitest, antiSlop],
  ignorePatterns: [...core.ignorePatterns, ...projectIgnores],
  rules: {
    // React / Beautiful UI: PascalCase component files (Button.tsx, PromptBar.tsx).
    "unicorn/filename-case": "off",

    // Existing helpers and components use function declarations.
    "func-style": "off",
    "react/function-component-definition": "off",

    // Convex schema and insert documents keep domain field order, not A–Z.
    "sort-keys": "off",

    // Sequential ctx.db writes and CLI spawn loops are intentional.
    "no-await-in-loop": "off",

    // UI mutation fire-and-forget and Node callback CLIs use .then() / new Promise.
    "promise/prefer-await-to-then": "off",
    "promise/prefer-await-to-callbacks": "off",
    "promise/avoid-new": "off",
    "promise/prefer-catch": "off",
    "promise/no-nesting": "off",

    // Compact UI mappings; extracting every ternary is a later cleanup.
    "no-nested-ternary": "off",

    // Mention / slug / env parsers are ASCII-only by spec.
    "require-unicode-regexp": "off",
    "prefer-named-capture-group": "off",

    // Module-level helpers are often declared below first use.
    "no-use-before-define": "off",

    // Convex handlers and harness shells exceed the default cyclomatic cap.
    complexity: "off",

    // Vite / Vitest config files use __dirname path aliases.
    "unicorn/prefer-module": "off",

    // Matches adhd-stack: symbol names that encode a type shape are common
    // in provider/model identifiers and Convex table helpers.
    "anti-slop/no-shape-in-symbol-names": "off",

    // Existing codebase has many `as` assertions; SAFETY comments on each
    // would be noise rather than evidence. Keep the other anti-slop rules on.
    "anti-slop/require-safety-comment-for-type-assertion": "off",

    // UI / runtime type narrowing and catch/event parameters are `unknown`.
    "anti-slop/no-runtime-typeof": "off",
    "anti-slop/no-known-value-widening": "off",
    "anti-slop/no-unknown-parameters": "off",
    "anti-slop/no-unknown-returns": "off",
    "anti-slop/no-unsafe-dictionary-type": "off",

    // React Compiler nursery: existing effects sync Convex/router state.
    "react/set-state-in-effect": "off",
    "react/exhaustive-effect-dependencies": "off",
    "react/todo": "off",
    "react/rule-suppression": "off",
    "react/purity": "off",
    "react/display-name": "off",
    "react/no-object-type-as-default-prop": "off",
    "react/jsx-handler-names": "off",
    "react/jsx-no-useless-fragment": "off",

    // Style nits on existing UI / parsers; not part of this package's rewrite.
    "typescript/no-non-null-assertion": "off",
    "no-shadow": "off",
    "no-plusplus": "off",
    "no-void": "off",
    "no-inline-comments": "off",
    "prefer-destructuring": "off",
    "no-empty-function": "off",
    "default-case": "off",
    "require-await": "off",
    "no-bitwise": "off",
    "no-alert": "off",
    "no-promise-executor-return": "off",
    "unicorn/prefer-export-from": "off",
    "unicorn/prefer-ternary": "off",
    "unicorn/prefer-code-point": "off",
    "unicorn/prefer-query-selector": "off",
    "unicorn/prefer-native-coercion-functions": "off",
    "unicorn/prefer-response-static-json": "off",
    "unicorn/prefer-spread": "off",
    "unicorn/no-await-expression-member": "off",
    "unicorn/no-array-for-each": "off",
    "unicorn/no-array-reverse": "off",
    "unicorn/no-array-sort": "off",
    "unicorn/no-negated-condition": "off",
    "unicorn/no-useless-collection-argument": "off",
    "unicorn/consistent-function-scoping": "off",
    "unicorn/custom-error-definition": "off",
    "unicorn/import-style": "off",
    "unicorn/numeric-separators-style": "off",
    "unicorn/catch-error-name": "off",
    "unicorn/switch-case-braces": "off",
    "jsx-a11y/prefer-tag-over-role": "off",
    "jsx-a11y/mouse-events-have-key-events": "off",
    "vitest/max-expects": "off",
  },
});
