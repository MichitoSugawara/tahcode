import { describe, expect, it } from "vitest";
import {
  classifyMention,
  parseMentions,
  preferredProvider,
  preferredTarget,
  shouldDispatchAgent,
} from "../shared/mentions.ts";
import { formatAgentMention, isValidModelSlug, resolveModelSlug } from "../shared/providers.ts";
import { headlessArgs } from "../runtime/src/providers.ts";

describe("parseMentions", () => {
  it("classifies provider, agent, runtime, and user handles", () => {
    const mentions = parseMentions("hey @claude and @rt-office plus @mai, also @agent");
    expect(mentions.map((m) => m.kind)).toEqual(["provider", "runtime", "user", "agent"]);
    expect(mentions[0]?.providerKind).toBe("claudeAgent");
    expect(mentions[0]?.model).toBeUndefined();
    expect(mentions[1]?.handle).toBe("office");
  });

  it("dedupes case-insensitively", () => {
    expect(parseMentions("@Claude @claude").length).toBe(1);
  });

  it("reads @provider/model", () => {
    const [mention] = parseMentions("@cursor/muse-spark-1.3 review this");
    expect(mention).toMatchObject({
      kind: "provider",
      handle: "cursor",
      providerKind: "cursor",
      model: "muse-spark-1.3",
      raw: "@cursor/muse-spark-1.3",
    });
  });

  it("keeps provider-qualified OpenCode models intact", () => {
    const [mention] = parseMentions("@opencode/anthropic/claude-sonnet-5 go");
    expect(mention?.providerKind).toBe("opencode");
    expect(mention?.model).toBe("anthropic/claude-sonnet-5");
  });

  it("resolves catalog aliases and preserves unknown slugs", () => {
    expect(parseMentions("@claude/opus")[0]?.model).toBe("claude-opus-5");
    expect(parseMentions("@cursor/gpt-5.6-sol-high")[0]?.model).toBe("gpt-5.6-sol-high");
  });

  it("ignores trailing punctuation after a handle", () => {
    expect(parseMentions("ask @claude.")[0]).toMatchObject({ kind: "provider", raw: "@claude" });
    expect(parseMentions("ask @cursor/")[0]).toMatchObject({ kind: "provider", providerKind: "cursor", model: undefined });
  });

  it("treats @agent/anything as the chat agent", () => {
    expect(classifyMention("agent/whatever").kind).toBe("agent");
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
    expect(
      shouldDispatchAgent({
        chatKind: "project",
        mentions: parseMentions("please look @cursor/muse-spark-1.3"),
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

describe("preferredTarget", () => {
  const bound = { driverKind: "cursor" as const, model: "muse-spark-1.3" };

  it("takes provider and model from the mention", () => {
    expect(preferredTarget(parseMentions("@codex/gpt-5.6-sol do it"), bound)).toEqual({ driverKind: "codex", model: "gpt-5.6-sol" });
  });

  it("keeps the chat's model for a bare mention of the same provider", () => {
    expect(preferredTarget(parseMentions("@cursor do it"), bound)).toEqual(bound);
  });

  it("uses the CLI default for a bare mention of another provider", () => {
    expect(preferredTarget(parseMentions("@claude do it"), bound)).toEqual({ driverKind: "claudeAgent", model: undefined });
  });

  it("falls back to the binding when nothing is mentioned", () => {
    expect(preferredTarget(parseMentions("hello @agent"), bound)).toEqual(bound);
    expect(preferredTarget([], { driverKind: "codex" })).toEqual({ driverKind: "codex", model: undefined });
  });
});

describe("model slugs", () => {
  it("validates the mention character set", () => {
    expect(isValidModelSlug("muse-spark-1.3")).toBe(true);
    expect(isValidModelSlug("anthropic/claude-sonnet-5")).toBe(true);
    expect(isValidModelSlug("")).toBe(false);
    expect(isValidModelSlug("bad slug")).toBe(false);
    expect(isValidModelSlug("trailing/")).toBe(false);
    expect(isValidModelSlug("x".repeat(81))).toBe(false);
  });

  it("resolves aliases per provider and formats mentions", () => {
    expect(resolveModelSlug("claudeAgent", "Sonnet")).toBe("claude-sonnet-5");
    expect(resolveModelSlug("cursor", "  ")).toBeUndefined();
    expect(formatAgentMention("cursor", "muse-spark-1.3")).toBe("@cursor/muse-spark-1.3");
    expect(formatAgentMention("claudeAgent")).toBe("@claude");
  });
});

describe("headlessArgs", () => {
  it("adds the CLI model flag only when a model is set", () => {
    expect(headlessArgs("cursor", "hi")).toEqual(["-p", "--output-format", "stream-json", "hi"]);
    expect(headlessArgs("cursor", "hi", "muse-spark-1.3")).toEqual(["-p", "--model", "muse-spark-1.3", "--output-format", "stream-json", "hi"]);
    expect(headlessArgs("codex", "hi", "gpt-5.6-sol")).toEqual(["exec", "--model", "gpt-5.6-sol", "--json", "hi"]);
    expect(headlessArgs("claudeAgent", "hi", "claude-opus-5").slice(0, 3)).toEqual(["-p", "--model", "claude-opus-5"]);
    expect(headlessArgs("opencode", "hi", "anthropic/claude-sonnet-5")).toEqual(["run", "--model", "anthropic/claude-sonnet-5", "hi"]);
    expect(headlessArgs("grok", "hi", "grok-4.6")).toEqual(["--model", "grok-4.6", "--prompt", "hi"]);
  });
});
