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

export const COMPOSER_PICKER_MENU = '[data-prompt-menu="picker"]';
export const COMPOSER_SUGGEST_MENU = '[data-prompt-menu="suggest"]';
export const COMPOSER_PLUS_TRIGGER = '[data-prompt-trigger="plus"]';
export const COMPOSER_INPUT = "[data-prompt-input]";

type ClosestNode = { closest: (selector: string) => unknown };

export function composerPickerTriggerSelector(pickerId: string): string {
  return `[data-prompt-trigger="picker-${pickerId}"]`;
}

/**
 * Roots that must stay hit-testable so a toggle click does not race
 * pointerdown-dismiss (Radix / SidebarNav keep-open pattern).
 */
export function composerMenuKeepOpenSelectors(state: {
  openPicker: string | null;
  plusOpen: boolean;
  suggestOpen: boolean;
}): readonly string[] {
  if (state.openPicker) {
    return [
      COMPOSER_PICKER_MENU,
      composerPickerTriggerSelector(state.openPicker),
    ];
  }
  if (state.plusOpen) {
    return [COMPOSER_SUGGEST_MENU, COMPOSER_PLUS_TRIGGER];
  }
  if (state.suggestOpen) {
    return [COMPOSER_SUGGEST_MENU, COMPOSER_INPUT];
  }
  return [];
}

type ParentBearing = {
  parentElement: unknown;
};

function hasClosest(value: unknown): value is ClosestNode {
  return (
    typeof value === "object" &&
    value !== null &&
    "closest" in value &&
    typeof (value as ClosestNode).closest === "function"
  );
}

function hasParentElement(value: unknown): value is ParentBearing {
  return (
    typeof value === "object" && value !== null && "parentElement" in value
  );
}

/** Element (or text-node parent) that can answer `closest`. */
export function composerEventTarget(target: unknown): ClosestNode | null {
  if (hasClosest(target)) {
    return target;
  }
  if (hasParentElement(target)) {
    return hasClosest(target.parentElement) ? target.parentElement : null;
  }
  return null;
}

/** True when the event missed the open menu and its trigger. */
export function shouldDismissComposerMenu(
  target: unknown,
  keepOpenSelectors: readonly string[]
): boolean {
  if (keepOpenSelectors.length === 0) {
    return false;
  }
  const node = composerEventTarget(target);
  if (!node) {
    return true;
  }
  return !keepOpenSelectors.some((selector) => Boolean(node.closest(selector)));
}
