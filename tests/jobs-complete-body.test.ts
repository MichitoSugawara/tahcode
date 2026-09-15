import { describe, expect, it } from "vitest";

import {
  cancelledNoticeDetail,
  collapseDuplicatedMessageBody,
  JOB_CANCELLED_MESSAGE,
  resolveCompletedMessageBody,
  shouldWriteJobEventToMessageBody,
} from "../shared/jobs.ts";

describe("job event / cancel copy (TAH-76)", () => {
  it("writes only text events onto the assistant body", () => {
    expect(shouldWriteJobEventToMessageBody("text")).toBeTruthy();
    expect(shouldWriteJobEventToMessageBody("thinking")).toBeFalsy();
    expect(shouldWriteJobEventToMessageBody("tool")).toBeFalsy();
  });

  it("omits a duplicate 中断しました under the notice title", () => {
    expect(cancelledNoticeDetail()).toBeNull();
    expect(cancelledNoticeDetail(JOB_CANCELLED_MESSAGE)).toBeNull();
    expect(cancelledNoticeDetail("lease lost")).toBe("lease lost");
  });
});

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

  it("collapses a doubled snapshot inside finalText", () => {
    expect(collapseDuplicatedMessageBody(`${greeting}\n${greeting}`)).toBe(
      greeting
    );
    const doubled = `${greeting}\n${greeting}\n\n${footer}`;
    expect(resolveCompletedMessageBody(`${greeting}\n`, doubled)).toBe(
      `${greeting}\n\n${footer}`
    );
  });
});
