import { MENTION_BOUNDARY, MENTION_HANDLE } from "@/lib/mentions";

export type ComposerSuggestKind = "at" | "slash" | "dollar";

export interface ComposerSuggestToken {
  kind: ComposerSuggestKind;
  query: string;
  start: number;
}

/* an @ opens after the same boundary the highlighter uses (so it also
 * works mid-sentence in Japanese); a / command only at a word start */
const AT_TOKEN = new RegExp(`${MENTION_BOUNDARY}(@)(${MENTION_HANDLE}*)$`);
const SLASH_TOKEN = /(^|\s)(\/)([\w./-]*)$/;
const DOLLAR_TOKEN = /(^|\s)(\$)([\w-]*)$/;

/** The last @word, $skill, or /word being typed, if any. */
export function parseComposerSuggestToken(
  draft: string
): ComposerSuggestToken | null {
  const match =
    AT_TOKEN.exec(draft) ?? DOLLAR_TOKEN.exec(draft) ?? SLASH_TOKEN.exec(draft);
  if (!match) {
    return null;
  }
  const marker = match[2] ?? "";
  return {
    kind: marker === "@" ? "at" : marker === "$" ? "dollar" : "slash",
    query: (match[3] ?? "").toLowerCase(),
    start: match.index + (match[1]?.length ?? 0),
  };
}

export function composerSuggestMenuKind(input: {
  dismissed?: boolean;
  draft: string;
  plusOpen?: boolean;
}): ComposerSuggestKind | null {
  if (input.plusOpen) {
    return "at";
  }
  if (input.dismissed) {
    return null;
  }
  return parseComposerSuggestToken(input.draft)?.kind ?? null;
}

export function isComposerSuggestMenuOpen(input: {
  dismissed?: boolean;
  draft: string;
  plusOpen?: boolean;
}): boolean {
  return composerSuggestMenuKind(input) !== null;
}

/** Hero starter prompts stay off-screen while @ / $ menus are open. */
export function shouldShowHeroSuggestions(composerMenuOpen: boolean): boolean {
  return !composerMenuOpen;
}
