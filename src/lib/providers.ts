import { PROVIDER_CATALOG, type ProviderDriverKind } from "@shared/providers.ts";

export type { ProviderDriverKind };

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
