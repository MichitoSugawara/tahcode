import { DEEP_LINK_SCHEME } from "./config";

/* ─────────────────────────────────────────────────────────
 * dalecode://auth/callback?code=…&next=…
 *
 * Convex Auth finishes the Google round trip in the *system browser* and
 * redirects to this URL (allow-listed in convex/auth.ts). macOS hands it to
 * the app via `open-url`, Linux/Windows via `second-instance` argv. We turn it
 * back into the web app's own return URL — `/login?code=…&next=…` — so
 * ConvexAuthProvider exchanges the code exactly as it does in a browser.
 * ───────────────────────────────────────────────────────── */

export interface AuthCallback {
  code: string;
  next: string;
}

export function parseAuthCallback(raw: string): AuthCallback | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== `${DEEP_LINK_SCHEME}:` || url.host !== "auth" || url.pathname !== "/callback") {
    return null;
  }
  const code = url.searchParams.get("code");
  if (!code) return null;
  const next = url.searchParams.get("next") ?? "/";
  return { code, next: next.startsWith("/") ? next : "/" };
}

export function findDeepLink(argv: readonly string[]): string | null {
  return argv.find((arg) => arg.startsWith(`${DEEP_LINK_SCHEME}://`)) ?? null;
}

export function loginReturnUrl(appUrl: string, callback: AuthCallback): string {
  const url = new URL("/login", appUrl);
  if (callback.next !== "/") url.searchParams.set("next", callback.next);
  url.searchParams.set("code", callback.code);
  return url.toString();
}

/** What the web app passes as `redirectTo` when it runs inside the shell. */
export function oauthRedirectTo(next: string): string {
  const url = new URL(`${DEEP_LINK_SCHEME}://auth/callback`);
  if (next && next !== "/" && next.startsWith("/")) url.searchParams.set("next", next);
  return url.toString();
}
