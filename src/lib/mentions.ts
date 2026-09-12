import { parseMentions, type ParsedMention } from "@shared/mentions.ts";
import { MENTION_TO_PROVIDER, type ProviderDriverKind } from "@shared/providers.ts";

export { parseMentions };
export type { ParsedMention };

/** Does the text already address an agent (`@agent`, `@cursor`, `@cursor/muse-spark-1.3`, `@rt-office`)? */
export function hasAgentMention(text: string): boolean {
  return parseMentions(text).some(
    (mention) => mention.kind === "agent" || mention.kind === "provider" || mention.kind === "runtime",
  );
}

export type AgentToken = {
  /** provider handle as typed, lowercased (`cursor`) */
  handle: string;
  providerKind: ProviderDriverKind;
  /** text typed after the slash, if the user is already inside the model part */
  modelQuery: string | null;
};

/**
 * The `@…` token being typed at the end of the draft, when it names a
 * provider. `@cursor/mu` → `{ handle: "cursor", providerKind: "cursor",
 * modelQuery: "mu" }`; `@cur` → `modelQuery: null`; `@mai` → `null`.
 */
export function activeAgentToken(draft: string): AgentToken | null {
  const match = /(^|\s)@([a-zA-Z0-9_.-]+)(?:\/([a-zA-Z0-9_./-]*))?$/.exec(draft);
  if (!match) return null;
  const handle = (match[2] ?? "").toLowerCase();
  // `@agent` means "this chat's default agent", never a provider handle here.
  if (handle === "agent" || handle === "harness") return null;
  const providerKind = MENTION_TO_PROVIDER[handle];
  if (!providerKind) return null;
  return { handle, providerKind, modelQuery: match[3] === undefined ? null : match[3] };
}
