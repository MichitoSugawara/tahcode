import { describe, expect, it } from "vitest";

import {
  applyClaudePromptEffortPrefix,
  getProviderOptionCurrentLabel,
  getProviderOptionCurrentValue,
  optionDescriptorsFor,
  optionFooterFor,
  planHeadlessEffort,
  primaryOptionDescriptor,
  resolveClaudeCliModel,
  retainValidOptions,
  sanitizeOptionSelections,
  supportsEffortPick,
  upsertOptionSelection,
} from "../shared/modelOptions.ts";
import { PROVIDER_DRIVER_KINDS } from "../shared/providers.ts";

describe(optionDescriptorsFor, () => {
  it("matches t3code Codex effort ids and defaults", () => {
    const codex = primaryOptionDescriptor(
      optionDescriptorsFor("codex", "gpt-5.6-sol")
    );
    expect(codex).toMatchObject({
      id: "reasoningEffort",
      type: "select",
      currentValue: "medium",
    });
    expect(
      codex && codex.type === "select"
        ? codex.options.map((option) => option.id)
        : []
    ).toStrictEqual([
      "none",
      "minimal",
      "low",
      "medium",
      "high",
      "xhigh",
      "max",
      "ultra",
    ]);
    expect(
      codex && codex.type === "select"
        ? codex.options.find((option) => option.id === "xhigh")?.label
        : ""
    ).toBe("Extra High");
    const astra = primaryOptionDescriptor(
      optionDescriptorsFor("codex", "gpt-6-astra")
    );
    expect(astra?.type === "select" ? astra.currentValue : null).toBe("medium");
  });

  it("matches t3code Claude effort and thinking defaults", () => {
    const fable = primaryOptionDescriptor(
      optionDescriptorsFor("claudeAgent", "claude-fable-5-1")
    );
    expect(fable).toMatchObject({
      id: "effort",
      type: "select",
      currentValue: "medium",
    });
    expect(
      fable && fable.type === "select" ? fable.promptInjectedValues : []
    ).toStrictEqual(["ultrathink"]);
    expect(
      fable && fable.type === "select"
        ? fable.options.map((option) => option.id)
        : []
    ).toContain("ultracode");
    const opus = primaryOptionDescriptor(
      optionDescriptorsFor("claudeAgent", "claude-opus-5")
    );
    expect(opus?.type === "select" ? opus.currentValue : null).toBe("high");
  });

  it("uses xhigh for Claude Opus 4.7 and thinking for Haiku", () => {
    const opus47 = primaryOptionDescriptor(
      optionDescriptorsFor("claudeAgent", "claude-opus-4-7")
    );
    expect(opus47?.type === "select" ? opus47.currentValue : null).toBe(
      "xhigh"
    );
    expect(
      opus47 && opus47.type === "select"
        ? opus47.options.map((option) => option.id)
        : []
    ).not.toContain("ultracode");
    const haiku = primaryOptionDescriptor(
      optionDescriptorsFor("claudeAgent", "claude-haiku-4-5")
    );
    expect(haiku).toMatchObject({
      id: "thinking",
      type: "boolean",
      currentValue: false,
    });
  });

  it("matches t3code Cursor and OpenCode defaults", () => {
    const cursor = primaryOptionDescriptor(
      optionDescriptorsFor("cursor", "composer-2.5")
    );
    expect(cursor).toMatchObject({
      id: "reasoning",
      type: "select",
      currentValue: "medium",
    });
    const ocAnthropic = primaryOptionDescriptor(
      optionDescriptorsFor("opencode", "anthropic/claude-sonnet-5")
    );
    expect(ocAnthropic).toMatchObject({
      id: "variant",
      type: "select",
      currentValue: "high",
    });
    const ocOpenAi = primaryOptionDescriptor(
      optionDescriptorsFor("opencode", "openai/gpt-5.6-sol")
    );
    expect(ocOpenAi?.type === "select" ? ocOpenAi.currentValue : null).toBe(
      "medium"
    );
  });

  it("hides the control for Antigravity and uses live Codex reasoning levels when present", () => {
    expect(
      optionDescriptorsFor("antigravity", "gemini-3.8-flash-high")
    ).toStrictEqual([]);
    expect(supportsEffortPick("antigravity")).toBeFalsy();
    expect(
      PROVIDER_DRIVER_KINDS.filter((kind) => supportsEffortPick(kind))
    ).toStrictEqual(["codex", "claudeAgent", "cursor", "grok", "opencode"]);

    const live = primaryOptionDescriptor(
      optionDescriptorsFor("codex", "gpt-5.6-sol", {
        defaultReasoningLevel: "low",
        supportedReasoningLevels: ["low", "medium", "high"],
      })
    );
    expect(
      live && live.type === "select"
        ? live.options.map((option) => option.id)
        : []
    ).toStrictEqual(["low", "medium", "high"]);
    expect(live?.type === "select" ? live.currentValue : null).toBe("low");
  });

  it("exposes Codex serviceTier, Claude extras, and OpenCode agent", () => {
    const ids = (
      kind: Parameters<typeof optionDescriptorsFor>[0],
      model: string
    ) => optionDescriptorsFor(kind, model).map((item) => item.id);
    expect({
      claudeFable: ids("claudeAgent", "claude-fable-5-1"),
      claudeHaiku: ids("claudeAgent", "claude-haiku-4-5"),
      claudeOpus: ids("claudeAgent", "claude-opus-5"),
      claudeSonnet: ids("claudeAgent", "claude-sonnet-5"),
      codex: ids("codex", "gpt-5.6-sol"),
      cursor: ids("cursor", "composer-2.5"),
      opencode: ids("opencode", "anthropic/claude-sonnet-5"),
    }).toStrictEqual({
      claudeFable: ["effort", "contextWindow"],
      claudeHaiku: ["thinking"],
      claudeOpus: ["effort", "fastMode", "contextWindow"],
      claudeSonnet: ["effort", "contextWindow"],
      codex: ["reasoningEffort", "serviceTier"],
      cursor: ["reasoning"],
      opencode: ["variant", "agent"],
    });
  });

  it("sizes the Cursor effort SELECT from the family's live suffixes", () => {
    const cursorLive = primaryOptionDescriptor(
      optionDescriptorsFor("cursor", "cursor-grok-4.6", {
        defaultReasoningLevel: "medium",
        supportedReasoningLevels: ["low", "medium", "high"],
      })
    );
    expect(
      cursorLive && cursorLive.type === "select"
        ? cursorLive.options.map((option) => option.id)
        : []
    ).toStrictEqual(["low", "medium", "high"]);
  });
});

describe("selections + labels", () => {
  it("sanitizes and upserts option selections", () => {
    expect(
      sanitizeOptionSelections([
        { id: "effort", value: "high" },
        { id: "nope!", value: "x" },
      ])
    ).toStrictEqual([{ id: "effort", value: "high" }]);
    expect(
      sanitizeOptionSelections([{ id: "", value: "high" }])
    ).toBeUndefined();
    const next = upsertOptionSelection(
      [{ id: "effort", value: "high" }],
      "effort",
      "max"
    );
    expect(next).toStrictEqual([{ id: "effort", value: "max" }]);
    expect(upsertOptionSelection(next, "effort", null)).toBeUndefined();
  });

  it("falls back to the descriptor default for labels and values", () => {
    const descriptor = primaryOptionDescriptor(
      optionDescriptorsFor("claudeAgent", "claude-opus-5")
    );
    expect(descriptor).toBeDefined();
    if (!descriptor) {
      return;
    }
    expect(getProviderOptionCurrentValue(descriptor)).toBe("high");
    expect(
      getProviderOptionCurrentLabel(descriptor, [
        { id: "effort", value: "xhigh" },
      ])
    ).toBe("Extra High");
    expect(
      getProviderOptionCurrentValue(descriptor, [
        { id: "effort", value: "nope" },
      ])
    ).toBe("high");
  });

  it("drops effort when the provider or model no longer advertises it", () => {
    const kept = retainValidOptions("claudeAgent", "claude-opus-5", [
      { id: "effort", value: "high" },
    ]);
    expect(kept).toStrictEqual([{ id: "effort", value: "high" }]);
    expect(
      retainValidOptions("codex", "gpt-5.6-sol", [
        { id: "effort", value: "high" },
      ])
    ).toBeUndefined();
    expect(
      retainValidOptions("claudeAgent", "claude-opus-4-5", [
        { id: "effort", value: "ultrathink" },
      ])
    ).toBeUndefined();
    expect(
      retainValidOptions("claudeAgent", "claude-opus-5", [
        { id: "effort", value: "high" },
        { id: "fastMode", value: true },
        { id: "contextWindow", value: "1m" },
      ])
    ).toStrictEqual([
      { id: "effort", value: "high" },
      { id: "fastMode", value: true },
      { id: "contextWindow", value: "1m" },
    ]);
    expect(
      retainValidOptions("codex", "gpt-5.6-sol", [
        { id: "reasoningEffort", value: "high" },
        { id: "serviceTier", value: "fast" },
      ])
    ).toStrictEqual([
      { id: "reasoningEffort", value: "high" },
      { id: "serviceTier", value: "fast" },
    ]);
  });
});

describe(planHeadlessEffort, () => {
  it("omits flags until the user persists a selection", () => {
    expect(
      planHeadlessEffort("codex", "hi", "gpt-5.6-sol").flags
    ).toStrictEqual([]);
    expect(
      planHeadlessEffort("claudeAgent", "hi", "claude-opus-5").flags
    ).toStrictEqual([]);
  });

  it("maps Claude profiles the way t3code effortMap does", () => {
    expect(
      planHeadlessEffort("claudeAgent", "hi", "claude-opus-4-7", [
        { id: "effort", value: "xhigh" },
      ]).flags
    ).toStrictEqual(["--effort", "max"]);
    expect(
      planHeadlessEffort("claudeAgent", "hi", "claude-sonnet-4-6", [
        { id: "effort", value: "max" },
      ]).flags
    ).toStrictEqual(["--effort", "high"]);
    expect(
      planHeadlessEffort("claudeAgent", "hi", "claude-haiku-4-5", [
        { id: "thinking", value: true },
      ]).flags
    ).toStrictEqual([
      "--settings",
      JSON.stringify({ alwaysThinkingEnabled: true }),
    ]);
  });

  it("prefixes Ultrathink and skips slash commands", () => {
    expect(applyClaudePromptEffortPrefix("fix the race", "ultrathink")).toBe(
      "Ultrathink:\nfix the race"
    );
    expect(applyClaudePromptEffortPrefix("/compact please", "ultrathink")).toBe(
      "/compact please"
    );
    expect(
      applyClaudePromptEffortPrefix("please ultrathink this", "ultrathink")
    ).toBe("please ultrathink this");
    expect(applyClaudePromptEffortPrefix("fix it", "high")).toBe("fix it");
  });

  it("maps non-effort descriptors to CLI flags", () => {
    expect({
      claudeFast: planHeadlessEffort("claudeAgent", "hi", "claude-opus-5", [
        { id: "fastMode", value: true },
      ]).flags,
      claudeUltraFast: planHeadlessEffort(
        "claudeAgent",
        "hi",
        "claude-opus-5",
        [
          { id: "effort", value: "ultracode" },
          { id: "fastMode", value: true },
        ]
      ).flags,
      codexLegacyFast: planHeadlessEffort("codex", "hi", "gpt-5.6-sol", [
        { id: "fastMode", value: true },
      ]).flags,
      codexTier: planHeadlessEffort("codex", "hi", "gpt-5.6-sol", [
        { id: "serviceTier", value: "fast" },
      ]).flags,
      opencodeAgent: planHeadlessEffort(
        "opencode",
        "hi",
        "anthropic/claude-sonnet-5",
        [{ id: "agent", value: "plan" }]
      ).flags,
    }).toStrictEqual({
      claudeFast: ["--settings", JSON.stringify({ fastMode: true })],
      claudeUltraFast: [
        "--effort",
        "xhigh",
        "--settings",
        JSON.stringify({ ultracode: true, fastMode: true }),
      ],
      codexLegacyFast: ["--config", "service_tier=fast"],
      codexTier: ["--config", "service_tier=fast"],
      opencodeAgent: ["--agent", "plan"],
    });
  });

  it("appends Claude [1m] only when contextWindow is selected", () => {
    expect({
      alreadySuffixed: resolveClaudeCliModel("claude-opus-5[1m]", [
        { id: "contextWindow", value: "1m" },
      ]),
      defaultModel: resolveClaudeCliModel("claude-opus-5"),
      oneMillion: resolveClaudeCliModel("claude-opus-5", [
        { id: "contextWindow", value: "1m" },
      ]),
      serviceTierFooter: optionFooterFor("codex", "serviceTier").includes(
        "service_tier"
      ),
    }).toStrictEqual({
      alreadySuffixed: "claude-opus-5[1m]",
      defaultModel: "claude-opus-5",
      oneMillion: "claude-opus-5[1m]",
      serviceTierFooter: true,
    });
  });

  it("marks Cursor and Grok as persisted-only", () => {
    expect(
      planHeadlessEffort("cursor", "hi", "auto", [
        { id: "reasoning", value: "high" },
      ])
    ).toMatchObject({
      flags: [],
      persistedOnly: true,
    });
    expect(
      planHeadlessEffort("grok", "hi", "grok-4.6", [
        { id: "reasoningEffort", value: "high" },
      ]).persistedOnly
    ).toBeTruthy();
  });
});
