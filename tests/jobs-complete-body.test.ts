import { describe, expect, it } from "vitest";

import { resolveCompletedMessageBody } from "../shared/jobs.ts";

describe(resolveCompletedMessageBody, () => {
  const greeting = "こんにちは！今日はどんなお手伝いをしましょうか？";
  const footer = "_Cursor · auto · 15.4s · /Users/me/.local/bin/agent_";
  const finalText = `${greeting}\n\n${footer}`;

  it("replaces streamed body with finalText instead of concatenating", () => {
    const streamed = `${greeting}\n`;
    expect(resolveCompletedMessageBody(streamed, finalText)).toBe(finalText);
    expect(resolveCompletedMessageBody(streamed, finalText)).not.toBe(
      `${streamed}${finalText}`
    );
  });

  it("no-ops when finalText is already the body or a suffix", () => {
    expect(resolveCompletedMessageBody(finalText, finalText)).toBe(finalText);
    const alreadyConcatenated = `${greeting}\n${finalText}`;
    expect(resolveCompletedMessageBody(alreadyConcatenated, finalText)).toBe(
      alreadyConcatenated
    );
  });

  it("keeps the current body when finalText is empty", () => {
    expect(resolveCompletedMessageBody("kept", "")).toBe("kept");
  });
});
