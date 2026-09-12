/* ─────────────────────────────────────────────────────────
 * Bridge to the macOS desktop shell (apps/desktop, Electron).
 *
 * The shell's preload exposes `window.dalecodeDesktop`; in a plain browser
 * it is undefined and every helper here falls back to browser behaviour.
 * Keep this type in sync with apps/desktop/src/preload/index.ts.
 * ───────────────────────────────────────────────────────── */

export interface DalecodeDesktopBridge {
  version: string;
  platform: string;
  oauthStrategy: "system-browser" | "in-app";
  /** `redirectTo` for Google sign-in, or null to use the web default. */
  oauthRedirectTo: (next: string) => string | null;
}

declare global {
  interface Window {
    dalecodeDesktop?: DalecodeDesktopBridge;
  }
}

export function getDesktopBridge(): DalecodeDesktopBridge | null {
  if (typeof window === "undefined") return null;
  return window.dalecodeDesktop ?? null;
}

export function isDesktopShell(): boolean {
  return getDesktopBridge() !== null;
}

/**
 * Where Convex Auth should send the user after Google. In the browser this
 * is our own /login (keeps `next` for invite links). In the shell, Google
 * runs in the system browser, so the callback is the app's dalecode:// deep
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
