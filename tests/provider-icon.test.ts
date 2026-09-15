import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  ProviderMark,
  hasProviderBrandIcon,
} from "../src/components/atoms/ProviderIcon.tsx";
import { PROVIDER_KINDS } from "../src/lib/providers.ts";

const BANNED_UI = /OpenConnector|OOMOL|workers\.dev|gateway/i;

describe(hasProviderBrandIcon, () => {
  it("maps the brand-mark providers and falls back for the rest", () => {
    expect({
      antigravity: hasProviderBrandIcon("antigravity"),
      branded: PROVIDER_KINDS.filter((kind) => hasProviderBrandIcon(kind)),
      claudeAgent: hasProviderBrandIcon("claudeAgent"),
      codex: hasProviderBrandIcon("codex"),
      cursor: hasProviderBrandIcon("cursor"),
      grok: hasProviderBrandIcon("grok"),
      opencode: hasProviderBrandIcon("opencode"),
      unknown: hasProviderBrandIcon("unknown"),
    }).toStrictEqual({
      antigravity: false,
      branded: ["codex", "claudeAgent", "cursor", "grok", "opencode"],
      claudeAgent: true,
      codex: true,
      cursor: true,
      grok: true,
      opencode: true,
      unknown: false,
    });
  });
});

describe(ProviderMark, () => {
  it("renders the brand mark without a fill chip", () => {
    const branded = renderToStaticMarkup(
      createElement(ProviderMark, { kind: "cursor" })
    );
    const fallback = renderToStaticMarkup(
      createElement(ProviderMark, { kind: "antigravity" })
    );
    expect({
      banned: BANNED_UI.test(branded) || BANNED_UI.test(fallback),
      brandedHasSvg: branded.includes("<svg"),
      brandedHasBackground: /background/i.test(branded),
      brandedHasWhiteOnChip: branded.includes("text-white"),
      fallbackLetter: fallback.includes("A"),
      fallbackHasBackground: /background/i.test(fallback),
    }).toStrictEqual({
      banned: false,
      brandedHasSvg: true,
      brandedHasBackground: false,
      brandedHasWhiteOnChip: false,
      fallbackLetter: true,
      fallbackHasBackground: false,
    });
  });
});
