import { describe, expect, it } from "vitest";

import { headlessArgs } from "../runtime/src/providers.ts";
import {
  cursorMentionSuggestItems,
  groupCursorCatalog,
  resolveCursorCliModel,
} from "../shared/cursorModels.ts";
import {
  expandResolvedMentions,
  parseMentions,
  preferredTarget,
} from "../shared/mentions.ts";
import { resolveModelSlug } from "../shared/providers.ts";

describe(resolveCursorCliModel, () => {
  it("maps a bare known family to the default effort", () => {
    expect(resolveCursorCliModel("cursor-grok-4.6")).toBe(
      "cursor-grok-4.6-medium"
    );
  });

  it("keeps an effort-suffixed id and auto", () => {
    expect(resolveCursorCliModel("cursor-grok-4.6-high")).toBe(
      "cursor-grok-4.6-high"
    );
    expect(resolveCursorCliModel("auto")).toBe("auto");
    expect(resolveCursorCliModel("muse-spark-1.3")).toBe("muse-spark-1.3");
  });

  it("prefers medium from a live catalog, else the first matching prefix", () => {
    expect(
      resolveCursorCliModel("cursor-grok-4.6", [
        "cursor-grok-4.6-low",
        "cursor-grok-4.6-medium",
        "cursor-grok-4.6-high",
        "cursor-grok-4.6-medium-fast",
      ])
    ).toBe("cursor-grok-4.6-medium");
    expect(
      resolveCursorCliModel("cursor-grok-4.6", [
        "cursor-grok-4.6-high",
        "cursor-grok-4.6-low",
      ])
    ).toBe("cursor-grok-4.6-high");
    expect(
      resolveCursorCliModel("muse-spark-1.3", [
        "muse-spark-1.3-low",
        "muse-spark-1.3-high",
      ])
    ).toBe("muse-spark-1.3-low");
  });

  it("keeps a live exact match even without an effort suffix", () => {
    expect(
      resolveCursorCliModel("composer-2.5", [
        "auto",
        "composer-2.5",
        "composer-2.5-fast",
      ])
    ).toBe("composer-2.5");
  });
});

describe("mention + catalog resolution", () => {
  it("resolves @cursor/grok and the bare family to a CLI-valid id", () => {
    expect(resolveModelSlug("cursor", "grok")).toBe("cursor-grok-4.6-medium");
    expect(resolveModelSlug("cursor", "cursor-grok-4.6")).toBe(
      "cursor-grok-4.6-medium"
    );
    expect(parseMentions("@cursor/grok")[0]?.model).toBe(
      "cursor-grok-4.6-medium"
    );
    expect(parseMentions("@cursor/cursor-grok-4.6")[0]?.model).toBe(
      "cursor-grok-4.6-medium"
    );
    expect(parseMentions("@cursor/cursor-grok-4.6-high")[0]?.model).toBe(
      "cursor-grok-4.6-high"
    );
  });

  it("leaves a bare @cursor on the CLI default (no model)", () => {
    expect(parseMentions("@cursor こんにちは")[0]).toMatchObject({
      model: undefined,
      providerKind: "cursor",
    });
    expect(
      preferredTarget(parseMentions("@cursor こんにちは"), {
        driverKind: "cursor",
      })
    ).toStrictEqual({ driverKind: "cursor", model: undefined });
  });

  it("rewrites the mention chip to the resolved id on send", () => {
    expect(expandResolvedMentions("@cursor/cursor-grok-4.6 こんにちは")).toBe(
      "@cursor/cursor-grok-4.6-medium こんにちは"
    );
    expect(expandResolvedMentions("@cursor/grok please")).toBe(
      "@cursor/cursor-grok-4.6-medium please"
    );
    expect(expandResolvedMentions("@cursor こんにちは")).toBe(
      "@cursor こんにちは"
    );
    expect(expandResolvedMentions("@cursor/cursor-grok-4.6-high hi")).toBe(
      "@cursor/cursor-grok-4.6-high hi"
    );
    expect(
      expandResolvedMentions("@cursor/cursor-grok-4.6 hi", [
        "cursor-grok-4.6-high",
        "cursor-grok-4.6-xhigh",
      ])
    ).toBe("@cursor/cursor-grok-4.6-high hi");
  });
});

describe(cursorMentionSuggestItems, () => {
  const staticCatalog = [
    {
      aliases: ["grok", "grok-4.6"],
      name: "Grok 4.6 (Cursor)",
      slug: "cursor-grok-4.6",
    },
    { name: "Auto（Cursor が選択）", slug: "auto" },
    { name: "Composer 2.5", slug: "composer-2.5" },
  ];

  it("lists families at @cursor/ and effort variants at the family", () => {
    const families = cursorMentionSuggestItems("cursor", "", staticCatalog);
    expect(families.map((item) => item.slug)).toStrictEqual([
      "cursor-grok-4.6",
      "auto",
      "composer-2.5",
    ]);
    expect(families[0]).toMatchObject({
      insert: "@cursor/cursor-grok-4.6",
      kind: "family",
      name: "@cursor/cursor-grok-4.6",
    });

    const efforts = cursorMentionSuggestItems(
      "cursor",
      "cursor-grok-4.6",
      staticCatalog
    );
    expect(efforts.every((item) => item.kind === "effort")).toBeTruthy();
    expect(efforts.map((item) => item.slug)).toStrictEqual([
      "cursor-grok-4.6-low",
      "cursor-grok-4.6-medium",
      "cursor-grok-4.6-high",
      "cursor-grok-4.6-xhigh",
    ]);
    expect(
      efforts.find((item) => item.slug.endsWith("-medium"))?.trailing
    ).toBe("既定");
  });

  it("suggests effort variants after an alias such as grok", () => {
    const viaAlias = cursorMentionSuggestItems("cursor", "grok", staticCatalog);
    expect(viaAlias.every((item) => item.kind === "effort")).toBeTruthy();
    expect(viaAlias.map((item) => item.slug)).toStrictEqual([
      "cursor-grok-4.6-low",
      "cursor-grok-4.6-medium",
      "cursor-grok-4.6-high",
      "cursor-grok-4.6-xhigh",
    ]);
  });

  it("keeps live effort variants including fast when the catalog has them", () => {
    const live = [
      { name: "Grok 4.6 (Cursor)", slug: "cursor-grok-4.6-low" },
      { name: "Grok 4.6 (Cursor)", slug: "cursor-grok-4.6-medium" },
      { name: "Grok 4.6 (Cursor)", slug: "cursor-grok-4.6-high" },
      { name: "Grok 4.6 (Cursor)", slug: "cursor-grok-4.6-medium-fast" },
      { name: "Auto", slug: "auto" },
    ];
    const grouped = groupCursorCatalog(live);
    expect(
      grouped
        .find((family) => family.id === "cursor-grok-4.6")
        ?.variants.map((item) => item.slug)
    ).toStrictEqual([
      "cursor-grok-4.6-low",
      "cursor-grok-4.6-medium",
      "cursor-grok-4.6-medium-fast",
      "cursor-grok-4.6-high",
    ]);
    const efforts = cursorMentionSuggestItems(
      "cursor",
      "cursor-grok-4.6-m",
      live
    );
    expect(efforts.map((item) => item.slug)).toContain(
      "cursor-grok-4.6-medium-fast"
    );
  });
});

describe("headless agent --model", () => {
  it("never passes a bare cursor-grok-4.6 id to agent", () => {
    expect(
      headlessArgs("cursor", "こんにちは", "cursor-grok-4.6")
    ).toStrictEqual([
      "-p",
      "--trust",
      "--model",
      "cursor-grok-4.6-medium",
      "--output-format",
      "stream-json",
      "こんにちは",
    ]);
    expect(
      headlessArgs("cursor", "hi", "cursor-grok-4.6", undefined, undefined, [
        "cursor-grok-4.6-high",
        "cursor-grok-4.6-xhigh",
      ])
    ).toContain("cursor-grok-4.6-high");
    expect(headlessArgs("cursor", "hi", "cursor-grok-4.6-high")).toContain(
      "cursor-grok-4.6-high"
    );
  });

  it("omits --model for a bare @cursor (CLI default)", () => {
    expect(headlessArgs("cursor", "こんにちは")).toStrictEqual([
      "-p",
      "--trust",
      "--output-format",
      "stream-json",
      "こんにちは",
    ]);
  });
});
