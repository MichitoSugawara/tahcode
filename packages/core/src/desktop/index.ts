/* ─────────────────────────────────────────────────────────
 * @tahcode/core/desktop — the contract between the web app, the Convex
 * backend and the Electron shell (apps/desktop). Pure functions only; no
 * DOM, Node or Electron imports, so every consumer can bundle it.
 *
 *   web     src/lib/desktop.ts            reads window.tahcodeDesktop, picks redirectTo
 *   convex  convex/lib/authRedirect.ts    allow-lists the deep link in callbacks.redirect
 *   desktop apps/desktop/src/main + preload  parses the deep link, exposes the bridge
 * ───────────────────────────────────────────────────────── */

export const DEEP_LINK_SCHEME = "tahcode";

/** Where Convex Auth sends the browser after Google when the shell started the flow. */
export const DESKTOP_OAUTH_CALLBACK = `${DEEP_LINK_SCHEME}://auth/callback`;

/** Global the preload script installs on `window`. */
export const DESKTOP_BRIDGE_KEY = "tahcodeDesktop";

export type OAuthStrategy = "system-browser" | "in-app";

/** The only surface the web app sees inside the shell (read-only, contextBridge). */
export interface TahcodeDesktopBridge {
  /** apps/desktop/package.json version */
  version: string;
  platform: string;
  oauthStrategy: OAuthStrategy;
  /** `redirectTo` for `signIn("google", …)`, or null to keep the browser default. */
  oauthRedirectTo: (next: string) => string | null;
}

export interface AuthCallback {
  code: string;
  /** In-app path to continue to after sign-in (invite links); "/" when absent. */
  next: string;
}

function parseUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function safeNext(next: string | null | undefined): string {
  return next && next.startsWith("/") ? next : "/";
}

/** Build the deep link the web app passes as `redirectTo` from inside the shell. */
export function desktopOAuthRedirectTo(next: string): string {
  const url = new URL(DESKTOP_OAUTH_CALLBACK);
  const path = safeNext(next);
  if (path !== "/") url.searchParams.set("next", path);
  return url.toString();
}

/** Strict match on scheme + host + path; query is where `next` and `code` live. */
export function isDesktopOAuthCallback(value: string): boolean {
  const candidate = parseUrl(value);
  if (!candidate) return false;
  const expected = new URL(DESKTOP_OAUTH_CALLBACK);
  return (
    candidate.protocol === expected.protocol &&
    candidate.host === expected.host &&
    candidate.pathname === expected.pathname &&
    candidate.username === "" &&
    candidate.password === "" &&
    candidate.hash === ""
  );
}

/** `tahcode://auth/callback?code=…&next=…` → { code, next } or null for anything else. */
export function parseAuthCallback(raw: string): AuthCallback | null {
  if (!isDesktopOAuthCallback(raw)) return null;
  const url = new URL(raw);
  const code = url.searchParams.get("code");
  if (!code) return null;
  return { code, next: safeNext(url.searchParams.get("next")) };
}

/** The web app's own return URL, so ConvexAuthProvider exchanges the code as in a browser. */
export function loginReturnUrl(appUrl: string, callback: AuthCallback): string {
  const url = new URL("/login", appUrl);
  if (callback.next !== "/") url.searchParams.set("next", callback.next);
  url.searchParams.set("code", callback.code);
  return url.toString();
}

/** First `tahcode://…` argument in a process argv (Linux/Windows second-instance hand-off). */
export function findDeepLink(argv: readonly string[]): string | null {
  return argv.find((arg) => arg.startsWith(`${DEEP_LINK_SCHEME}://`)) ?? null;
}

/**
 * Convex Auth `callbacks.redirect`: the desktop deep link is accepted verbatim;
 * everything else follows Convex Auth's built-in rule (relative paths or SITE_URL)
 * so browser behaviour is unchanged.
 */
export function resolveRedirectTo(redirectTo: string, siteUrl: string): string {
  if (isDesktopOAuthCallback(redirectTo)) return redirectTo;

  const base = siteUrl.replace(/\/$/, "");
  if (redirectTo.startsWith("?") || redirectTo.startsWith("/")) return `${base}${redirectTo}`;
  if (redirectTo.startsWith(base)) {
    const after = redirectTo[base.length];
    if (after === undefined || after === "?" || after === "/") return redirectTo;
  }
  throw new Error(`Invalid redirectTo ${redirectTo} for configured SITE_URL: ${base}`);
}
