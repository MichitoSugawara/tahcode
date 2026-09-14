import { describe, expect, it } from "vitest";

import { hasProviderBrandIcon } from "../src/components/atoms/ProviderIcon.tsx";
import { PROVIDER_KINDS } from "../src/lib/providers.ts";

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
