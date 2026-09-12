import { describe, expect, it } from "vitest";
import { parseMentions, preferredProvider, shouldDispatchAgent } from "../shared/mentions.ts";

describe("parseMentions", () => {
  it("classifies provider, agent, runtime, and user handles", () => {
    const mentions = parseMentions("hey @claude and @rt-office plus @mai, also @agent");
    expect(mentions.map((m) => m.kind)).toEqual(["provider", "runtime", "user", "agent"]);
    expect(mentions[0]?.providerKind).toBe("claudeAgent");
    expect(mentions[1]?.handle).toBe("office");
  });

  it("dedupes case-insensitively", () => {
    expect(parseMentions("@Claude @claude").length).toBe(1);
  });
});

describe("shouldDispatchAgent", () => {
  it("always dispatches in DMs", () => {
    expect(shouldDispatchAgent({ chatKind: "dm", mentions: [] })).toBe(true);
  });

  it("requires an agent-like mention in project chats", () => {
    expect(
      shouldDispatchAgent({
        chatKind: "project",
        mentions: parseMentions("hello team"),
      }),
    ).toBe(false);
    expect(
      shouldDispatchAgent({
        chatKind: "project",
        mentions: parseMentions("please look @codex"),
      }),
    ).toBe(true);
  });
});

describe("preferredProvider", () => {
  it("uses the first mentioned provider, else fallback", () => {
    expect(preferredProvider(parseMentions("@grok later @claude"), "codex")).toBe("grok");
    expect(preferredProvider(parseMentions("no agent"), "cursor")).toBe("cursor");
  });
});
