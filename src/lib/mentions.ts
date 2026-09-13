import { classifyMention, parseMentions, type ParsedMention } from "@shared/mentions.ts";
import { MENTION_TO_PROVIDER, type ProviderDriverKind } from "@shared/providers.ts";

export { parseMentions };
export type { ParsedMention };

/* What may precede an @: the start of the text or anything that can't be
 * part of an email-like local part, so `foo@bar.com` stays plain while
 * Japanese text such as `確認して。@codex` or `これを@claudeに` (no spaces)
 * still reads as a mention — the server parser has no boundary at all. */
export const MENTION_BOUNDARY = "(^|[^A-Za-z0-9_@.+-])";
/* handle charset mirrors shared/mentions.ts, which admits the
 * `@provider/model` form like `@cursor/muse-spark-1.3` */
export const MENTION_HANDLE = "[A-Za-z0-9_./-]";

const MENTION_TOKEN = new RegExp(`${MENTION_BOUNDARY}(@${MENTION_HANDLE}+)`, "g");
/* sentence punctuation right after a handle (`@claude.` / `@cursor/`) is not
 * part of it — same rule as the server parser */
const TRAILING_PUNCTUATION = /[./]+$/;

export type MentionSegment = { kind: "text" | "mention"; value: string };

/* Display-side tokenizer shared by the message bubble and the composer
 * overlay so a mention is painted identically while typing and once sent. */
export function segmentMentions(text: string): MentionSegment[] {
  const segments: MentionSegment[] = [];
  let last = 0;
  for (const match of text.matchAll(MENTION_TOKEN)) {
    const mention = (match[2] ?? "").replace(TRAILING_PUNCTUATION, "");
    if (mention.length < 2) continue;
    const index = (match.index ?? 0) + (match[1]?.length ?? 0);
    if (index > last) segments.push({ kind: "text", value: text.slice(last, index) });
    segments.push({ kind: "mention", value: mention });
    last = index + mention.length;
  }
  if (last < text.length) segments.push({ kind: "text", value: text.slice(last) });
  return segments;
}

/** Does the text already address an agent (`@agent`, `@cursor`, `@cursor/muse-spark-1.3`, `@rt-office`)?
 *  Tokens are found with the display boundary (so a chip always means "yes")
 *  and classified by the server's rules. */
export function hasAgentMention(text: string): boolean {
  return segmentMentions(text).some((segment) => {
    if (segment.kind !== "mention") return false;
    const kind = classifyMention(segment.value.slice(1)).kind;
    return kind === "agent" || kind === "provider" || kind === "runtime";
  });
}

export type AgentToken = {
  /** provider handle as typed, lowercased (`cursor`) */
  handle: string;
  providerKind: ProviderDriverKind;
  /** text typed after the slash, if the user is already inside the model part */
  modelQuery: string | null;
};

const ACTIVE_AGENT_TOKEN = new RegExp(`${MENTION_BOUNDARY}@([A-Za-z0-9_.-]+)(?:/(${MENTION_HANDLE}*))?$`);

/**
 * The `@…` token being typed at the end of the draft, when it names a
 * provider. `@cursor/mu` → `{ handle: "cursor", providerKind: "cursor",
 * modelQuery: "mu" }`; `@cur` → `modelQuery: null`; `@mai` → `null`.
 */
export function activeAgentToken(draft: string): AgentToken | null {
  const match = ACTIVE_AGENT_TOKEN.exec(draft);
  if (!match) return null;
  const handle = (match[2] ?? "").toLowerCase();
  // `@agent` means "this chat's default agent", never a provider handle here.
  if (handle === "agent" || handle === "harness") return null;
  const providerKind = MENTION_TO_PROVIDER[handle];
  if (!providerKind) return null;
  return { handle, providerKind, modelQuery: match[3] === undefined ? null : match[3] };
}
