import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { composeFinalText } from "../runtime/src/artifacts.ts";
import { classifyStreamEvent } from "../runtime/src/providers.ts";

const GREETING = "こんにちは！今日はどんなお手伝いをしましょうか？";

/** Same accumulation as `runHeadless` — join classified text with a newline. */
function foldStreamJson(events: unknown[]): string {
  let emitted = false;
  let lastEmitted = "";
  let output = "";
  for (const event of events) {
    const classified = classifyStreamEvent(event, emitted, output, lastEmitted);
    if (classified.kind === "text" && classified.text) {
      emitted = true;
      lastEmitted = classified.text;
      output += `${classified.text}\n`;
    }
  }
  return output.trim();
}

function loadJsonl(name: string): unknown[] {
  const file = path.join(import.meta.dirname, "fixtures", name);
  return readFileSync(file, "utf-8")
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as unknown);
}

function cursorAssistant(text: string, extra: Record<string, unknown> = {}) {
  return {
    message: {
      content: [{ text, type: "text" }],
      role: "assistant",
    },
    session_id: "c6b62c6f-7ead-4fd6-9922-e952131177ff",
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

  it("does not double-append Cursor assistant snapshots from a real stream-json fixture", () => {
    const events = loadJsonl("cursor-auto-greeting.stream.jsonl");
    const assistants = events.filter(
      (event) => (event as { type?: string }).type === "assistant"
    );
    expect(assistants).toHaveLength(2);
    expect(foldStreamJson(events)).toBe(GREETING);
    // `result` skip is not enough — two full assistant snapshots must not append.
    expect(foldStreamJson(assistants)).toBe(GREETING);
  });

  it("collapses a doubled snapshot if composeFinalText receives it", () => {
    const finalText = composeFinalText({
      artifactMarkdown: "",
      elapsed: "15.4",
      fallbackMarkdown: "",
      model: "auto",
      output: `${GREETING}\n${GREETING}`,
      probeBinary: "/Users/me/.local/bin/agent",
      probeName: "Cursor",
    });
    expect(finalText.split(GREETING)).toHaveLength(2);
    expect(finalText).toContain(
      "_Cursor · auto · 15.4s · /Users/me/.local/bin/agent_"
    );
  });

  it("skips an assistant snapshot that is a prefix or suffix of the last emit", () => {
    expect(
      classifyStreamEvent(
        cursorAssistant("こんにちは！"),
        true,
        GREETING,
        GREETING
      )
    ).toStrictEqual({ kind: "trace" });
    expect(
      classifyStreamEvent(
        cursorAssistant("今日はどんなお手伝いをしましょうか？"),
        true,
        GREETING,
        GREETING
      )
    ).toStrictEqual({ kind: "trace" });
  });

  it("skips Cursor buffered assistant flushes tagged with model_call_id", () => {
    expect(
      classifyStreamEvent(
        cursorAssistant(GREETING, { model_call_id: "call_1", timestamp_ms: 1 }),
        true,
        GREETING,
        GREETING
      )
    ).toStrictEqual({ kind: "trace" });
  });

  it("emits only the new suffix when an assistant snapshot grows", () => {
    expect(
      classifyStreamEvent(
        cursorAssistant(GREETING),
        true,
        "こんにちは！",
        "こんにちは！"
      )
    ).toStrictEqual({
      kind: "text",
      text: "今日はどんなお手伝いをしましょうか？",
    });
  });

  it("keeps distinct assistant snapshots from a multi-turn Cursor stream", () => {
    expect(
      foldStreamJson([
        cursorAssistant("I'll read the README.md file"),
        { subtype: "started", type: "tool_call" },
        cursorAssistant("Based on the README, I'll create a summary"),
        cursorAssistant("Done! I've created the summary in summary.txt"),
        {
          result:
            "I'll read the README.md fileBased on the README, I'll create a summaryDone! I've created the summary in summary.txt",
          type: "result",
        },
      ])
    ).toBe(
      [
        "I'll read the README.md file",
        "Based on the README, I'll create a summary",
        "Done! I've created the summary in summary.txt",
      ].join("\n")
    );
  });
});
