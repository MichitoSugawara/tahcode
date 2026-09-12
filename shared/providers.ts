/**
 * Provider kinds and metadata, ported from t3code's BUILT_IN_DRIVERS.
 * Source of truth: pingdotgg/t3code `apps/server/src/provider/builtInDrivers.ts`
 *
 *   CodexDriver, ClaudeDriver, CursorDriver, GrokDriver, OpenCodeDriver, AntigravityDriver
 */
export const PROVIDER_DRIVER_KINDS = [
  "codex",
  "claudeAgent",
  "cursor",
  "grok",
  "opencode",
  "antigravity",
] as const;

export type ProviderDriverKind = (typeof PROVIDER_DRIVER_KINDS)[number];

export type ProviderCatalogEntry = {
  kind: ProviderDriverKind;
  displayName: string;
  binaryNames: readonly string[];
  mentionHandles: readonly string[];
  headlessSummary: string;
};

export const PROVIDER_CATALOG: readonly ProviderCatalogEntry[] = [
  {
    kind: "codex",
    displayName: "Codex",
    binaryNames: ["codex"],
    mentionHandles: ["codex"],
    headlessSummary: "codex exec --json (t3code CodexDriver / app-server)",
  },
  {
    kind: "claudeAgent",
    displayName: "Claude",
    binaryNames: ["claude"],
    mentionHandles: ["claude", "claudeagent"],
    headlessSummary: "claude -p --output-format stream-json (t3code ClaudeDriver / Agent SDK)",
  },
  {
    kind: "cursor",
    displayName: "Cursor",
    binaryNames: ["agent", "cursor-agent"],
    mentionHandles: ["cursor", "agent"],
    headlessSummary: "agent -p --output-format stream-json (t3code CursorDriver / ACP)",
  },
  {
    kind: "grok",
    displayName: "Grok",
    binaryNames: ["grok"],
    mentionHandles: ["grok"],
    headlessSummary: "grok --prompt (t3code GrokDriver)",
  },
  {
    kind: "opencode",
    displayName: "OpenCode",
    binaryNames: ["opencode"],
    mentionHandles: ["opencode"],
    headlessSummary: "opencode run (t3code OpenCodeDriver)",
  },
  {
    kind: "antigravity",
    displayName: "Antigravity",
    binaryNames: ["antigravity", "agy"],
    mentionHandles: ["antigravity", "agy"],
    headlessSummary: "native installer / Sign in with Google (t3code AntigravityDriver)",
  },
] as const;

export const MENTION_TO_PROVIDER: Record<string, ProviderDriverKind> = Object.fromEntries(
  PROVIDER_CATALOG.flatMap((entry) =>
    entry.mentionHandles.map((handle) => [handle, entry.kind] as const),
  ),
) as Record<string, ProviderDriverKind>;

export function isProviderDriverKind(value: string): value is ProviderDriverKind {
  return (PROVIDER_DRIVER_KINDS as readonly string[]).includes(value);
}

export function catalogFor(kind: ProviderDriverKind): ProviderCatalogEntry {
  const entry = PROVIDER_CATALOG.find((item) => item.kind === kind);
  if (!entry) {
    throw new Error(`Unknown provider kind: ${kind}`);
  }
  return entry;
}
