/* tahcode://auth/callback?code=…&next=…
 *
 * Convex Auth finishes the Google round trip in the *system browser* and
 * redirects to this URL (allow-listed in convex/auth.ts). macOS hands it to
 * the app via `open-url`, Linux/Windows via `second-instance` argv. The
 * parsing and the mapping back onto the web app's own `/login?code=…` live in
 * @tahcode/core/desktop so web, backend and shell share one definition. */
export { findDeepLink, loginReturnUrl, parseAuthCallback, type AuthCallback } from "@tahcode/core/desktop";
