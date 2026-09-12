import { MENTION_TO_PROVIDER, type ProviderDriverKind } from "./providers.ts";

export type MentionKind = "user" | "runtime" | "provider" | "agent";

export type ParsedMention = {
  kind: MentionKind;
  handle: string;
  raw: string;
  providerKind?: ProviderDriverKind;
};

const MENTION_RE = /@([a-zA-Z0-9_./-]+)/g;

export function parseMentions(text: string): ParsedMention[] {
  const found: ParsedMention[] = [];
  const seen = new Set<string>();
  for (const match of text.matchAll(MENTION_RE)) {
    const handle = match[1];
    if (!handle) continue;
    const key = handle.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    found.push(classifyMention(handle, match[0] ?? `@${handle}`));
  }
  return found;
}

export function classifyMention(handle: string, raw = `@${handle}`): ParsedMention {
  const key = handle.toLowerCase();
  if (key === "agent" || key === "harness") {
    return { kind: "agent", handle: key, raw };
  }
  const providerKind = MENTION_TO_PROVIDER[key];
  if (providerKind) {
    return { kind: "provider", handle: key, raw, providerKind };
  }
  if (key.startsWith("rt-") || key.startsWith("runtime-")) {
    return { kind: "runtime", handle: key.replace(/^(rt|runtime)-/, ""), raw };
  }
  return { kind: "user", handle: key, raw };
}

export type ChatKind = "dm" | "project";

/**
 * Phase 1 reaction rule (Multica-like, no Focus):
 * - Personal DMs: agents always respond
 * - Every other chat: only when @mentioned (agent / provider / runtime)
 */
export function shouldDispatchAgent(input: {
  chatKind: ChatKind;
  mentions: readonly ParsedMention[];
}): boolean {
  if (input.chatKind === "dm") return true;
  return input.mentions.some(
    (mention) =>
      mention.kind === "agent" ||
      mention.kind === "provider" ||
      mention.kind === "runtime",
  );
}

export function preferredProvider(
  mentions: readonly ParsedMention[],
  fallback: ProviderDriverKind,
): ProviderDriverKind {
  const mentioned = mentions.find((mention) => mention.providerKind);
  return mentioned?.providerKind ?? fallback;
}
