/**
 * Provider kinds and metadata, ported from t3code's BUILT_IN_DRIVERS.
 * Source of truth: pingdotgg/t3code `apps/server/src/provider/builtInDrivers.ts`
 *
 *   CodexDriver, ClaudeDriver, CursorDriver, GrokDriver, OpenCodeDriver, AntigravityDriver
 *
 * Model catalogs follow the same sources t3code and Multica use:
 * t3code `apps/server/src/provider/model-manifest.json` (Codex / Claude /
 * Antigravity), Multica `server/pkg/agent/models.go` static catalogs (Codex /
 * Claude / Grok / Cursor fallback) and the Cursor model docs for the Cursor
 * CLI ids. Cursor, Grok and OpenCode discover models from the signed-in CLI in
 * both upstreams, so their lists here are a curated snapshot: any slug the
 * CLI accepts can still be typed as `@provider/<slug>`.
 */
export const PROVIDER_DRIVER_KINDS = [
  "codex",
  "claudeAgent",
  "cursor",
  "grok",
  "opencode",
  "antigravity",
] as const;

export type ProviderDriverKind = (typeof PROVIDER_DRIVER_KINDS)[number];

export type ProviderModel = {
  /** Exact value handed to the CLI's model flag, and the `@provider/<slug>` mention suffix. */
  slug: string;
  name: string;
  /** Older models the CLI still accepts; hidden behind the current ones in pickers. */
  legacy?: boolean;
  /** Short spellings that resolve to this slug (Claude CLI aliases such as `opus`). */
  aliases?: readonly string[];
};

export type ProviderCatalogEntry = {
  kind: ProviderDriverKind;
  displayName: string;
  binaryNames: readonly string[];
  mentionHandles: readonly string[];
  headlessSummary: string;
  /**
   * Models the provider is known to accept. A mention or chat that names only
   * the provider runs with the CLI's own default model (no model flag), the
   * same behavior `@provider` had before models could be named.
   */
  models: readonly ProviderModel[];
  /** CLI flag that selects a model for a headless run; null when the CLI has none. */
  modelFlag: string | null;
  /** Where the list comes from, shown as a hint in pickers. */
  modelSource: string;
};

export const PROVIDER_CATALOG: readonly ProviderCatalogEntry[] = [
  {
    kind: "codex",
    displayName: "Codex",
    binaryNames: ["codex"],
    mentionHandles: ["codex"],
    headlessSummary: "codex exec --json (t3code CodexDriver / app-server)",
    modelFlag: "--model",
    modelSource: "t3code model-manifest (codex) + Multica codexStaticModels",
    models: [
      { slug: "gpt-6-astra", name: "GPT-6 Astra" },
      { slug: "gpt-5.6-sol", name: "GPT-5.6 Sol" },
      { slug: "gpt-5.6-terra", name: "GPT-5.6 Terra" },
      { slug: "gpt-5.6-luna", name: "GPT-5.6 Luna" },
      { slug: "gpt-5.5", name: "GPT-5.5", legacy: true },
      { slug: "gpt-5.4", name: "GPT-5.4", legacy: true },
      { slug: "gpt-5.3-codex", name: "GPT-5.3 Codex", legacy: true },
    ],
  },
  {
    kind: "claudeAgent",
    displayName: "Claude",
    binaryNames: ["claude"],
    mentionHandles: ["claude", "claudeagent"],
    headlessSummary: "claude -p --output-format stream-json (t3code ClaudeDriver / Agent SDK)",
    modelFlag: "--model",
    modelSource: "t3code model-manifest (claudeAgent)",
    models: [
      { slug: "claude-fable-5-1", name: "Claude Fable 5.1", aliases: ["fable", "fable-5.1", "claude-fable-5.1"] },
      { slug: "claude-opus-5", name: "Claude Opus 5", aliases: ["opus", "opus-5"] },
      { slug: "claude-sonnet-5", name: "Claude Sonnet 5", aliases: ["sonnet", "sonnet-5"] },
      { slug: "claude-opus-4-8", name: "Claude Opus 4.8", legacy: true, aliases: ["opus-4.8"] },
      { slug: "claude-opus-4-7", name: "Claude Opus 4.7", legacy: true, aliases: ["opus-4.7"] },
      { slug: "claude-sonnet-4-6", name: "Claude Sonnet 4.6", legacy: true, aliases: ["sonnet-4.6"] },
      { slug: "claude-haiku-4-5", name: "Claude Haiku 4.5", legacy: true, aliases: ["haiku", "haiku-4.5"] },
    ],
  },
  {
    kind: "cursor",
    displayName: "Cursor",
    binaryNames: ["agent", "cursor-agent"],
    mentionHandles: ["cursor", "agent"],
    headlessSummary: "agent -p --output-format stream-json (t3code CursorDriver / ACP)",
    modelFlag: "--model",
    modelSource: "Cursor model docs · agent models lists the account's full catalog",
    models: [
      { slug: "auto", name: "Auto（Cursor が選択）" },
      { slug: "composer-2.5", name: "Composer 2.5" },
      { slug: "composer-2.5-fast", name: "Composer 2.5 Fast" },
      { slug: "cursor-grok-4.6", name: "Grok 4.6 (Cursor)" },
      { slug: "muse-spark-1.3", name: "Muse Spark 1.3" },
      { slug: "claude-fable-5-1", name: "Claude Fable 5.1" },
      { slug: "claude-opus-5", name: "Claude Opus 5" },
      { slug: "claude-sonnet-5", name: "Claude Sonnet 5" },
      { slug: "gpt-5.6-sol", name: "GPT-5.6 Sol" },
      { slug: "gpt-5.6-terra", name: "GPT-5.6 Terra" },
      { slug: "gemini-3.8-flash", name: "Gemini 3.8 Flash" },
      { slug: "gemini-3.1-pro", name: "Gemini 3.1 Pro" },
      { slug: "kimi-k3", name: "Kimi K3" },
    ],
  },
  {
    kind: "grok",
    displayName: "Grok",
    binaryNames: ["grok"],
    mentionHandles: ["grok"],
    headlessSummary: "grok --prompt (t3code GrokDriver)",
    modelFlag: "--model",
    modelSource: "Multica grokStaticModels · grok models lists the signed-in catalog",
    models: [
      { slug: "grok-4.6", name: "Grok 4.6" },
      { slug: "grok-4.5", name: "Grok 4.5" },
      { slug: "grok-composer-2.5-fast", name: "Grok Composer 2.5 Fast" },
    ],
  },
  {
    kind: "opencode",
    displayName: "OpenCode",
    binaryNames: ["opencode"],
    mentionHandles: ["opencode"],
    headlessSummary: "opencode run (t3code OpenCodeDriver)",
    modelFlag: "--model",
    modelSource: "opencode resolves provider/model only · opencode models lists the configured ones",
    models: [
      { slug: "anthropic/claude-fable-5-1", name: "Claude Fable 5.1 (Anthropic)" },
      { slug: "anthropic/claude-opus-5", name: "Claude Opus 5 (Anthropic)" },
      { slug: "anthropic/claude-sonnet-5", name: "Claude Sonnet 5 (Anthropic)" },
      { slug: "openai/gpt-6-astra", name: "GPT-6 Astra (OpenAI)" },
      { slug: "openai/gpt-5.6-sol", name: "GPT-5.6 Sol (OpenAI)" },
      { slug: "google/gemini-3.8-flash", name: "Gemini 3.8 Flash (Google)" },
    ],
  },
  {
    kind: "antigravity",
    displayName: "Antigravity",
    binaryNames: ["antigravity", "agy"],
    mentionHandles: ["antigravity", "agy"],
    headlessSummary: "native installer / Sign in with Google (t3code AntigravityDriver)",
    modelFlag: null,
    modelSource: "t3code model-manifest (antigravity)",
    models: [
      { slug: "gemini-3.8-flash-high", name: "Gemini 3.8 Flash (High)" },
      { slug: "gemini-3.8-flash-medium", name: "Gemini 3.8 Flash (Medium)" },
      { slug: "gemini-3.8-flash-low", name: "Gemini 3.8 Flash (Low)" },
    ],
  },
] as const;

export const MENTION_TO_PROVIDER: Record<string, ProviderDriverKind> = Object.fromEntries(
  PROVIDER_CATALOG.flatMap((entry) =>
    entry.mentionHandles.map((handle) => [handle, entry.kind] as const),
  ),
) as Record<string, ProviderDriverKind>;

export function isProviderDriverKind(value: string): value is ProviderDriverKind {
  return (PROVIDER_DRIVER_KINDS as readonly string[]).includes(value);
}

export function catalogFor(kind: ProviderDriverKind): ProviderCatalogEntry {
  const entry = PROVIDER_CATALOG.find((item) => item.kind === kind);
  if (!entry) {
    throw new Error(`Unknown provider kind: ${kind}`);
  }
  return entry;
}

/** The primary `@handle` for a provider (first mention handle in the catalog). */
export function mentionHandleFor(kind: ProviderDriverKind): string {
  return catalogFor(kind).mentionHandles[0] ?? kind;
}

/**
 * Model slugs travel inside mentions (`@cursor/muse-spark-1.3`) and straight
 * into a CLI flag, so they are limited to the mention character set. OpenCode
 * slugs are provider-qualified (`anthropic/claude-sonnet-5`), hence `/`.
 */
export const MODEL_SLUG_MAX_LENGTH = 80;
const MODEL_SLUG_RE = /^[a-zA-Z0-9][a-zA-Z0-9_.\-/]*$/;

export function isValidModelSlug(value: string): boolean {
  return (
    value.length > 0 &&
    value.length <= MODEL_SLUG_MAX_LENGTH &&
    MODEL_SLUG_RE.test(value) &&
    !value.endsWith("/") &&
    !value.endsWith(".")
  );
}

/**
 * Normalize a requested model for a provider: trims, resolves catalog aliases
 * (`@claude/opus` → `claude-opus-5`), and returns `undefined` for an empty
 * request so callers fall back to the CLI default. Unknown slugs pass through
 * untouched — the CLI's own catalog is the authority, not this snapshot.
 */
export function resolveModelSlug(kind: ProviderDriverKind, requested: string | undefined | null): string | undefined {
  const trimmed = requested?.trim();
  if (!trimmed) return undefined;
  const lower = trimmed.toLowerCase();
  for (const model of catalogFor(kind).models) {
    if (model.slug.toLowerCase() === lower) return model.slug;
    if (model.aliases?.some((alias) => alias.toLowerCase() === lower)) return model.slug;
  }
  return trimmed;
}

/** Display name for a model slug, falling back to the slug itself. */
export function modelDisplayName(kind: ProviderDriverKind, slug: string | undefined | null): string | undefined {
  if (!slug) return undefined;
  return catalogFor(kind).models.find((model) => model.slug === slug)?.name ?? slug;
}

/** `@cursor/muse-spark-1.3`, or `@cursor` when no model is set. */
export function formatAgentMention(kind: ProviderDriverKind, model?: string | null): string {
  const handle = mentionHandleFor(kind);
  return model ? `@${handle}/${model}` : `@${handle}`;
}
