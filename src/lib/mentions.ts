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

/* What may precede an @: the start of the text or anything that can't be
 * part of an email-like local part, so `foo@bar.com` stays plain while
 * Japanese text such as `確認して。@codex` or `これを@claudeに` (no spaces)
 * still reads as a mention — the server parser has no boundary at all. */
export const MENTION_BOUNDARY = "(^|[^A-Za-z0-9_@.+-])";
/* handle charset mirrors shared/mentions.ts, which already admits the
 * `@provider/model` form like `@cursor/muse-spark-1.3` */
export const MENTION_HANDLE = "[A-Za-z0-9_./-]";

/* Display-side tokenizer shared by the message bubble and the composer
 * overlay so a mention is painted identically while typing and once sent. */
const MENTION_TOKEN = new RegExp(`${MENTION_BOUNDARY}(@${MENTION_HANDLE}+)`, "g");

export type MentionSegment = { kind: "text" | "mention"; value: string };

export function segmentMentions(text: string): MentionSegment[] {
  const segments: MentionSegment[] = [];
  let last = 0;
  for (const match of text.matchAll(MENTION_TOKEN)) {
    const mention = match[2] ?? "";
    const index = (match.index ?? 0) + (match[1]?.length ?? 0);
    if (index > last) segments.push({ kind: "text", value: text.slice(last, index) });
    segments.push({ kind: "mention", value: mention });
    last = index + mention.length;
  }
  if (last < text.length) segments.push({ kind: "text", value: text.slice(last) });
  return segments;
}

const AGENT_MENTION = new RegExp(
  `${MENTION_BOUNDARY}@(agent|harness|codex|claude|claudeagent|cursor|grok|opencode|antigravity|agy|rt-|runtime-)`,
  "i",
);

export function hasAgentMention(text: string): boolean {
  return AGENT_MENTION.test(text);
}
