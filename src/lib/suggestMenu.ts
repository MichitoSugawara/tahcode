import { fuzzyFieldScore } from "@/lib/fuzzy";

export const SUGGEST_MENU_PREFERRED_MAX = 288;
export const SUGGEST_MENU_GAP = 8;
export const SUGGEST_MENU_INSET = 8;

export type SuggestMenuSide = "above" | "below";

export interface VerticalBox {
  top: number;
  bottom: number;
}

export interface SuggestMenuPlacement {
  maxHeight: number;
  side: SuggestMenuSide;
}

/**
 * Keep the @ / menu inside `bounds` (viewport ∩ overflow clip).
 * Prefer above when it fits the preferred height; otherwise pick the
 * side with more room and clamp maxHeight so the first row is never cut.
 */
export function placeSuggestMenu(input: {
  anchor: VerticalBox;
  bounds: VerticalBox;
  preferredMax?: number;
  gap?: number;
  inset?: number;
}): SuggestMenuPlacement {
  const preferred = input.preferredMax ?? SUGGEST_MENU_PREFERRED_MAX;
  const gap = input.gap ?? SUGGEST_MENU_GAP;
  const inset = input.inset ?? SUGGEST_MENU_INSET;
  const spaceAbove = input.anchor.top - input.bounds.top - gap - inset;
  const spaceBelow = input.bounds.bottom - input.anchor.bottom - gap - inset;
  const side: SuggestMenuSide =
    spaceAbove >= preferred || spaceAbove >= spaceBelow ? "above" : "below";
  const available = side === "above" ? spaceAbove : spaceBelow;
  return {
    maxHeight: Math.max(0, Math.min(preferred, Math.floor(available))),
    side,
  };
}

const OVERFLOW_CLIPS = /auto|scroll|hidden|clip/;

function axisClips(overflow: string, overflowAxis: string): boolean {
  if (OVERFLOW_CLIPS.test(overflowAxis)) {
    return true;
  }
  /* CSS: overflow-x: hidden + overflow-y: visible computes y as auto */
  return overflowAxis === "visible" && OVERFLOW_CLIPS.test(overflow);
}

export function visualViewportBox(): VerticalBox {
  const viewport = window.visualViewport;
  if (viewport) {
    return {
      bottom: viewport.offsetTop + viewport.height,
      top: viewport.offsetTop,
    };
  }
  return { bottom: window.innerHeight, top: 0 };
}

/** Viewport intersected with every overflow-clip ancestor of `element`. */
export function overflowClipBox(element: HTMLElement): VerticalBox {
  const viewport = visualViewportBox();
  let top = viewport.top;
  let bottom = viewport.bottom;
  let current: HTMLElement | null = element.parentElement;
  while (current) {
    const style = getComputedStyle(current);
    if (axisClips(style.overflow, style.overflowY)) {
      const rect = current.getBoundingClientRect();
      top = Math.max(top, rect.top);
      bottom = Math.min(bottom, rect.bottom);
    }
    current = current.parentElement;
  }
  return { bottom, top };
}

export interface SuggestMenuItem {
  desc?: string;
  insert?: string;
  name: string;
  /** Extra haystack (aliases, slugs) that should rank with the visible label. */
  search?: string;
}

function queryNeedles(query: string): string[] {
  const needle = query.trim().toLowerCase();
  if (!needle) {
    return [];
  }
  const parts = needle.split("/").filter((part) => part.length > 0);
  const tail = parts.at(-1) ?? "";
  if (tail.length > 0 && tail !== needle) {
    return [needle, tail];
  }
  return [needle];
}

function itemScore(item: SuggestMenuItem, needle: string): number {
  return Math.max(
    fuzzyFieldScore(item.name, needle),
    fuzzyFieldScore(item.desc ?? "", needle),
    fuzzyFieldScore(item.insert ?? "", needle),
    fuzzyFieldScore(item.search ?? "", needle)
  );
}

/** Ranked fuzzy filter. Empty query keeps the original order. */
export function filterSuggestItems<T extends SuggestMenuItem>(
  items: readonly T[],
  query: string
): T[] {
  const needles = queryNeedles(query);
  if (needles.length === 0) {
    return [...items];
  }
  return items
    .map((item, index) => ({
      index,
      item,
      score: Math.max(...needles.map((needle) => itemScore(item, needle))),
    }))
    .filter((row) => row.score > 0)
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .map((row) => row.item);
}
