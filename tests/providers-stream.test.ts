import { describe, expect, it } from "vitest";

import { classifyStreamEvent } from "../runtime/src/providers.ts";

/** Same accumulation as `runHeadless` — join classified text with a newline. */
function foldStreamJson(events: unknown[]): string {
  let emitted = false;
  let output = "";
  for (const event of events) {
    const classified = classifyStreamEvent(event, emitted, output);
    if (classified.kind === "text" && classified.text) {
      emitted = true;
      output += `${classified.text}\n`;
    }
  }
  return output.trim();
}

function cursorAssistant(text: string, extra: Record<string, unknown> = {}) {
  return {
    message: {
      content: [{ text, type: "text" }],
      role: "assistant",
    },
    type: "assistant",
    ...extra,
  };
}

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

  it("does not double-append a Cursor stream-json greeting", () => {
    const greeting = "こんにちは！今日はどんなお手伝いをしましょうか？";
    const folded = foldStreamJson([
      { subtype: "init", type: "system" },
      cursorAssistant(greeting),
      // Final flush: same full snapshot, no timestamp_ms (Cursor stream-json).
      cursorAssistant(greeting),
      {
        duration_ms: 15_400,
        is_error: false,
        result: greeting,
        subtype: "success",
        type: "result",
      },
    ]);
    expect(folded).toBe(greeting);
    expect(folded.split(greeting)).toHaveLength(2);
  });

  it("skips Cursor buffered assistant flushes tagged with model_call_id", () => {
    const greeting = "こんにちは！今日はどんなお手伝いをしましょうか？";
    expect(
      classifyStreamEvent(
        cursorAssistant(greeting, { model_call_id: "call_1", timestamp_ms: 1 }),
        true,
        greeting
      )
    ).toStrictEqual({ kind: "trace" });
  });

  it("emits only the new suffix when an assistant snapshot grows", () => {
    expect(
      classifyStreamEvent(
        cursorAssistant("こんにちは！今日はどんなお手伝いをしましょうか？"),
        true,
        "こんにちは！"
      )
    ).toStrictEqual({
      kind: "text",
      text: "今日はどんなお手伝いをしましょうか？",
    });
  });
});
