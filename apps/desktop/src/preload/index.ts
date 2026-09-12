import { contextBridge } from "electron";

/* ─────────────────────────────────────────────────────────
 * window.dalecodeDesktop — the only surface the web app sees.
 *
 * Runs sandboxed with contextIsolation; nothing here touches Node APIs.
 * The web app (src/lib/desktop.ts) treats the whole object as optional so
 * the same bundle keeps working in a plain browser.
 * ───────────────────────────────────────────────────────── */

type OAuthStrategy = "system-browser" | "in-app";

function argValue(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

const oauthStrategy: OAuthStrategy = argValue("dalecode-oauth") === "in-app" ? "in-app" : "system-browser";

/* Mirrors oauthRedirectTo() in src/main/deepLink.ts; keep the two in sync. */
function oauthRedirectTo(next: string): string | null {
  if (oauthStrategy !== "system-browser") return null;
  const url = new URL("dalecode://auth/callback");
  if (next && next !== "/" && next.startsWith("/")) url.searchParams.set("next", next);
  return url.toString();
}

const bridge = {
  /** Shell version (apps/desktop/package.json). */
  version: process.env.DALECODE_DESKTOP_VERSION ?? "0.0.0",
  platform: process.platform,
  oauthStrategy,
  /**
   * `redirectTo` for Convex Auth's `signIn("google", …)` when running in the
   * shell, or null to keep the browser behaviour (in-app strategy).
   */
  oauthRedirectTo,
} as const;

export type DalecodeDesktopBridge = typeof bridge;

contextBridge.exposeInMainWorld("dalecodeDesktop", bridge);
