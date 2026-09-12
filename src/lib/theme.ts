import { useCallback, useEffect, useState } from "react";

export type Theme = "dark" | "light";

const KEY = "bui-theme";

/** Light is the default; only an explicitly saved "dark" opts in. */
export function readStoredTheme(): Theme {
  try {
    return localStorage.getItem(KEY) === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

/** Applies `.dark` on <html>; freezes transitions for one frame so the flip
 *  is a single clean repaint (Beautiful UI's `.theme-switching` rule). */
export function applyTheme(theme: Theme) {
  const root = document.documentElement;
  root.classList.add("theme-switching");
  root.classList.toggle("dark", theme === "dark");
  root.style.colorScheme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "dark" ? "#0b140b" : "#f1f2f3");
  requestAnimationFrame(() => root.classList.remove("theme-switching"));
}

export function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>(readStoredTheme);
  useEffect(() => {
    applyTheme(theme);
    try {
      localStorage.setItem(KEY, theme);
    } catch {
      /* private mode */
    }
  }, [theme]);
  const toggle = useCallback(() => setTheme((current) => (current === "dark" ? "light" : "dark")), []);
  return [theme, toggle];
}
