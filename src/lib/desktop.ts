import { DESKTOP_BRIDGE_KEY, type TahcodeDesktopBridge } from "@tahcode/core/desktop";

/* ─────────────────────────────────────────────────────────
 * Bridge to the desktop shell (apps/desktop, Electron).
 *
 * The shell's preload installs `window.tahcodeDesktop`; in a plain browser
 * it is undefined and every helper here falls back to browser behaviour.
 * The contract (type + URL rules) is @tahcode/core/desktop.
 * ───────────────────────────────────────────────────────── */

declare global {
  interface Window {
    tahcodeDesktop?: TahcodeDesktopBridge;
  }
}

export function getDesktopBridge(): TahcodeDesktopBridge | null {
  if (typeof window === "undefined") return null;
  return window[DESKTOP_BRIDGE_KEY] ?? null;
}

export function isDesktopShell(): boolean {
  return getDesktopBridge() !== null;
}

/**
 * Where Convex Auth should send the user after Google. In the browser this
 * is our own /login (keeps `next` for invite links). In the shell, Google
 * runs in the system browser, so the callback is the app's tahcode:// deep
 * link (allow-listed in convex/auth.ts); the shell turns it back into /login.
 */
export function oauthRedirectTo(safeNext: string): string {
  const fromShell = getDesktopBridge()?.oauthRedirectTo(safeNext) ?? null;
  if (fromShell) return fromShell;
  return safeNext === "/" ? "/login" : `/login?next=${encodeURIComponent(safeNext)}`;
}

/** True when the shell hands Google off to the system browser. */
export function oauthLeavesApp(): boolean {
  return getDesktopBridge()?.oauthStrategy === "system-browser";
}
