/**
 * Per-provider reasoning / effort options, modeled on t3code's
 * `ProviderOptionDescriptor` + `ModelCapabilities.optionDescriptors`.
 *
 * t3code sources:
 *   packages/contracts/src/model.ts
 *   packages/shared/src/model.ts
 *   TraitsPicker.tsx (composer: primary select = effort)
 *   Codex / Claude / Cursor / OpenCode / Grok provider layers
 *
 * tahcode has no ACP/SDK provider layers — the same descriptors persist
 * with the chat's agent binding and become headless CLI flags in
 * `runtime/src/providers.ts` (`--config model_reasoning_effort`,
 * `claude --effort`, `opencode run --variant`). Cursor/Grok selections
 * persist for t3code parity but have no headless flag (ACP-only upstream).
 */

import type { ProviderDriverKind } from "./providers.ts";

export type ProviderOptionChoice = {
  id: string;
  label: string;
  description?: string;
  isDefault?: boolean;
};

export type ProviderSelectDescriptor = {
  id: string;
  label: string;
  description?: string;
  type: "select";
  options: readonly ProviderOptionChoice[];
  currentValue?: string;
  /** Values handled via prompt text, not a CLI effort flag (Claude `ultrathink`). */
  promptInjectedValues?: readonly string[];
};

export type ProviderBooleanDescriptor = {
  id: string;
  label: string;
  description?: string;
  type: "boolean";
  currentValue?: boolean;
};

export type ProviderOptionDescriptor =
  | ProviderSelectDescriptor
  | ProviderBooleanDescriptor;

/** Canonical wire shape — same as t3code `ProviderOptionSelection`. */
export type ProviderOptionSelection = {
  id: string;
  value: string | boolean;
};

const OPTION_ID_MAX = 40;
const OPTION_VALUE_MAX = 32;
const OPTION_ID_RE = /^[a-zA-Z][a-zA-Z0-9_-]{0,39}$/;

export function isValidOptionId(value: string): boolean {
  return OPTION_ID_RE.test(value) && value.length <= OPTION_ID_MAX;
}

export function isValidOptionValue(value: string | boolean): boolean {
  if (typeof value === "boolean") {
    return true;
  }
  return (
    value.length > 0 &&
    value.length <= OPTION_VALUE_MAX &&
    /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(value)
  );
}

export function sanitizeOptionSelections(
  raw: readonly ProviderOptionSelection[] | null | undefined
): ProviderOptionSelection[] | undefined {
  if (!raw || raw.length === 0) {
    return undefined;
  }
  const seen = new Set<string>();
  const out: ProviderOptionSelection[] = [];
  for (const item of raw) {
    if (
      !item ||
      !isValidOptionId(item.id) ||
      !isValidOptionValue(item.value) ||
      seen.has(item.id)
    ) {
      continue;
    }
    seen.add(item.id);
    out.push({ id: item.id, value: item.value });
  }
  return out.length > 0 ? out : undefined;
}

/* ── t3code labels ───────────────────────────────────────── */

/** Codex `reasoningEffort` display labels (CodexProvider.ts). */
export const CODEX_EFFORT_LABELS: Record<string, string> = {
  none: "None",
  minimal: "Minimal",
  low: "Low",
  medium: "Medium",
  high: "High",
  xhigh: "Extra High",
  max: "Max",
  ultra: "Ultra",
};

const CODEX_EFFORT_IDS = [
  "none",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
  "ultra",
] as const;

const STANDARD_EFFORT_IDS = ["low", "medium", "high", "xhigh"] as const;

function labeledChoices(
  ids: readonly string[],
  labels: Record<string, string>,
  defaultId: string
): ProviderOptionChoice[] {
  return ids.map((id) => ({
    id,
    label: labels[id] ?? titleCaseSlug(id),
    isDefault: id === defaultId,
  }));
}

function titleCaseSlug(value: string): string {
  return value
    .split(/[-_]/)
    .map((part) =>
      part.length === 0 ? part : part[0]!.toUpperCase() + part.slice(1)
    )
    .join(" ");
}

function selectDescriptor(
  id: string,
  label: string,
  options: readonly ProviderOptionChoice[],
  extras?: { description?: string; promptInjectedValues?: readonly string[] }
): ProviderSelectDescriptor {
  const current =
    options.find((option) => option.isDefault)?.id ?? options[0]?.id;
  const descriptor: ProviderSelectDescriptor = {
    id,
    label,
    type: "select",
    options,
  };
  if (current) {
    descriptor.currentValue = current;
  }
  if (extras?.description !== undefined) {
    descriptor.description = extras.description;
  }
  if (extras?.promptInjectedValues !== undefined) {
    descriptor.promptInjectedValues = extras.promptInjectedValues;
  }
  return descriptor;
}

/* ── Claude profiles (t3code model-manifest) ─────────────── */

const CLAUDE_EFFORT_LABELS: Record<string, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  xhigh: "Extra High",
  max: "Max",
  ultracode: "Ultracode",
  ultrathink: "Ultrathink",
};

type ClaudeProfile = {
  defaultEffort: string;
  effortIds: readonly string[];
  /** UI value → CLI `--effort` (null = prompt-only). */
  effortMap: Record<string, string | null>;
  thinkingOnly?: boolean;
};

const CLAUDE_FULL = [
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
  "ultracode",
  "ultrathink",
] as const;
const CLAUDE_NO_ULTRACODE = [
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
  "ultrathink",
] as const;
const CLAUDE_OPUS_45 = ["low", "medium", "high", "max"] as const;

function claudeProfile(model: string | undefined | null): ClaudeProfile {
  const slug = (model ?? "").toLowerCase();
  if (/haiku/.test(slug)) {
    return {
      defaultEffort: "high",
      effortIds: [],
      effortMap: {},
      thinkingOnly: true,
    };
  }
  if (/fable/.test(slug)) {
    return {
      defaultEffort: "medium",
      effortIds: CLAUDE_FULL,
      effortMap: { ultracode: "xhigh", ultrathink: null },
    };
  }
  if (/opus-4-7/.test(slug)) {
    return {
      defaultEffort: "xhigh",
      effortIds: CLAUDE_NO_ULTRACODE,
      effortMap: { xhigh: "max", ultrathink: null },
    };
  }
  if (/opus-4-5/.test(slug)) {
    return { defaultEffort: "high", effortIds: CLAUDE_OPUS_45, effortMap: {} };
  }
  if (/sonnet-4-6/.test(slug)) {
    return {
      defaultEffort: "high",
      effortIds: CLAUDE_NO_ULTRACODE,
      effortMap: { max: "high", ultrathink: null },
    };
  }
  if (/sonnet/.test(slug)) {
    return {
      defaultEffort: "high",
      effortIds: CLAUDE_NO_ULTRACODE,
      effortMap: { ultrathink: null },
    };
  }
  // opus-5 / opus-4-8 / opus-4-6 / unknown Claude
  return {
    defaultEffort: "high",
    effortIds: CLAUDE_FULL,
    effortMap: { ultracode: "xhigh", ultrathink: null },
  };
}

/* ── live Codex reasoning (optional overlay) ─────────────── */

export type ReasoningHint = {
  defaultReasoningLevel?: string;
  supportedReasoningLevels?: readonly string[];
};

function codexDefaultEffort(
  model: string | undefined | null,
  hint?: ReasoningHint
): string {
  // t3code: gpt-6-astra family always defaults to medium
  if ((model ?? "").toLowerCase().includes("gpt-6-astra")) {
    return "medium";
  }
  const fromHint = hint?.defaultReasoningLevel?.trim();
  if (fromHint && isValidOptionValue(fromHint)) {
    return fromHint;
  }
  return "medium";
}

function codexEffortIds(hint?: ReasoningHint): readonly string[] {
  const live = hint?.supportedReasoningLevels?.filter((id) =>
    isValidOptionValue(id)
  );
  if (live && live.length > 0) {
    return live;
  }
  return CODEX_EFFORT_IDS;
}

function opencodeDefaultVariant(model: string | undefined | null): string {
  const slug = (model ?? "").toLowerCase();
  if (slug.startsWith("anthropic/") || slug.startsWith("google/")) {
    return "high";
  }
  if (slug.startsWith("openai/") || slug.startsWith("opencode/")) {
    return "medium";
  }
  return "medium";
}

/**
 * Descriptors for the active provider + model. Empty = hide the control
 * (Antigravity bakes effort into the model slug).
 */
export function optionDescriptorsFor(
  kind: ProviderDriverKind,
  model?: string | null,
  hint?: ReasoningHint
): ProviderOptionDescriptor[] {
  switch (kind) {
    case "codex": {
      const defaultId = codexDefaultEffort(model, hint);
      const ids = codexEffortIds(hint);
      const resolvedDefault = ids.includes(defaultId)
        ? defaultId
        : (ids[0] ?? "medium");
      return [
        selectDescriptor(
          "reasoningEffort",
          "Reasoning",
          labeledChoices(ids, CODEX_EFFORT_LABELS, resolvedDefault)
        ),
      ];
    }
    case "claudeAgent": {
      const profile = claudeProfile(model);
      if (profile.thinkingOnly) {
        return [
          {
            id: "thinking",
            label: "Thinking",
            type: "boolean",
            currentValue: false,
          },
        ];
      }
      return [
        selectDescriptor(
          "effort",
          "Reasoning",
          labeledChoices(
            profile.effortIds,
            CLAUDE_EFFORT_LABELS,
            profile.defaultEffort
          ),
          { promptInjectedValues: ["ultrathink"] }
        ),
      ];
    }
    case "cursor":
      return [
        selectDescriptor(
          "reasoning",
          "Reasoning",
          labeledChoices(
            ["low", "medium", "high", "xhigh", "max"],
            CODEX_EFFORT_LABELS,
            "medium"
          )
        ),
      ];
    case "opencode":
      return [
        selectDescriptor(
          "variant",
          "Reasoning",
          labeledChoices(
            STANDARD_EFFORT_IDS,
            CODEX_EFFORT_LABELS,
            opencodeDefaultVariant(model)
          )
        ),
      ];
    case "grok":
      return [
        selectDescriptor(
          "reasoningEffort",
          "Reasoning",
          labeledChoices(STANDARD_EFFORT_IDS, CODEX_EFFORT_LABELS, "high")
        ),
      ];
    case "antigravity":
      return [];
  }
}

/** The composer's primary control: first select, else a boolean (Haiku thinking). */
export function primaryOptionDescriptor(
  descriptors: readonly ProviderOptionDescriptor[]
): ProviderOptionDescriptor | undefined {
  return (
    descriptors.find((item) => item.type === "select") ??
    descriptors.find((item) => item.type === "boolean")
  );
}

export function getProviderOptionCurrentValue(
  descriptor: ProviderOptionDescriptor,
  selections?: readonly ProviderOptionSelection[] | null
): string | boolean | undefined {
  const picked = selections?.find((item) => item.id === descriptor.id);
  if (descriptor.type === "boolean") {
    if (typeof picked?.value === "boolean") {
      return picked.value;
    }
    return descriptor.currentValue ?? false;
  }
  if (
    typeof picked?.value === "string" &&
    descriptor.options.some((option) => option.id === picked.value)
  ) {
    return picked.value;
  }
  return (
    descriptor.currentValue ??
    descriptor.options.find((option) => option.isDefault)?.id ??
    descriptor.options[0]?.id
  );
}

export function getProviderOptionCurrentLabel(
  descriptor: ProviderOptionDescriptor,
  selections?: readonly ProviderOptionSelection[] | null
): string {
  const value = getProviderOptionCurrentValue(descriptor, selections);
  if (descriptor.type === "boolean") {
    return value ? "On" : "Off";
  }
  const match = descriptor.options.find((option) => option.id === value);
  return match?.label ?? (typeof value === "string" ? value : descriptor.label);
}

export function supportsEffortPick(
  kind: ProviderDriverKind,
  model?: string | null
): boolean {
  return optionDescriptorsFor(kind, model).length > 0;
}

/**
 * Merge a user pick into the stored selection list. Passing `null`/`""`
 * drops that id (back to the catalog / CLI default).
 */
/** Drop selections that the new provider/model no longer advertises. */
export function retainValidOptions(
  kind: ProviderDriverKind,
  model: string | null | undefined,
  selections: readonly ProviderOptionSelection[] | null | undefined,
  hint?: ReasoningHint
): ProviderOptionSelection[] | undefined {
  const descriptors = optionDescriptorsFor(kind, model, hint);
  if (!selections || selections.length === 0 || descriptors.length === 0) {
    return undefined;
  }
  const kept: ProviderOptionSelection[] = [];
  for (const selection of selections) {
    const descriptor = descriptors.find((item) => item.id === selection.id);
    if (!descriptor) {
      continue;
    }
    if (descriptor.type === "boolean" && typeof selection.value === "boolean") {
      kept.push(selection);
      continue;
    }
    if (
      descriptor.type === "select" &&
      typeof selection.value === "string" &&
      descriptor.options.some((option) => option.id === selection.value)
    ) {
      kept.push(selection);
    }
  }
  return sanitizeOptionSelections(kept);
}

export function upsertOptionSelection(
  current: readonly ProviderOptionSelection[] | null | undefined,
  id: string,
  value: string | boolean | null
): ProviderOptionSelection[] | undefined {
  const rest = (current ?? []).filter((item) => item.id !== id);
  if (value === null || value === "") {
    return sanitizeOptionSelections(rest);
  }
  return sanitizeOptionSelections([...rest, { id, value }]);
}

export function optionSelectionValue(
  selections: readonly ProviderOptionSelection[] | null | undefined,
  id: string
): string | boolean | undefined {
  return selections?.find((item) => item.id === id)?.value;
}

/* ── prompt injection (Claude ultrathink) ────────────────── */

const SLASH_COMMAND_RE = /^\/[a-zA-Z][a-zA-Z0-9_-]*/;

export function isClaudeUltrathinkPrompt(text: string): boolean {
  return /\bultrathink\b/i.test(text);
}

function isSlashCommandPrompt(text: string): boolean {
  const first = text.trimStart().split(/\s/, 1)[0] ?? "";
  return SLASH_COMMAND_RE.test(first) && !first.slice(1).includes("/");
}

/** Prefix `Ultrathink:\n` when effort is ultrathink (t3code `applyClaudePromptEffortPrefix`). */
export function applyClaudePromptEffortPrefix(
  text: string,
  effort: string | undefined
): string {
  if (effort !== "ultrathink") {
    return text;
  }
  if (isSlashCommandPrompt(text) || isClaudeUltrathinkPrompt(text)) {
    return text;
  }
  return `Ultrathink:\n${text}`;
}

export function resolvePromptInjectedEffort(
  descriptors: readonly ProviderOptionDescriptor[],
  rawEffort: string | undefined
): string | undefined {
  if (!rawEffort) {
    return undefined;
  }
  for (const descriptor of descriptors) {
    if (
      descriptor.type === "select" &&
      descriptor.promptInjectedValues?.includes(rawEffort)
    ) {
      return rawEffort;
    }
  }
  return undefined;
}

/* ── CLI mapping ─────────────────────────────────────────── */

export type HeadlessEffortPlan = {
  /** Extra argv inserted before the prompt (flags only). */
  flags: string[];
  /** Prompt after any injection (Claude ultrathink). */
  prompt: string;
  /** True when a descriptor exists but headless CLI cannot apply it (Cursor / Grok). */
  persistedOnly: boolean;
};

function claudeCliEffort(
  model: string | undefined,
  uiValue: string
): string | null | undefined {
  const mapped = claudeProfile(model).effortMap;
  if (uiValue in mapped) {
    return mapped[uiValue];
  }
  return uiValue;
}

/**
 * Turn persisted selections into headless argv + prompt, matching t3code's
 * dispatch as closely as each CLI allows.
 */
export function planHeadlessEffort(
  kind: ProviderDriverKind,
  prompt: string,
  model: string | undefined,
  selections: readonly ProviderOptionSelection[] | null | undefined
): HeadlessEffortPlan {
  const descriptors = optionDescriptorsFor(kind, model);
  const primary = primaryOptionDescriptor(descriptors);
  if (!primary) {
    return { flags: [], prompt, persistedOnly: false };
  }

  const explicit = optionSelectionValue(selections, primary.id);

  if (kind === "codex") {
    if (typeof explicit !== "string") {
      return { flags: [], prompt, persistedOnly: false };
    }
    return {
      flags: ["--config", `model_reasoning_effort=${explicit}`],
      prompt,
      persistedOnly: false,
    };
  }

  if (kind === "claudeAgent") {
    if (primary.id === "thinking") {
      if (typeof explicit !== "boolean") {
        return { flags: [], prompt, persistedOnly: false };
      }
      const settings = JSON.stringify({ alwaysThinkingEnabled: explicit });
      return { flags: ["--settings", settings], prompt, persistedOnly: false };
    }
    if (typeof explicit !== "string") {
      return { flags: [], prompt, persistedOnly: false };
    }
    const injected = resolvePromptInjectedEffort(descriptors, explicit);
    if (injected === "ultrathink") {
      return {
        flags: [],
        prompt: applyClaudePromptEffortPrefix(prompt, "ultrathink"),
        persistedOnly: false,
      };
    }
    const cli = claudeCliEffort(model, explicit);
    if (cli === null || cli === undefined) {
      return { flags: [], prompt, persistedOnly: false };
    }
    if (explicit === "ultracode") {
      return {
        flags: [
          "--effort",
          cli,
          "--settings",
          JSON.stringify({ ultracode: true }),
        ],
        prompt,
        persistedOnly: false,
      };
    }
    return { flags: ["--effort", cli], prompt, persistedOnly: false };
  }

  if (kind === "opencode") {
    if (typeof explicit !== "string") {
      return { flags: [], prompt, persistedOnly: false };
    }
    return { flags: ["--variant", explicit], prompt, persistedOnly: false };
  }

  // Cursor / Grok: t3code applies these over ACP. `agent -p` / `grok --prompt`
  // have no documented effort flag, so the pick is stored on the chat only.
  return { flags: [], prompt, persistedOnly: explicit !== undefined };
}

export function effortFooterFor(kind: ProviderDriverKind): string {
  switch (kind) {
    case "codex":
      return "codex exec --config model_reasoning_effort=…（t3code Codex reasoningEffort）";
    case "claudeAgent":
      return "claude -p --effort … · Ultrathink はプロンプト先頭に注入（t3code と同じ）";
    case "cursor":
      return "選択はチャットに保存。agent -p には effort フラグがなく、t3code は ACP setConfigOption で渡す";
    case "opencode":
      return "opencode run --variant …（t3code OpenCode variant）";
    case "grok":
      return "選択はチャットに保存。grok --prompt の effort フラグは未確定（t3code は ACP）";
    case "antigravity":
      return "Antigravity はモデル slug に High / Medium / Low が含まれる";
  }
}
