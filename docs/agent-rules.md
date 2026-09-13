# tahcode — product rules for agents

These rules are **product-specific**. Ultracite code standards live in `AGENTS.md` and the Ultracite skill.

## What tahcode is

tahcode（ターコード、_team agent harness_）is a **multi-harness control plane**. It invokes **real provider CLIs** on the user's machine:

- Codex (`codex`)
- Claude (`claude`)
- Cursor (`agent`)
- OpenCode (`opencode`)
- plus Grok / Antigravity in the catalog

It is **not** an OpenCodex-style single-harness-by-default product. Do not collapse providers into one generic runner or invent a “default harness” that bypasses the named CLI.

## Harness-native features

Expose **harness-native** capabilities (for example Codex imagegen, provider-specific model flags, CLI auth flows). Do not reduce the product to a lowest-common-denominator (LCM) prompt pipe. If a provider CLI has a first-class flag or UX, prefer wiring that through rather than reimplementing a generic subset.

## Stack

- **UI:** Vite + React 19 + Tailwind v4 + Beautiful UI
- **Data / realtime / auth:** Convex (`convex/`) + Convex Auth
- **Hosting / files:** Cloudflare Workers (`worker/`, `wrangler.jsonc`) + R2
- **Runtime:** `packages/cli` (`tahcode`) wraps Multica daemon + `runtime/` bridges jobs to local CLIs

Prefer **Japanese** for user-facing product copy (toasts, empty states, validation, dialogs) when the surrounding UI is already Japanese. Keep code identifiers, commits, and technical comments in English unless the file is already Japanese.

## Where to read first

- Product scope, journeys, providers: [`README.md`](../README.md)
- Provider catalog: `shared/providers.ts`
- Mentions / `@provider/model`: `shared/mentions.ts`
- Headless CLI execution: `runtime/src/providers.ts`
- Convex access + custom functions: `convex/lib/`

Do not commit secrets, decrypted env files, `.tahcode/` tokens, or `.staging-deploy-key`. Encrypted env is `.env.<name>.enc` only.

## Convex skills

Convex changes must follow the official skills in `.agents/skills/` (`/convex`, `/convex-setup-auth`, `/convex-migration-helper` / `convex-migrate`, `/convex-create-component`, `/convex-performance-audit` / `convex-optimize`, etc.). See [Convex Agent Skills](https://docs.convex.dev/ai/agent-skills). These are repo-local so Cloud Agents can load them; do not rely on the Cursor Marketplace plugin alone.
