import { describe, expect, it } from "vitest";
import {
  applyClaudePromptEffortPrefix,
  getProviderOptionCurrentLabel,
  getProviderOptionCurrentValue,
  optionDescriptorsFor,
  planHeadlessEffort,
  primaryOptionDescriptor,
  retainValidOptions,
  sanitizeOptionSelections,
  supportsEffortPick,
  upsertOptionSelection,
} from "../shared/modelOptions.ts";
import { PROVIDER_DRIVER_KINDS } from "../shared/providers.ts";

describe("optionDescriptorsFor", () => {
  it("matches t3code option ids and defaults for Codex, Claude, Cursor, OpenCode", () => {
    const codex = primaryOptionDescriptor(optionDescriptorsFor("codex", "gpt-5.6-sol"));
    expect(codex).toMatchObject({ id: "reasoningEffort", type: "select", currentValue: "medium" });
    expect(codex && codex.type === "select" ? codex.options.map((option) => option.id) : []).toEqual([
      "none",
      "minimal",
      "low",
      "medium",
      "high",
      "xhigh",
      "max",
      "ultra",
    ]);
    expect(codex && codex.type === "select" ? codex.options.find((option) => option.id === "xhigh")?.label : "").toBe(
      "Extra High",
    );

    const astra = primaryOptionDescriptor(optionDescriptorsFor("codex", "gpt-6-astra"));
    expect(astra?.type === "select" ? astra.currentValue : null).toBe("medium");

    const fable = primaryOptionDescriptor(optionDescriptorsFor("claudeAgent", "claude-fable-5-1"));
    expect(fable).toMatchObject({ id: "effort", type: "select", currentValue: "medium" });
    expect(fable && fable.type === "select" ? fable.promptInjectedValues : []).toEqual(["ultrathink"]);
    expect(fable && fable.type === "select" ? fable.options.map((option) => option.id) : []).toContain("ultracode");

    const opus = primaryOptionDescriptor(optionDescriptorsFor("claudeAgent", "claude-opus-5"));
    expect(opus?.type === "select" ? opus.currentValue : null).toBe("high");

    const opus47 = primaryOptionDescriptor(optionDescriptorsFor("claudeAgent", "claude-opus-4-7"));
    expect(opus47?.type === "select" ? opus47.currentValue : null).toBe("xhigh");
    expect(opus47 && opus47.type === "select" ? opus47.options.map((option) => option.id) : []).not.toContain("ultracode");

    const haiku = primaryOptionDescriptor(optionDescriptorsFor("claudeAgent", "claude-haiku-4-5"));
    expect(haiku).toMatchObject({ id: "thinking", type: "boolean", currentValue: false });

    const cursor = primaryOptionDescriptor(optionDescriptorsFor("cursor", "composer-2.5"));
    expect(cursor).toMatchObject({ id: "reasoning", type: "select", currentValue: "medium" });

    const ocAnthropic = primaryOptionDescriptor(optionDescriptorsFor("opencode", "anthropic/claude-sonnet-5"));
    expect(ocAnthropic).toMatchObject({ id: "variant", type: "select", currentValue: "high" });
    const ocOpenAi = primaryOptionDescriptor(optionDescriptorsFor("opencode", "openai/gpt-5.6-sol"));
    expect(ocOpenAi?.type === "select" ? ocOpenAi.currentValue : null).toBe("medium");
  });

  it("hides the control for Antigravity and uses live Codex reasoning levels when present", () => {
    expect(optionDescriptorsFor("antigravity", "gemini-3.8-flash-high")).toEqual([]);
    expect(supportsEffortPick("antigravity")).toBe(false);
    expect(PROVIDER_DRIVER_KINDS.filter((kind) => supportsEffortPick(kind))).toEqual([
      "codex",
      "claudeAgent",
      "cursor",
      "grok",
      "opencode",
    ]);

    const live = primaryOptionDescriptor(
      optionDescriptorsFor("codex", "gpt-5.6-sol", {
        defaultReasoningLevel: "low",
        supportedReasoningLevels: ["low", "medium", "high"],
      }),
    );
    expect(live && live.type === "select" ? live.options.map((option) => option.id) : []).toEqual(["low", "medium", "high"]);
    expect(live?.type === "select" ? live.currentValue : null).toBe("low");
  });
});

describe("selections + labels", () => {
  it("sanitizes, upserts, and falls back to the descriptor default", () => {
    expect(sanitizeOptionSelections([{ id: "effort", value: "high" }, { id: "nope!", value: "x" }])).toEqual([
      { id: "effort", value: "high" },
    ]);
    expect(sanitizeOptionSelections([{ id: "", value: "high" }])).toBeUndefined();

    const next = upsertOptionSelection([{ id: "effort", value: "high" }], "effort", "max");
    expect(next).toEqual([{ id: "effort", value: "max" }]);
    expect(upsertOptionSelection(next, "effort", null)).toBeUndefined();

    const descriptor = primaryOptionDescriptor(optionDescriptorsFor("claudeAgent", "claude-opus-5"));
    expect(descriptor).toBeDefined();
    if (!descriptor) return;
    expect(getProviderOptionCurrentValue(descriptor, undefined)).toBe("high");
    expect(getProviderOptionCurrentLabel(descriptor, [{ id: "effort", value: "xhigh" }])).toBe("Extra High");
    expect(getProviderOptionCurrentValue(descriptor, [{ id: "effort", value: "nope" }])).toBe("high");
  });

  it("drops effort when the provider or model no longer advertises it", () => {
    const kept = retainValidOptions("claudeAgent", "claude-opus-5", [{ id: "effort", value: "high" }]);
    expect(kept).toEqual([{ id: "effort", value: "high" }]);
    expect(retainValidOptions("codex", "gpt-5.6-sol", [{ id: "effort", value: "high" }])).toBeUndefined();
    expect(retainValidOptions("claudeAgent", "claude-opus-4-5", [{ id: "effort", value: "ultrathink" }])).toBeUndefined();
  });
});

describe("planHeadlessEffort", () => {
  it("omits flags until the user persists a selection", () => {
    expect(planHeadlessEffort("codex", "hi", "gpt-5.6-sol", undefined).flags).toEqual([]);
    expect(planHeadlessEffort("claudeAgent", "hi", "claude-opus-5", undefined).flags).toEqual([]);
  });

  it("maps Claude profiles the way t3code effortMap does", () => {
    expect(planHeadlessEffort("claudeAgent", "hi", "claude-opus-4-7", [{ id: "effort", value: "xhigh" }]).flags).toEqual([
      "--effort",
      "max",
    ]);
    expect(planHeadlessEffort("claudeAgent", "hi", "claude-sonnet-4-6", [{ id: "effort", value: "max" }]).flags).toEqual([
      "--effort",
      "high",
    ]);
    expect(planHeadlessEffort("claudeAgent", "hi", "claude-haiku-4-5", [{ id: "thinking", value: true }]).flags).toEqual([
      "--settings",
      JSON.stringify({ alwaysThinkingEnabled: true }),
    ]);
  });

  it("prefixes Ultrathink and skips slash commands", () => {
    expect(applyClaudePromptEffortPrefix("fix the race", "ultrathink")).toBe("Ultrathink:\nfix the race");
    expect(applyClaudePromptEffortPrefix("/compact please", "ultrathink")).toBe("/compact please");
    expect(applyClaudePromptEffortPrefix("please ultrathink this", "ultrathink")).toBe("please ultrathink this");
    expect(applyClaudePromptEffortPrefix("fix it", "high")).toBe("fix it");
  });

  it("marks Cursor and Grok as persisted-only", () => {
    expect(planHeadlessEffort("cursor", "hi", "auto", [{ id: "reasoning", value: "high" }])).toMatchObject({
      flags: [],
      persistedOnly: true,
    });
    expect(planHeadlessEffort("grok", "hi", "grok-4.6", [{ id: "reasoningEffort", value: "high" }]).persistedOnly).toBe(true);
  });
});
