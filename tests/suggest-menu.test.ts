import { describe, expect, it } from "vitest";

import {
  filterSuggestItems,
  placeSuggestMenu,
} from "../src/lib/suggestMenu.ts";

const PROVIDERS = [
  { desc: "Antigravity で実行", insert: "@antigravity ", name: "@antigravity" },
  { desc: "Claude で実行", insert: "@claude ", name: "@claude" },
  { desc: "Codex で実行", insert: "@codex ", name: "@codex" },
  { desc: "Cursor で実行", insert: "@cursor ", name: "@cursor" },
  { desc: "Grok で実行", insert: "@grok ", name: "@grok" },
  { desc: "OpenCode で実行", insert: "@opencode ", name: "@opencode" },
];

const COMMANDS = [
  { desc: "新しいチャット", name: "/new" },
  { desc: "新しいプロジェクト", name: "/project" },
  { desc: "マシンランタイムを登録", name: "/runtime" },
];

describe(placeSuggestMenu, () => {
  it("stays above when the preferred height fits", () => {
    expect(
      placeSuggestMenu({
        anchor: { bottom: 640, top: 520 },
        bounds: { bottom: 780, top: 48 },
      })
    ).toStrictEqual({ maxHeight: 288, side: "above" });
  });

  it("flips below when the hero has little room above", () => {
    /* Tab bar + rounded panel clip the list if it grows past ~124px */
    const placed = placeSuggestMenu({
      anchor: { bottom: 360, top: 220 },
      bounds: { bottom: 800, top: 80 },
    });
    expect(placed.side).toBe("below");
    expect(placed.maxHeight).toBe(288);
  });

  it("never lets maxHeight exceed the available side", () => {
    const placed = placeSuggestMenu({
      anchor: { bottom: 200, top: 160 },
      bounds: { bottom: 240, top: 80 },
    });
    expect(placed.maxHeight).toBeLessThanOrEqual(
      placed.side === "above" ? 64 : 24
    );
    expect(placed.maxHeight).toBeGreaterThanOrEqual(0);
  });

  it("does not force a 140px floor that would clip the first row", () => {
    const placed = placeSuggestMenu({
      anchor: { bottom: 240, top: 200 },
      bounds: { bottom: 300, top: 160 },
    });
    expect(placed.maxHeight).toBeLessThan(140);
    expect(placed.maxHeight).toBeGreaterThan(0);
  });
});

describe(filterSuggestItems, () => {
  it("keeps catalog order when the query is empty", () => {
    expect(
      filterSuggestItems(PROVIDERS, "").map((item) => item.name)
    ).toStrictEqual(PROVIDERS.map((item) => item.name));
  });

  it("ranks prefix hits for @ mentions", () => {
    expect(filterSuggestItems(PROVIDERS, "gro")[0]?.name).toBe("@grok");
    expect(filterSuggestItems(PROVIDERS, "cod")[0]?.name).toBe("@codex");
  });

  it("tolerates a nearby typo", () => {
    expect(filterSuggestItems(PROVIDERS, "gork")[0]?.name).toBe("@grok");
    expect(filterSuggestItems(PROVIDERS, "codx")[0]?.name).toBe("@codex");
  });

  it("fuzzy-filters slash commands", () => {
    expect(filterSuggestItems(COMMANDS, "new")[0]?.name).toBe("/new");
    expect(filterSuggestItems(COMMANDS, "prj")[0]?.name).toBe("/project");
    expect(filterSuggestItems(COMMANDS, "zzz")).toStrictEqual([]);
  });

  it("matches model slugs after the slash", () => {
    const models = [
      { insert: "@cursor/muse-spark-1.3 ", name: "@cursor/muse-spark-1.3" },
      { insert: "@cursor/composer-2.5 ", name: "@cursor/composer-2.5" },
    ];
    expect(filterSuggestItems(models, "cursor/mus")[0]?.name).toBe(
      "@cursor/muse-spark-1.3"
    );
    expect(filterSuggestItems(models, "comp")[0]?.name).toBe(
      "@cursor/composer-2.5"
    );
  });
});
