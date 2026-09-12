import { v } from "convex/values";
import { query } from "./_generated/server";

/**
 * Provider catalog ported from t3code's BUILT_IN_DRIVERS
 * (pingdotgg/t3code `apps/server/src/provider/builtInDrivers.ts`).
 * Static data only — no user data, so no auth required.
 */
export const catalog = query({
  args: {},
  returns: v.array(
    v.object({
      kind: v.union(
        v.literal("codex"),
        v.literal("claudeAgent"),
        v.literal("cursor"),
        v.literal("grok"),
        v.literal("opencode"),
        v.literal("antigravity"),
      ),
      displayName: v.string(),
      binaryNames: v.array(v.string()),
      headlessSummary: v.string(),
    }),
  ),
  handler: async () => {
    return [
      {
        kind: "codex" as const,
        displayName: "Codex",
        binaryNames: ["codex"],
        headlessSummary: "codex exec --json (t3code CodexDriver)",
      },
      {
        kind: "claudeAgent" as const,
        displayName: "Claude",
        binaryNames: ["claude"],
        headlessSummary: "claude -p --output-format stream-json (t3code ClaudeDriver)",
      },
      {
        kind: "cursor" as const,
        displayName: "Cursor",
        binaryNames: ["agent", "cursor-agent"],
        headlessSummary: "agent -p --output-format stream-json (t3code CursorDriver)",
      },
      {
        kind: "grok" as const,
        displayName: "Grok",
        binaryNames: ["grok"],
        headlessSummary: "grok --prompt (t3code GrokDriver)",
      },
      {
        kind: "opencode" as const,
        displayName: "OpenCode",
        binaryNames: ["opencode"],
        headlessSummary: "opencode run (t3code OpenCodeDriver)",
      },
      {
        kind: "antigravity" as const,
        displayName: "Antigravity",
        binaryNames: ["antigravity", "agy"],
        headlessSummary: "native installer + Google sign-in (t3code AntigravityDriver)",
      },
    ];
  },
});
