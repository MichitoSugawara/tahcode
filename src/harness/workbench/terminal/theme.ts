import type { GhosttyColor, GhosttyTheme } from "./ghostty/core";

function parseCssColor(value: string): GhosttyColor | null {
  const hex = value.trim();
  const long = /^#([\da-f]{6})$/i.exec(hex);
  if (long?.[1]) {
    return {
      b: Number.parseInt(long[1].slice(4, 6), 16),
      g: Number.parseInt(long[1].slice(2, 4), 16),
      r: Number.parseInt(long[1].slice(0, 2), 16),
    };
  }
  const rgb = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i.exec(hex);
  if (rgb?.[1] && rgb[2] && rgb[3]) {
    return {
      b: Number(rgb[3]),
      g: Number(rgb[2]),
      r: Number(rgb[1]),
    };
  }
  return null;
}

export function workbenchGhosttyTheme(root: HTMLElement): GhosttyTheme {
  const styles = getComputedStyle(root);
  return {
    background: parseCssColor(styles.getPropertyValue("--page")) ?? {
      b: 18,
      g: 23,
      r: 18,
    },
    cursor: parseCssColor(styles.getPropertyValue("--caret")) ??
      parseCssColor(styles.getPropertyValue("--accent-ink")) ?? {
        b: 0,
        g: 255,
        r: 0,
      },
    foreground: parseCssColor(styles.getPropertyValue("--ink")) ?? {
      b: 201,
      g: 201,
      r: 201,
    },
    selectionBackground: "rgba(14, 156, 45, 0.35)",
  };
}
