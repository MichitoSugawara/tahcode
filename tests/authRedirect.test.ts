import {
  DESKTOP_OAUTH_CALLBACK,
  desktopOAuthRedirectTo,
  isDesktopOAuthCallback,
  loginReturnUrl,
  parseAuthCallback,
  resolveRedirectTo,
} from "@tahcode/core/desktop";
import { describe, expect, it } from "vitest";

const SITE = "https://tahcode.gawara.workers.dev";

describe("desktop deep link round trip", () => {
  it("builds the redirectTo the shell hands to Convex Auth", () => {
    expect(desktopOAuthRedirectTo("/")).toBe(DESKTOP_OAUTH_CALLBACK);
    expect(desktopOAuthRedirectTo("/invite/abc")).toBe(
      `${DESKTOP_OAUTH_CALLBACK}?next=%2Finvite%2Fabc`
    );
    expect(desktopOAuthRedirectTo("https://evil.example")).toBe(
      DESKTOP_OAUTH_CALLBACK
    );
  });

  it("parses what Convex Auth redirects to and maps it onto /login", () => {
    const callback = parseAuthCallback(
      `${DESKTOP_OAUTH_CALLBACK}?next=%2Finvite%2Fabc&code=one-time`
    );
    expect(callback).toStrictEqual({ code: "one-time", next: "/invite/abc" });
    expect(loginReturnUrl(SITE, callback!)).toBe(
      `${SITE}/login?next=%2Finvite%2Fabc&code=one-time`
    );
    expect(loginReturnUrl(SITE, { code: "c", next: "/" })).toBe(
      `${SITE}/login?code=c`
    );
  });

  it("ignores links without a code, foreign paths and off-site next targets", () => {
    expect(parseAuthCallback(DESKTOP_OAUTH_CALLBACK)).toBeNull();
    expect(parseAuthCallback("tahcode://auth/other?code=x")).toBeNull();
    expect(
      parseAuthCallback("https://tahcode.gawara.workers.dev/login?code=x")
    ).toBeNull();
    expect(
      parseAuthCallback(
        `${DESKTOP_OAUTH_CALLBACK}?code=x&next=https%3A%2F%2Fevil.example`
      )?.next
    ).toBe("/");
  });
});

describe(resolveRedirectTo, () => {
  it("keeps Convex Auth's default rule for the web", () => {
    expect(resolveRedirectTo("/login", SITE)).toBe(`${SITE}/login`);
    expect(resolveRedirectTo("/login?next=%2Finvite%2Fabc", SITE)).toBe(
      `${SITE}/login?next=%2Finvite%2Fabc`
    );
    expect(resolveRedirectTo("?x=1", SITE)).toBe(`${SITE}?x=1`);
    expect(resolveRedirectTo(`${SITE}/o/acme`, SITE)).toBe(`${SITE}/o/acme`);
    expect(resolveRedirectTo(SITE, `${SITE}/`)).toBe(SITE);
  });

  it("rejects other origins, including look-alike hosts", () => {
    expect(() => resolveRedirectTo("https://evil.example/login", SITE)).toThrow(
      /Invalid redirectTo/
    );
    expect(() => resolveRedirectTo(`${SITE}.evil.example/`, SITE)).toThrow(
      /Invalid redirectTo/
    );
    expect(() => resolveRedirectTo("data:text/html,phishing", SITE)).toThrow(
      /Invalid redirectTo/
    );
  });

  it("allows exactly the desktop deep link, with its query string", () => {
    expect(resolveRedirectTo(DESKTOP_OAUTH_CALLBACK, SITE)).toBe(
      DESKTOP_OAUTH_CALLBACK
    );
    const withNext = `${DESKTOP_OAUTH_CALLBACK}?next=%2Finvite%2Fabc`;
    expect(resolveRedirectTo(withNext, SITE)).toBe(withNext);
  });

  it("does not widen the deep-link allowance", () => {
    expect(isDesktopOAuthCallback("tahcode://auth/other")).toBeFalsy();
    expect(isDesktopOAuthCallback("tahcode://evil/callback")).toBeFalsy();
    expect(isDesktopOAuthCallback("tahcode://auth/callback#frag")).toBeFalsy();
    expect(isDesktopOAuthCallback("tahcode2://auth/callback")).toBeFalsy();
    expect(isDesktopOAuthCallback("tahcode://user@auth/callback")).toBeFalsy();
  });

  it("rejects a deep link that is not the OAuth callback path", () => {
    expect(() => resolveRedirectTo("tahcode://auth/other", SITE)).toThrow(
      /Invalid redirectTo/
    );
  });
});
