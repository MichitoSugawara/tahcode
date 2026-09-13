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

  it("surfaces Codex image_generation items as tool rows", () => {
    expect(
      classifyStreamEvent({
        item: {
          item_type: "image_generation",
          saved_path: "/tmp/ig.png",
        },
        type: "item.completed",
      })
    ).toMatchObject({ kind: "tool" });
  });
});
