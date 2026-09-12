import { useCallback, useEffect, useState } from "react";

export type Theme = "dark" | "light";

const KEY = "bui-theme";

function read(): Theme {
  try {
    return localStorage.getItem(KEY) === "light" ? "light" : "dark";
  } catch {
    return "dark";
  }
}

/** Applies `.dark` on <html>; freezes transitions for one frame so the flip
 *  is a single clean repaint (Beautiful UI's `.theme-switching` rule). */
export function applyTheme(theme: Theme) {
  const root = document.documentElement;
  root.classList.add("theme-switching");
  root.classList.toggle("dark", theme === "dark");
  root.style.colorScheme = theme;
  requestAnimationFrame(() => root.classList.remove("theme-switching"));
}

export function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>(read);
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
