import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  isComposerSuggestMenuOpen,
  parseComposerSuggestToken,
  shouldShowHeroSuggestions,
} from "../src/lib/composerMenu.ts";

describe(parseComposerSuggestToken, () => {
  it("detects an @ mention being typed", () => {
    expect(parseComposerSuggestToken("@cu")).toMatchObject({
      kind: "at",
      query: "cu",
    });
    expect(parseComposerSuggestToken("確認して。@cu")).toMatchObject({
      kind: "at",
      query: "cu",
    });
  });

  it("closes after a completed mention token", () => {
    expect(parseComposerSuggestToken("@cursor ")).toBeNull();
    expect(parseComposerSuggestToken("hello")).toBeNull();
    expect(parseComposerSuggestToken("")).toBeNull();
  });
});

describe(isComposerSuggestMenuOpen, () => {
  it("is open for @cu and other token menus", () => {
    expect(isComposerSuggestMenuOpen({ draft: "@cu" })).toBeTruthy();
    expect(isComposerSuggestMenuOpen({ draft: "/new" })).toBeTruthy();
    expect(isComposerSuggestMenuOpen({ draft: "$imagegen" })).toBeTruthy();
    expect(
      isComposerSuggestMenuOpen({ draft: "", plusOpen: true })
    ).toBeTruthy();
  });

  it("is closed when the token is gone or dismissed", () => {
    expect(isComposerSuggestMenuOpen({ draft: "" })).toBeFalsy();
    expect(isComposerSuggestMenuOpen({ draft: "hello" })).toBeFalsy();
    expect(
      isComposerSuggestMenuOpen({ dismissed: true, draft: "@cu" })
    ).toBeFalsy();
  });
});

describe(shouldShowHeroSuggestions, () => {
  it("hides empty-hero prompts while the mention menu is open", () => {
    expect(shouldShowHeroSuggestions(true)).toBeFalsy();
    expect(shouldShowHeroSuggestions(false)).toBeTruthy();
  });
});

describe("hero wiring", () => {
  it("gates EmptyHero prompts on the composer mention menu", () => {
    const hero = readFileSync("src/harness/EmptyHero.tsx", "utf-8");
    const home = readFileSync("src/pages/HomePage.tsx", "utf-8");
    const chat = readFileSync("src/pages/ChatPage.tsx", "utf-8");
    const composer = readFileSync("src/harness/Composer.tsx", "utf-8");
    expect(hero).toContain("shouldShowHeroSuggestions");
    expect(hero).toContain("composerMenuOpen");
    expect(home).toContain("onSuggestMenuOpenChange");
    expect(chat).toContain("onSuggestMenuOpenChange");
    expect(composer).toContain("onSuggestMenuOpenChange");
  });
});
