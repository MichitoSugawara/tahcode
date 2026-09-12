/* Convex Auth `callbacks.redirect` for the desktop shell's system-browser
 * OAuth. The rule itself lives in @dalecode/core/desktop so the web app, the
 * backend and apps/desktop agree on the exact deep link. */
export { DESKTOP_OAUTH_CALLBACK, isDesktopOAuthCallback, resolveRedirectTo } from "@dalecode/core/desktop";
