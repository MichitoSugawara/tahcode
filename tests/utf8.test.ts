import { describe, expect, it } from "vitest";

import {
  createUtf8LineBuffer,
  flushUtf8Lines,
  pushUtf8Lines,
} from "../shared/utf8.ts";

describe("utf8 line buffer", () => {
  it("does not emit a split multi-byte character", () => {
    const yen = new TextEncoder().encode("円\n");
    const state = createUtf8LineBuffer();
    expect(pushUtf8Lines(state, yen.slice(0, 1))).toStrictEqual([]);
    expect(pushUtf8Lines(state, yen.slice(1))).toStrictEqual(["円"]);
    expect(flushUtf8Lines(state)).toStrictEqual([]);
  });
});
