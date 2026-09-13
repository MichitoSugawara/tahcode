import {
  PROVIDER_MAINTENANCE,
  STALE_RUNNING_MS,
  canRequestMaintenance,
  installMethodLabel,
  mergeModelCatalog,
  modelsCommandLabel,
  supportsLiveModels,
  type CatalogModel,
  type InstallMethod,
  type LiveModel,
  type MaintenanceKind,
  type MaintenanceStatus,
  type ModelSource,
} from "@shared/providerMaintenance.ts";
import {
  PROVIDER_CATALOG,
  catalogFor,
  formatAgentMention,
  modelDisplayName,
  resolveModelSlug,
} from "@shared/providers.ts";
import type { ProviderDriverKind, ProviderModel } from "@shared/providers.ts";

export type { CatalogModel, InstallMethod, LiveModel, MaintenanceKind, MaintenanceStatus, ModelSource, ProviderDriverKind, ProviderModel };
export { PROVIDER_MAINTENANCE, STALE_RUNNING_MS, canRequestMaintenance, formatAgentMention, installMethodLabel, mergeModelCatalog, modelDisplayName, modelsCommandLabel, resolveModelSlug, supportsLiveModels };

export const PROVIDER_KINDS = PROVIDER_CATALOG.map((entry) => entry.kind);

/** t3code-derived provider metadata with UI-only extras (monogram color). */
export const PROVIDERS: Record<
  ProviderDriverKind,
  {
    label: string;
    handle: string;
    color: string;
    binary: string;
    summary: string;
  }
> = {
  antigravity: {
    binary: "agy",
    color: "#f59e0b",
    handle: "antigravity",
    label: "Antigravity",
    summary: "native installer + Google sign-in",
  },
  claudeAgent: {
    binary: "claude",
    color: "#d97757",
    handle: "claude",
    label: "Claude",
    summary: "claude -p --output-format stream-json",
  },
  codex: {
    binary: "codex",
    color: "#10a37f",
    handle: "codex",
    label: "Codex",
    summary: "codex exec --json",
  },
  cursor: {
    binary: "agent",
    color: "#4f6bed",
    handle: "cursor",
    label: "Cursor",
    summary: "agent -p --output-format stream-json",
  },
  grok: {
    binary: "grok",
    color: "#8b8b8b",
    handle: "grok",
    label: "Grok",
    summary: "grok --prompt",
  },
  opencode: {
    binary: "opencode",
    color: "#c084fc",
    handle: "opencode",
    label: "OpenCode",
    summary: "opencode run",
  },
};

export function providerLabel(kind?: string | null): string {
  return kind && kind in PROVIDERS
    ? PROVIDERS[kind as ProviderDriverKind].label
    : "Agent";
}

export function providerColor(kind?: string | null): string {
  return kind && kind in PROVIDERS
    ? PROVIDERS[kind as ProviderDriverKind].color
    : "#0e9c2d";
}

export function providerHandle(kind?: string | null): string {
  return kind && kind in PROVIDERS
    ? PROVIDERS[kind as ProviderDriverKind].handle
    : "agent";
}

export function isProviderKind(value: string): value is ProviderDriverKind {
  return value in PROVIDERS;
}

/** Models a provider is known to accept (current ones first, legacy after). */
export function modelsFor(kind: ProviderDriverKind): readonly ProviderModel[] {
  const { models } = catalogFor(kind);
  return [
    ...models.filter((model) => !model.legacy),
    ...models.filter((model) => model.legacy),
  ];
}

/** Whether the provider's CLI takes a model flag at all (Antigravity has no CLI). */
export function supportsModelPick(kind: ProviderDriverKind): boolean {
  return catalogFor(kind).modelFlag !== null;
}

export function modelSourceHint(kind: ProviderDriverKind): string {
  return catalogFor(kind).modelSource;
}

/** The slice of a runtime the model catalog needs — structural so `OrgContext` can stay the owner of `Runtime`. */
export type RuntimeModelSource = {
  name: string;
  status: "online" | "offline";
  lastSeenAt?: number;
  canUse: boolean;
  providers: { driverKind: ProviderDriverKind; available: boolean; models?: LiveModel[]; modelsCheckedAt?: number }[];
};

export type ProviderModelCatalog = {
  models: CatalogModel[];
  source: ModelSource;
  /** Machine whose live list is shown, when `source === "live"`. */
  runtimeName?: string;
  checkedAt?: number;
  /** Japanese one-liner for picker footers: where this list came from. */
  note: string;
};

/**
 * What pickers show for a provider: the live catalog a connected machine
 * reported from the CLI (`agent models` …) when one exists — preferring
 * machines the user may actually run on, then the freshest report — else the
 * static snapshot. Runtimes that stopped heartbeating still count: the list
 * they reported is the best knowledge we have until they come back.
 */
export function modelCatalogFor(kind: ProviderDriverKind, runtimes: readonly RuntimeModelSource[] | undefined): ProviderModelCatalog {
  const reports = (runtimes ?? [])
    .flatMap((runtime) =>
      runtime.providers
        .filter((provider) => provider.driverKind === kind && provider.available && (provider.models?.length ?? 0) > 0)
        .map((provider) => ({ runtime, models: provider.models ?? [], checkedAt: provider.modelsCheckedAt ?? 0 })),
    )
    .sort((a, b) => Number(b.runtime.canUse) - Number(a.runtime.canUse) || b.checkedAt - a.checkedAt);
  const best = reports[0];
  if (best) {
    const merged = mergeModelCatalog(kind, best.models);
    return {
      ...merged,
      runtimeName: best.runtime.name,
      checkedAt: best.checkedAt,
      note: `${modelsCommandLabel(kind) ?? "CLI"} の結果（${best.runtime.name}）`,
    };
  }
  const merged = mergeModelCatalog(kind, null);
  return {
    ...merged,
    note: supportsLiveModels(kind)
      ? `静的カタログ（${modelSourceHint(kind)}）— 接続中のマシンが ${modelsCommandLabel(kind)} を報告すると差し替わります`
      : `静的カタログ（${modelSourceHint(kind)}）— ${PROVIDER_MAINTENANCE[kind].modelsHint}`,
  };
}

/** Button labels (imperative). */
export const MAINTENANCE_LABEL: Record<MaintenanceKind, string> = {
  updateCli: "CLI を更新",
  refreshModels: "モデルを再取得",
};

/** Noun form for sentences: 「CLI の更新を実行中」「モデルの再取得が完了しました」. */
export const MAINTENANCE_NOUN: Record<MaintenanceKind, string> = {
  updateCli: "CLI の更新",
  refreshModels: "モデルの再取得",
};

export const MAINTENANCE_STATUS_LABEL: Record<MaintenanceStatus, string> = {
  queued: "待機中",
  running: "実行中",
  done: "完了",
  failed: "失敗",
  cancelled: "取り消し",
};

/** `Cursor · muse-spark-1.3` / `Cursor · 既定モデル` — the short agent label used in pills and headers. */
export function agentLabel(
  kind?: string | null,
  model?: string | null
): string {
  const label = providerLabel(kind);
  return model ? `${label} · ${model}` : label;
}

/** The mention the composer prepends when a project message names no agent. */
export function agentMention(
  kind: ProviderDriverKind,
  model?: string | null
): string {
  return formatAgentMention(kind, model ?? undefined);
}

/** An `@provider/model` example from a different provider than the chat's, for hints. */
export function modelMentionExample(current: ProviderDriverKind): string {
  return current === "cursor"
    ? agentMention("codex", "gpt-5.6-sol")
    : agentMention("cursor", "muse-spark-1.3");
}
