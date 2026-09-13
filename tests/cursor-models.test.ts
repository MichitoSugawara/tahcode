import { describe, expect, it } from "vitest";

import { headlessArgs } from "../runtime/src/providers.ts";
import {
  collapseCursorCatalog,
  cursorMentionSuggestItems,
  groupCursorCatalog,
  resolveCursorCliModel,
} from "../shared/cursorModels.ts";
import {
  expandResolvedMentions,
  parseMentions,
  preferredTarget,
} from "../shared/mentions.ts";
import {
  optionDescriptorsFor,
  primaryOptionDescriptor,
} from "../shared/modelOptions.ts";
import { mergeModelCatalog } from "../shared/providerMaintenance.ts";
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

  it("lets the SELECT effort win over a suffix on the slug", () => {
    expect(
      resolveCursorCliModel("cursor-grok-4.6-medium", undefined, "high")
    ).toBe("cursor-grok-4.6-high");
    expect(resolveCursorCliModel("cursor-grok-4.6", undefined, "low")).toBe(
      "cursor-grok-4.6-low"
    );
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
      resolveCursorCliModel(
        "cursor-grok-4.6",
        [
          "cursor-grok-4.6-low",
          "cursor-grok-4.6-medium",
          "cursor-grok-4.6-high",
        ],
        "high"
      )
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
  it("resolves @cursor/grok and the bare family to the family id", () => {
    expect(resolveModelSlug("cursor", "grok")).toBe("cursor-grok-4.6");
    expect(resolveModelSlug("cursor", "cursor-grok-4.6")).toBe(
      "cursor-grok-4.6"
    );
    expect(parseMentions("@cursor/grok")[0]?.model).toBe("cursor-grok-4.6");
    expect(parseMentions("@cursor/cursor-grok-4.6")[0]?.model).toBe(
      "cursor-grok-4.6"
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

  it("lifts a mention effort suffix onto the SELECT option", () => {
    expect(
      preferredTarget(parseMentions("@cursor/cursor-grok-4.6-high やって"), {
        driverKind: "cursor",
        model: "cursor-grok-4.6",
        options: [{ id: "reasoning", value: "medium" }],
      })
    ).toStrictEqual({
      driverKind: "cursor",
      model: "cursor-grok-4.6",
      options: [{ id: "reasoning", value: "high" }],
    });
  });

  it("rewrites aliases to the family and leaves effort off the chip", () => {
    expect(expandResolvedMentions("@cursor/cursor-grok-4.6 こんにちは")).toBe(
      "@cursor/cursor-grok-4.6 こんにちは"
    );
    expect(expandResolvedMentions("@cursor/grok please")).toBe(
      "@cursor/cursor-grok-4.6 please"
    );
    expect(expandResolvedMentions("@cursor こんにちは")).toBe(
      "@cursor こんにちは"
    );
    expect(expandResolvedMentions("@cursor/cursor-grok-4.6-high hi")).toBe(
      "@cursor/cursor-grok-4.6-high hi"
    );
  });
});

describe(collapseCursorCatalog, () => {
  it("collapses live effort-suffixed ids into one family row", () => {
    const collapsed = collapseCursorCatalog([
      { name: "Grok 4.6 (Cursor)", slug: "cursor-grok-4.6-low" },
      { name: "Grok 4.6 (Cursor)", slug: "cursor-grok-4.6-medium" },
      { name: "Grok 4.6 (Cursor)", slug: "cursor-grok-4.6-high" },
      { name: "Grok 4.6 (Cursor)", slug: "cursor-grok-4.6-medium-fast" },
      { name: "Auto", slug: "auto" },
    ]);
    expect(collapsed.map((row) => row.slug)).toStrictEqual([
      "cursor-grok-4.6",
      "auto",
    ]);
    expect(collapsed[0]).toMatchObject({
      defaultReasoningLevel: "medium",
      name: "Grok 4.6 (Cursor)",
      slug: "cursor-grok-4.6",
      supportedReasoningLevels: ["low", "medium", "medium-fast", "high"],
    });
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

  it("lists families at @cursor/ and at an exact family", () => {
    const families = cursorMentionSuggestItems("cursor", "", staticCatalog);
    expect(families.map((item) => item.slug)).toStrictEqual([
      "cursor-grok-4.6",
      "auto",
      "composer-2.5",
    ]);
    expect(families[0]).toMatchObject({
      insert: "@cursor/cursor-grok-4.6 ",
      kind: "family",
      name: "@cursor/cursor-grok-4.6",
    });

    const atFamily = cursorMentionSuggestItems(
      "cursor",
      "cursor-grok-4.6",
      staticCatalog
    );
    expect(atFamily.every((item) => item.kind === "family")).toBeTruthy();
    expect(atFamily.map((item) => item.slug)).toContain("cursor-grok-4.6");
  });

  it("suggests effort variants only after the family hyphen", () => {
    const viaAlias = cursorMentionSuggestItems("cursor", "grok", staticCatalog);
    expect(viaAlias.every((item) => item.kind === "family")).toBeTruthy();

    const efforts = cursorMentionSuggestItems(
      "cursor",
      "cursor-grok-4.6-",
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

describe("picker descriptors from a collapsed family", () => {
  it("uses live family suffixes for the effort SELECT", () => {
    const merged = mergeModelCatalog("cursor", [
      { slug: "cursor-grok-4.6-low" },
      { slug: "cursor-grok-4.6-medium" },
      { slug: "cursor-grok-4.6-high" },
    ]);
    expect(merged.models.map((model) => model.slug)).toStrictEqual([
      "cursor-grok-4.6",
    ]);
    const descriptor = primaryOptionDescriptor(
      optionDescriptorsFor("cursor", "cursor-grok-4.6", merged.models[0])
    );
    expect(
      descriptor && descriptor.type === "select"
        ? descriptor.options.map((option) => option.id)
        : []
    ).toStrictEqual(["low", "medium", "high"]);
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
      headlessArgs("cursor", "hi", "cursor-grok-4.6", [
        { id: "reasoning", value: "high" },
      ])
    ).toContain("cursor-grok-4.6-high");
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
