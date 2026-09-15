import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  COMPOSER_INPUT,
  COMPOSER_PICKER_MENU,
  COMPOSER_PLUS_TRIGGER,
  COMPOSER_SUGGEST_MENU,
  composerEventTarget,
  composerMenuKeepOpenSelectors,
  composerPickerTriggerSelector,
  isComposerSuggestMenuOpen,
  parseComposerSuggestToken,
  shouldDismissComposerMenu,
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

describe(composerMenuKeepOpenSelectors, () => {
  it("pins a picker to its panel and matching trigger", () => {
    expect(
      composerMenuKeepOpenSelectors({
        openPicker: "provider",
        plusOpen: false,
        suggestOpen: false,
      })
    ).toStrictEqual([
      COMPOSER_PICKER_MENU,
      composerPickerTriggerSelector("provider"),
    ]);
  });

  it("pins the + menu to the suggest list and plus button", () => {
    expect(
      composerMenuKeepOpenSelectors({
        openPicker: null,
        plusOpen: true,
        suggestOpen: true,
      })
    ).toStrictEqual([COMPOSER_SUGGEST_MENU, COMPOSER_PLUS_TRIGGER]);
  });

  it("pins a typed @ menu to the suggest list and the textarea", () => {
    expect(
      composerMenuKeepOpenSelectors({
        openPicker: null,
        plusOpen: false,
        suggestOpen: true,
      })
    ).toStrictEqual([COMPOSER_SUGGEST_MENU, COMPOSER_INPUT]);
  });
});

describe(shouldDismissComposerMenu, () => {
  const pickerKeep = composerMenuKeepOpenSelectors({
    openPicker: "provider",
    plusOpen: false,
    suggestOpen: false,
  });

  it("keeps the picker open on the menu or its trigger", () => {
    expect(
      shouldDismissComposerMenu(
        {
          closest: (selector) =>
            selector === COMPOSER_PICKER_MENU ? {} : null,
        },
        pickerKeep
      )
    ).toBeFalsy();
    expect(
      shouldDismissComposerMenu(
        {
          closest: (selector) =>
            selector === composerPickerTriggerSelector("provider") ? {} : null,
        },
        pickerKeep
      )
    ).toBeFalsy();
  });

  it("dismisses a picker when the hit is outside the menu", () => {
    expect(
      shouldDismissComposerMenu({ closest: () => null }, pickerKeep)
    ).toBeTruthy();
    expect(shouldDismissComposerMenu(null, pickerKeep)).toBeTruthy();
  });

  it("does not dismiss when no toolbar menu is open", () => {
    expect(shouldDismissComposerMenu({ closest: () => null }, [])).toBeFalsy();
  });

  it("walks up from a text node without closest", () => {
    const parent = {
      closest: (selector: string) =>
        selector === COMPOSER_PICKER_MENU ? {} : null,
    };
    expect(composerEventTarget({ parentElement: parent })).toBe(parent);
    expect(
      shouldDismissComposerMenu({ parentElement: parent }, pickerKeep)
    ).toBeFalsy();
  });
});

describe("dismiss wiring", () => {
  it("closes PromptBar menus on outside pointerdown, not the whole composer", () => {
    const promptBar = readFileSync(
      "src/components/primitives/PromptBar.tsx",
      "utf-8"
    );
    expect(promptBar).toContain("shouldDismissComposerMenu");
    expect(promptBar).toContain('data-prompt-menu="picker"');
    expect(promptBar).toContain('data-prompt-menu="suggest"');
    expect(promptBar).toContain("data-prompt-trigger={`picker-");
    expect(promptBar).not.toContain('closest("[data-promptbar]")');
  });

  it("listens for Escape on the document while a toolbar menu is open", () => {
    const promptBar = readFileSync(
      "src/components/primitives/PromptBar.tsx",
      "utf-8"
    );
    expect(promptBar).toContain('addEventListener("keydown"');
    expect(promptBar).toContain('event.key === "Escape"');
  });

  it("keeps AgentPicker on Radix dismiss defaults", () => {
    const picker = readFileSync("src/harness/ui/AgentPicker.tsx", "utf-8");
    expect(picker).toContain("Popover.Root");
    expect(picker).toContain("onOpenChange={setOpen}");
    expect(picker).not.toContain("onInteractOutside");
    expect(picker).not.toContain("onPointerDownOutside");
  });
});
