export const PROVIDER_DRIVER_KINDS = [
  "codex",
  "claudeAgent",
  "cursor",
  "grok",
  "opencode",
  "antigravity",
] as const;

export type ProviderDriverKind = (typeof PROVIDER_DRIVER_KINDS)[number];

export const mentionToProvider: Record<string, ProviderDriverKind> = {
  codex: "codex",
  claude: "claudeAgent",
  claudeagent: "claudeAgent",
  cursor: "cursor",
  agent: "cursor",
  grok: "grok",
  opencode: "opencode",
  antigravity: "antigravity",
  agy: "antigravity",
};
