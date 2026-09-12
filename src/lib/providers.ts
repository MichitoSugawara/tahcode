import {
  PROVIDER_CATALOG,
  catalogFor,
  formatAgentMention,
  modelDisplayName,
  resolveModelSlug,
  type ProviderDriverKind,
  type ProviderModel,
} from "@shared/providers.ts";

export type { ProviderDriverKind, ProviderModel };
export { formatAgentMention, modelDisplayName, resolveModelSlug };

export const PROVIDER_KINDS = PROVIDER_CATALOG.map((entry) => entry.kind);

/** t3code-derived provider metadata with UI-only extras (monogram color). */
export const PROVIDERS: Record<
  ProviderDriverKind,
  { label: string; handle: string; color: string; binary: string; summary: string }
> = {
  codex: { label: "Codex", handle: "codex", color: "#10a37f", binary: "codex", summary: "codex exec --json" },
  claudeAgent: { label: "Claude", handle: "claude", color: "#d97757", binary: "claude", summary: "claude -p --output-format stream-json" },
  cursor: { label: "Cursor", handle: "cursor", color: "#4f6bed", binary: "agent", summary: "agent -p --output-format stream-json" },
  grok: { label: "Grok", handle: "grok", color: "#8b8b8b", binary: "grok", summary: "grok --prompt" },
  opencode: { label: "OpenCode", handle: "opencode", color: "#c084fc", binary: "opencode", summary: "opencode run" },
  antigravity: { label: "Antigravity", handle: "antigravity", color: "#f59e0b", binary: "agy", summary: "native installer + Google sign-in" },
};

export function providerLabel(kind?: string | null): string {
  return kind && kind in PROVIDERS ? PROVIDERS[kind as ProviderDriverKind].label : "Agent";
}

export function providerColor(kind?: string | null): string {
  return kind && kind in PROVIDERS ? PROVIDERS[kind as ProviderDriverKind].color : "#0e9c2d";
}

export function providerHandle(kind?: string | null): string {
  return kind && kind in PROVIDERS ? PROVIDERS[kind as ProviderDriverKind].handle : "agent";
}

export function isProviderKind(value: string): value is ProviderDriverKind {
  return value in PROVIDERS;
}

/** Models a provider is known to accept (current ones first, legacy after). */
export function modelsFor(kind: ProviderDriverKind): readonly ProviderModel[] {
  const models = catalogFor(kind).models;
  return [...models.filter((model) => !model.legacy), ...models.filter((model) => model.legacy)];
}

/** Whether the provider's CLI takes a model flag at all (Antigravity has no CLI). */
export function supportsModelPick(kind: ProviderDriverKind): boolean {
  return catalogFor(kind).modelFlag !== null;
}

export function modelSourceHint(kind: ProviderDriverKind): string {
  return catalogFor(kind).modelSource;
}

/** `Cursor · muse-spark-1.3` / `Cursor · 既定モデル` — the short agent label used in pills and headers. */
export function agentLabel(kind?: string | null, model?: string | null): string {
  const label = providerLabel(kind);
  return model ? `${label} · ${model}` : label;
}

/** The mention the composer prepends when a project message names no agent. */
export function agentMention(kind: ProviderDriverKind, model?: string | null): string {
  return formatAgentMention(kind, model ?? undefined);
}
