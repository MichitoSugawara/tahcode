/** Well-known non-production login for PR preview / staging review.
 * Google OAuth is not registered on ephemeral preview hosts, so every
 * preview deploy must create or reset this password account.
 * Never seed these credentials on production (`https://tahcode.com`). */

export const PREVIEW_LOGIN_EMAIL = "test@test.com";
export const PREVIEW_LOGIN_PASSWORD = "test1234";
export const PREVIEW_LOGIN_NAME = "Preview Reviewer";
export const PREVIEW_ORG_NAME = "Preview";
export const PREVIEW_ORG_SLUG = "preview";
export const PREVIEW_SETTINGS_PATH = "/o/preview/settings#connectors";

/** Keep in sync with `PRODUCTION_PUBLIC_SITE_URL` in scripts/wrangler-classify.mjs. */
export const PRODUCTION_SITE_URL = "https://tahcode.com";

export function normalizeSiteUrl(siteUrl: string): string {
  return siteUrl.trim().replace(/\/$/, "");
}

export function previewLoginSeedAllowed(siteUrl: string): boolean {
  const origin = normalizeSiteUrl(siteUrl);
  return origin.length > 0 && origin !== PRODUCTION_SITE_URL;
}
