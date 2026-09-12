export const AGENT_HANDLES = [
  { handle: "agent", label: "@agent — このチャットのエージェント", kind: "agent" },
  { handle: "codex", label: "@codex — Codex で実行", kind: "provider" },
  { handle: "claude", label: "@claude — Claude で実行", kind: "provider" },
  { handle: "cursor", label: "@cursor — Cursor で実行", kind: "provider" },
  { handle: "grok", label: "@grok — Grok で実行", kind: "provider" },
  { handle: "opencode", label: "@opencode — OpenCode で実行", kind: "provider" },
  { handle: "antigravity", label: "@antigravity — Antigravity（要セットアップ）", kind: "provider" },
] as const;

const HANDLE_RE = /@([a-zA-Z0-9_./-]*)$/;

export function activeMentionQuery(text: string, cursor: number): string | null {
  const before = text.slice(0, cursor);
  const match = before.match(HANDLE_RE);
  if (!match) return null;
  if (/(^|\s)@$/.test(before.slice(-2)) || before.includes("@")) {
    return match[1] ?? "";
  }
  return null;
}

export function hasAgentMention(text: string): boolean {
  return /(^|\s)@(agent|harness|codex|claude|claudeagent|cursor|grok|opencode|antigravity|agy|rt-|runtime-)/i.test(
    text,
  );
}
