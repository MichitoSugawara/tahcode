import { describe, expect, it } from "vitest";

import { fuzzyFieldScore, fuzzyScore } from "../src/lib/fuzzy.ts";

describe(fuzzyScore, () => {
  it("ranks prefix matches above subsequence", () => {
    expect(fuzzyScore("grok", "gro")).toBeGreaterThan(
      fuzzyScore("antigravity", "gro")
    );
  });

  it("accepts adjacent transpositions", () => {
    expect(fuzzyScore("grok", "gork")).toBeGreaterThan(0);
    expect(fuzzyScore("cursor", "crusor")).toBeGreaterThan(0);
  });

  it("returns 0 when nothing lines up", () => {
    expect(fuzzyScore("codex", "zzz")).toBe(0);
  });
});

describe(fuzzyFieldScore, () => {
  it("matches a mention after stripping @", () => {
    expect(fuzzyFieldScore("@codex", "cod")).toBeGreaterThan(0);
    expect(fuzzyFieldScore("@cursor/muse-spark-1.3", "mus")).toBeGreaterThan(0);
  });

  it("matches a model slug from a provider/query path", () => {
    expect(
      fuzzyFieldScore("@cursor/cursor-grok-4.6", "cursor/grok")
    ).toBeGreaterThan(0);
    expect(
      fuzzyFieldScore("@cursor/cursor-grok-4.6", "cursor/grok")
    ).toBeGreaterThan(fuzzyFieldScore("@cursor/muse-spark-1.3", "cursor/grok"));
  });
});
