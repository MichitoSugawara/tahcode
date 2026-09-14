import { describe, expect, it } from "vitest";

import { headlessArgs } from "../runtime/src/providers.ts";
import {
  classifyMention,
  parseMentions,
  preferredProvider,
  preferredTarget,
  shouldDispatchAgent,
} from "../shared/mentions.ts";
import {
  formatAgentMention,
  isValidModelSlug,
  providerKindFromHandle,
  resolveModelSlug,
} from "../shared/providers.ts";

describe(parseMentions, () => {
  it("classifies provider, agent, runtime, and user handles", () => {
    const mentions = parseMentions(
      "hey @claude and @rt-office plus @mai, also @agent"
    );
    expect(mentions.map((m) => m.kind)).toStrictEqual([
      "provider",
      "runtime",
      "user",
      "agent",
    ]);
    expect(mentions[0]?.providerKind).toBe("claudeAgent");
    expect(mentions[0]?.model).toBeUndefined();
    expect(mentions[1]?.handle).toBe("office");
  });

  it("dedupes case-insensitively", () => {
    expect(parseMentions("@Claude @claude")).toHaveLength(1);
  });

  it("reads @provider/model", () => {
    const [mention] = parseMentions("@cursor/muse-spark-1.3 review this");
    expect(mention).toMatchObject({
      handle: "cursor",
      kind: "provider",
      model: "muse-spark-1.3",
      providerKind: "cursor",
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
    expect(parseMentions("@cursor/grok")[0]?.model).toBe("cursor-grok-4.6");
    expect(parseMentions("@cursor/gpt-5.6-sol-high")[0]?.model).toBe(
      "gpt-5.6-sol-high"
    );
  });

  it("ignores trailing punctuation after a handle", () => {
    expect(parseMentions("ask @claude.")[0]).toMatchObject({
      kind: "provider",
      raw: "@claude",
    });
    expect(parseMentions("ask @cursor/")[0]).toMatchObject({
      kind: "provider",
      model: undefined,
      providerKind: "cursor",
    });
  });

  it("treats @agent/anything as the chat agent", () => {
    expect(classifyMention("agent/whatever").kind).toBe("agent");
  });

  it("does not treat prototype property names as providers", () => {
    expect(providerKindFromHandle("__proto__")).toBeUndefined();
    expect(providerKindFromHandle("constructor")).toBeUndefined();
    expect(parseMentions("@__proto__")[0]?.kind).toBe("user");
    expect(parseMentions("@constructor")[0]?.kind).toBe("user");
  });
});

describe(shouldDispatchAgent, () => {
  it("always dispatches in DMs", () => {
    expect(shouldDispatchAgent({ chatKind: "dm", mentions: [] })).toBeTruthy();
  });

  it("requires an agent-like mention in project chats", () => {
    expect(
      shouldDispatchAgent({
        chatKind: "project",
        mentions: parseMentions("hello team"),
      })
    ).toBeFalsy();
    expect(
      shouldDispatchAgent({
        chatKind: "project",
        mentions: parseMentions("please look @codex"),
      })
    ).toBeTruthy();
    expect(
      shouldDispatchAgent({
        chatKind: "project",
        mentions: parseMentions("please look @cursor/muse-spark-1.3"),
      })
    ).toBeTruthy();
  });
});

describe(preferredProvider, () => {
  it("uses the first mentioned provider, else fallback", () => {
    expect(
      preferredProvider(parseMentions("@grok later @claude"), "codex")
    ).toBe("grok");
    expect(preferredProvider(parseMentions("no agent"), "cursor")).toBe(
      "cursor"
    );
  });
});

describe(preferredTarget, () => {
  const bound = { driverKind: "cursor" as const, model: "muse-spark-1.3" };

  it("takes provider and model from the mention", () => {
    expect(
      preferredTarget(parseMentions("@codex/gpt-5.6-sol do it"), bound)
    ).toStrictEqual({ driverKind: "codex", model: "gpt-5.6-sol" });
  });

  it("keeps the chat's model for a bare mention of the same provider", () => {
    expect(
      preferredTarget(parseMentions("@cursor do it"), bound)
    ).toStrictEqual(bound);
  });

  it("uses the CLI default for a bare mention of another provider", () => {
    expect(
      preferredTarget(parseMentions("@claude do it"), bound)
    ).toStrictEqual({ driverKind: "claudeAgent", model: undefined });
  });

  it("falls back to the binding when nothing is mentioned", () => {
    expect(preferredTarget(parseMentions("hello @agent"), bound)).toStrictEqual(
      bound
    );
    expect(preferredTarget([], { driverKind: "codex" })).toStrictEqual({
      driverKind: "codex",
      model: undefined,
    });
  });

  it("keeps effort options on the same provider and drops them on another", () => {
    const withEffort = {
      driverKind: "codex" as const,
      model: "gpt-5.6-sol",
      options: [{ id: "reasoningEffort" as const, value: "high" as const }],
    };
    expect(preferredTarget([], withEffort)).toStrictEqual(withEffort);
    expect(
      preferredTarget(parseMentions("@codex keep going"), withEffort)
    ).toStrictEqual(withEffort);
    expect(
      preferredTarget(parseMentions("@claude/opus do it"), withEffort)
    ).toStrictEqual({
      driverKind: "claudeAgent",
      model: "claude-opus-5",
    });
  });
});

describe("model slugs", () => {
  it("validates the mention character set", () => {
    expect(isValidModelSlug("muse-spark-1.3")).toBeTruthy();
    expect(isValidModelSlug("anthropic/claude-sonnet-5")).toBeTruthy();
    expect(isValidModelSlug("")).toBeFalsy();
    expect(isValidModelSlug("bad slug")).toBeFalsy();
    expect(isValidModelSlug("trailing/")).toBeFalsy();
  });

  it("rejects model slugs longer than 80 characters", () => {
    expect(isValidModelSlug("x".repeat(81))).toBeFalsy();
  });

  it("resolves aliases per provider and formats mentions", () => {
    expect(resolveModelSlug("claudeAgent", "Sonnet")).toBe("claude-sonnet-5");
    expect(resolveModelSlug("cursor", "grok")).toBe("cursor-grok-4.6");
    expect(resolveModelSlug("cursor", "  ")).toBeUndefined();
    expect(formatAgentMention("cursor", "muse-spark-1.3")).toBe(
      "@cursor/muse-spark-1.3"
    );
    expect(formatAgentMention("claudeAgent")).toBe("@claude");
  });
});

describe(headlessArgs, () => {
  it("adds the CLI model flag only when a model is set", () => {
    expect(headlessArgs("cursor", "hi")).toStrictEqual([
      "-p",
      "--trust",
      "--output-format",
      "stream-json",
      "hi",
    ]);
    expect(headlessArgs("cursor", "hi", "muse-spark-1.3")).toStrictEqual([
      "-p",
      "--trust",
      "--model",
      "muse-spark-1.3",
      "--output-format",
      "stream-json",
      "hi",
    ]);
    expect(headlessArgs("codex", "hi", "gpt-5.6-sol")).toStrictEqual([
      "exec",
      "--model",
      "gpt-5.6-sol",
      "--json",
      "hi",
    ]);
    expect(
      headlessArgs("claudeAgent", "hi", "claude-opus-5").slice(0, 3)
    ).toStrictEqual(["-p", "--model", "claude-opus-5"]);
    expect(
      headlessArgs("opencode", "hi", "anthropic/claude-sonnet-5")
    ).toStrictEqual(["run", "--model", "anthropic/claude-sonnet-5", "hi"]);
  });

  it("gives Codex $imagegen workspace-write and rewrites /imagegen", () => {
    expect(
      headlessArgs("codex", "$imagegen a fox", "gpt-5.6-sol")
    ).toStrictEqual([
      "exec",
      "--model",
      "gpt-5.6-sol",
      "-s",
      "workspace-write",
      "--skip-git-repo-check",
      "--json",
      "$imagegen a fox",
    ]);
    expect(headlessArgs("codex", "/imagegen a fox")).toStrictEqual([
      "exec",
      "-s",
      "workspace-write",
      "--skip-git-repo-check",
      "--json",
      "$imagegen a fox",
    ]);
  });

  it("adds Grok's model flag when a model is set", () => {
    expect(headlessArgs("grok", "hi", "grok-4.6")).toStrictEqual([
      "--model",
      "grok-4.6",
      "--prompt",
      "hi",
    ]);
  });

  it("adds provider-native effort flags only when the option is explicit", () => {
    expect(
      headlessArgs("codex", "hi", "gpt-5.6-sol", [
        { id: "reasoningEffort", value: "high" },
      ])
    ).toStrictEqual([
      "exec",
      "--model",
      "gpt-5.6-sol",
      "--config",
      "model_reasoning_effort=high",
      "--json",
      "hi",
    ]);
    expect(
      headlessArgs("claudeAgent", "hi", "claude-opus-5", [
        { id: "effort", value: "xhigh" },
      ]).slice(0, 5)
    ).toStrictEqual(["-p", "--model", "claude-opus-5", "--effort", "xhigh"]);
    expect(
      headlessArgs("opencode", "hi", "anthropic/claude-sonnet-5", [
        { id: "variant", value: "high" },
      ])
    ).toStrictEqual([
      "run",
      "--model",
      "anthropic/claude-sonnet-5",
      "--variant",
      "high",
      "hi",
    ]);
    expect(
      headlessArgs("cursor", "hi", "muse-spark-1.3", [
        { id: "reasoning", value: "high" },
      ])
    ).toStrictEqual([
      "-p",
      "--trust",
      "--model",
      "muse-spark-1.3",
      "--output-format",
      "stream-json",
      "hi",
    ]);
  });

  it("injects Claude ultrathink into the prompt and maps ultracode to --effort xhigh", () => {
    expect(
      headlessArgs("claudeAgent", "fix it", "claude-fable-5-1", [
        { id: "effort", value: "ultrathink" },
      ])
    ).toContain("Ultrathink:\nfix it");
    expect(
      headlessArgs("claudeAgent", "fix it", "claude-fable-5-1", [
        { id: "effort", value: "ultrathink" },
      ])
    ).not.toContain("--effort");
    const ultracode = headlessArgs("claudeAgent", "fix it", "claude-opus-5", [
      { id: "effort", value: "ultracode" },
    ]);
    expect(ultracode).toContain("--effort");
    expect(ultracode).toContain("xhigh");
    expect(ultracode).toContain(JSON.stringify({ ultracode: true }));
  });

  it("passes Codex serviceTier, Claude extras, and OpenCode agent", () => {
    expect(
      headlessArgs("codex", "hi", "gpt-5.6-sol", [
        { id: "reasoningEffort", value: "high" },
        { id: "serviceTier", value: "fast" },
      ])
    ).toStrictEqual([
      "exec",
      "--model",
      "gpt-5.6-sol",
      "--config",
      "model_reasoning_effort=high",
      "--config",
      "service_tier=fast",
      "--json",
      "hi",
    ]);
    expect(
      headlessArgs("claudeAgent", "hi", "claude-opus-5", [
        { id: "contextWindow", value: "1m" },
        { id: "fastMode", value: true },
      ]).slice(0, 5)
    ).toStrictEqual(["-p", "--model", "claude-opus-5[1m]"]);
    expect(
      headlessArgs("opencode", "hi", "anthropic/claude-sonnet-5", [
        { id: "variant", value: "high" },
        { id: "agent", value: "plan" },
      ])
    ).toStrictEqual([
      "run",
      "--model",
      "anthropic/claude-sonnet-5",
      "--variant",
      "high",
      "--agent",
      "plan",
      "hi",
    ]);
  });
});
