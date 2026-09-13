import { describe, expect, it } from "vitest";

import { classifyStreamEvent } from "../runtime/src/providers.ts";

describe(classifyStreamEvent, () => {
  it("drops a duplicate result after streamed text", () => {
    expect(
      classifyStreamEvent({ result: "full reply", type: "result" }, true)
    ).toStrictEqual({ kind: "trace" });
    expect(
      classifyStreamEvent({ result: "only this", type: "result" }, false)
    ).toStrictEqual({ kind: "text", text: "only this" });
  });
});
