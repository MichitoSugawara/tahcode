/* ─────────────────────────────────────────────────────────
 * Where Convex Auth may send the browser after an OAuth round trip.
 *
 * Convex Auth's default only accepts relative paths and SITE_URL. The macOS
 * desktop shell (apps/desktop) runs Google in the *system browser*, so the
 * code has to travel back through the app's deep link. Exactly that address
 * (scheme + host + path) is allowed on top of the default rule; `next` and
 * the `code` Convex appends live in the query string.
 * ───────────────────────────────────────────────────────── */

export const DESKTOP_OAUTH_CALLBACK = "dalecode://auth/callback";

function parseUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

export function isDesktopOAuthCallback(redirectTo: string): boolean {
  const candidate = parseUrl(redirectTo);
  if (!candidate) return false;
  const desktop = new URL(DESKTOP_OAUTH_CALLBACK);
  return (
    candidate.protocol === desktop.protocol &&
    candidate.host === desktop.host &&
    candidate.pathname === desktop.pathname &&
    candidate.username === "" &&
    candidate.password === "" &&
    candidate.hash === ""
  );
}

/** Mirrors Convex Auth's built-in rule so behaviour is unchanged for the web. */
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
