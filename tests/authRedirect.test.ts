import { describe, expect, it } from "vitest";
import { DESKTOP_OAUTH_CALLBACK, isDesktopOAuthCallback, resolveRedirectTo } from "../convex/lib/authRedirect.ts";

const SITE = "https://team-harness.gawara.workers.dev";

describe("resolveRedirectTo", () => {
  it("keeps Convex Auth's default rule for the web", () => {
    expect(resolveRedirectTo("/login", SITE)).toBe(`${SITE}/login`);
    expect(resolveRedirectTo("/login?next=%2Finvite%2Fabc", SITE)).toBe(`${SITE}/login?next=%2Finvite%2Fabc`);
    expect(resolveRedirectTo("?x=1", SITE)).toBe(`${SITE}?x=1`);
    expect(resolveRedirectTo(`${SITE}/o/acme`, SITE)).toBe(`${SITE}/o/acme`);
    expect(resolveRedirectTo(SITE, `${SITE}/`)).toBe(SITE);
  });

  it("rejects other origins, including look-alike hosts", () => {
    expect(() => resolveRedirectTo("https://evil.example/login", SITE)).toThrow(/Invalid redirectTo/);
    expect(() => resolveRedirectTo(`${SITE}.evil.example/`, SITE)).toThrow(/Invalid redirectTo/);
    expect(() => resolveRedirectTo("javascript:alert(1)", SITE)).toThrow(/Invalid redirectTo/);
  });

  it("allows exactly the desktop deep link, with its query string", () => {
    expect(resolveRedirectTo(DESKTOP_OAUTH_CALLBACK, SITE)).toBe(DESKTOP_OAUTH_CALLBACK);
    const withNext = `${DESKTOP_OAUTH_CALLBACK}?next=%2Finvite%2Fabc`;
    expect(resolveRedirectTo(withNext, SITE)).toBe(withNext);
  });

  it("does not widen the deep-link allowance", () => {
    expect(isDesktopOAuthCallback("dalecode://auth/other")).toBe(false);
    expect(isDesktopOAuthCallback("dalecode://evil/callback")).toBe(false);
    expect(isDesktopOAuthCallback("dalecode://auth/callback#frag")).toBe(false);
    expect(isDesktopOAuthCallback("dalecode2://auth/callback")).toBe(false);
    expect(isDesktopOAuthCallback("dalecode://user@auth/callback")).toBe(false);
    expect(() => resolveRedirectTo("dalecode://auth/other", SITE)).toThrow(/Invalid redirectTo/);
  });
});
