import { useMutation } from "convex/react";
import {
  Check,
  Cpu,
  Plus,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
  Zap,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/atoms/Button";
import { StatusPill } from "@/components/atoms/StatusPill";
import { isLive, useOrg } from "@/harness/OrgContext";
import type { Runtime } from "@/harness/OrgContext";
import { Notice } from "@/harness/ui/Notice";
import { isDesktopShell, registerRuntimeCtaLabel } from "@/lib/desktop";
import { displayName, relativeTime, roleLabel } from "@/lib/format";
import { PROVIDERS, mergeModelCatalog } from "@/lib/providers";

import { api } from "../../../convex/_generated/api";

/* ─────────────────────────────────────────────────────────
 * RUNTIME PANE — where the next job will run. A runtime is a
 * teammate's machine; default deny means you only see "use"
 * on machines you own or were granted.
 * ───────────────────────────────────────────────────────── */

function presence(
  runtime: Runtime,
  now: number
): { tone: "green" | "orange" | "neutral"; label: string } {
  if (isLive(runtime, now)) {
    return { tone: "green", label: "オンライン" };
  }
  if (runtime.status === "online") {
    return {
      tone: "orange",
      label: `応答なし · ${runtime.lastSeenAt ? relativeTime(runtime.lastSeenAt, now) : "不明"}`,
    };
  }
  return {
    label: runtime.lastSeenAt
      ? `オフライン · ${relativeTime(runtime.lastSeenAt, now)}`
      : "未接続",
    tone: "neutral",
  };
}

export function RuntimeCard({
  runtime,
  compact = false,
}: {
  runtime: Runtime;
  compact?: boolean;
}) {
  const { me, now, members, isAdmin, runtimeId, setRuntimeId, openDialog } =
    useOrg();
  const remove = useMutation(api.runtimes.remove);
  const mine = String(runtime.ownerUserId) === String(me._id);
  const owner = members?.find(
    (member) => String(member.user._id) === String(runtime.ownerUserId)
  );
  const selected = runtimeId === runtime._id;
  const state = presence(runtime, now);
  const available = runtime.providers.filter((provider) => provider.available);

  return (
    <div
      className={`rounded-card bg-surface overflow-hidden transition-[box-shadow] duration-200 ${selected ? "shadow-[0_0_0_1px_var(--accent),var(--shadow-card)]" : "shadow-card"}`}
      style={{ animation: "fade-up 350ms cubic-bezier(0.23,1,0.32,1) both" }}
    >
      <div className="primitive-card-bar border-line flex items-center gap-2.5 border-b">
        <span className="relative flex size-2.5 shrink-0 items-center justify-center">
          <span
            className={`size-2 rounded-full ${state.tone === "green" ? "bg-green" : state.tone === "orange" ? "bg-orange" : "bg-ink-3"}`}
          />
          {state.tone === "green" && (
            <span
              className="bg-green absolute inset-0 rounded-full opacity-40"
              style={{ animation: "pixel-on 1.6s ease-in-out infinite" }}
            />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="text-ink block truncate text-[13px] font-medium">
            {runtime.name}
          </span>
          <span className="text-ink-3 block truncate text-[11.5px]">
            {state.label}
            {runtime.hostname ? ` · ${runtime.hostname}` : ""}
          </span>
        </span>
        {selected && (
          <StatusPill tone="accent" dot={false} className="h-5 text-[11px]">
            <Check size={11} strokeWidth={3} /> 指定中
          </StatusPill>
        )}
      </div>

      <div className="flex flex-col gap-2.5 px-3 py-2.5">
        <div className="flex flex-wrap gap-1">
          {available.length > 0 ? (
            available.map((provider) => {
              const catalog = mergeModelCatalog(
                provider.driverKind,
                provider.models
              );
              return (
                <button
                  key={provider.driverKind}
                  type="button"
                  title={`${provider.binaryPath ?? ""}${provider.version ? ` ${provider.version}` : ""} · モデル ${catalog.models.length} 件（${catalog.source === "live" ? "live" : "静的"}）— クリックでプロバイダ設定`}
                  onClick={() =>
                    openDialog({
                      kind: "runtimeProviders",
                      runtimeId: runtime._id,
                      focus: provider.driverKind,
                    })
                  }
                  className="rounded-chip bg-field text-ink-2 shadow-hairline hover:bg-hover inline-flex h-5.5 items-center gap-1 px-1.5 font-mono text-[11px] transition-[background-color] duration-150"
                >
                  <span
                    className="size-1.5 rounded-full"
                    style={{
                      background:
                        PROVIDERS[provider.driverKind]?.color ??
                        "var(--accent)",
                    }}
                  />
                  {PROVIDERS[provider.driverKind]?.label ?? provider.driverKind}
                  {provider.version && (
                    <span className="text-ink-3">{provider.version}</span>
                  )}
                  <span
                    className={`text-[10px] ${catalog.source === "live" ? "text-green" : "text-ink-3"}`}
                  >
                    {catalog.models.length}
                  </span>
                </button>
              );
            })
          ) : runtime.providers.length > 0 ? (
            <span className="text-ink-3 text-[12px]">
              CLI が見つかりません（codex / claude / agent
              のいずれかにログインしてください）
            </span>
          ) : (
            <span className="text-ink-3 text-[12px]">
              未報告 —{" "}
              <code className="bg-field rounded-[4px] px-1 font-mono text-[11px]">
                tahcode start
              </code>{" "}
              で接続すると検出した CLI が並びます
            </span>
          )}
        </div>

        <div className="text-ink-3 flex items-center gap-2 text-[12px]">
          <span className="truncate">
            所有者:{" "}
            {mine
              ? "あなた"
              : owner
                ? `${displayName(owner.user)}（${roleLabel(owner.role)}）`
                : "—"}
          </span>
          <span className="ml-auto shrink-0">
            {runtime.grants.length === 0
              ? "所有者のみ"
              : `${runtime.grants.length} 件の許可`}
          </span>
        </div>

        {!runtime.canUse && (
          <Notice tone="locked" title="あなたには利用許可がありません">
            default deny のため、
            {mine
              ? ""
              : `${owner ? displayName(owner.user) : "所有者"} または Admin が`}
            メンバー単位かロール単位で許可するまで、このマシンではジョブを実行できません。
          </Notice>
        )}

        {!compact && (
          <div className="flex flex-wrap items-center gap-1.5">
            {runtime.canUse && (
              <Button
                type="button"
                size="xs"
                variant={selected ? "primary" : "secondary"}
                onClick={() => setRuntimeId(selected ? null : runtime._id)}
              >
                <Zap size={12} /> {selected ? "指定を解除" : "このマシンを使う"}
              </Button>
            )}
            <Button
              type="button"
              size="xs"
              variant="secondary"
              onClick={() =>
                openDialog({ kind: "runtimeProviders", runtimeId: runtime._id })
              }
            >
              <SlidersHorizontal size={12} /> プロバイダ設定
            </Button>
            {(mine || isAdmin) && (
              <Button
                type="button"
                size="xs"
                variant="secondary"
                onClick={() =>
                  openDialog({ kind: "grant", runtimeId: runtime._id })
                }
              >
                <ShieldCheck size={12} /> 許可を管理
              </Button>
            )}
            {(mine || isAdmin) && (
              <Button
                type="button"
                size="xs"
                variant="quiet"
                className="text-ink-3 hover:text-red ml-auto"
                onClick={() => {
                  if (
                    !window.confirm(
                      `${runtime.name} を削除しますか？トークンは無効になります。`
                    )
                  ) {
                    return;
                  }
                  void remove({ runtimeId: runtime._id })
                    .then(() => toast.success("ランタイムを削除しました"))
                    .catch((error: unknown) =>
                      toast.error(
                        error instanceof Error
                          ? error.message
                          : "削除に失敗しました"
                      )
                    );
                }}
              >
                <Trash2 size={12} />
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function RuntimePane() {
  const { runtimes, runtimeId, setRuntimeId, now, openDialog } = useOrg();
  const list = runtimes ?? [];
  const live = list.filter((runtime) => isLive(runtime, now));
  const usable = live.filter((runtime) => runtime.canUse);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2 px-0.5">
        <span className="text-ink text-[13px] font-semibold">
          ジョブを実行するマシン
        </span>
        <span className="bg-inset text-ink-2 shadow-hairline inline-flex h-5 items-center rounded-md px-1.5 text-[11.5px] font-medium tabular-nums">
          {live.length}/{list.length} オンライン
        </span>
      </div>

      {list.length === 0 ? (
        <Notice
          tone="info"
          title="ランタイムがまだありません"
          action={
            <Button
              type="button"
              size="sm"
              variant="accent"
              onClick={() => openDialog({ kind: "registerRuntime" })}
            >
              <Plus size={13} /> {registerRuntimeCtaLabel()}
            </Button>
          }
        >
          {isDesktopShell() ? (
            <>
              エージェントはあなたの手元のマシンで Multica daemon
              経由で動きます。「{registerRuntimeCtaLabel()}
              」でこの Mac の tahcode CLI を接続します。
            </>
          ) : (
            <>
              エージェントはあなたの手元のマシンで Multica daemon
              経由で動きます。登録すると{" "}
              <code className="bg-field rounded-[4px] px-1 font-mono text-[11px]">
                npm i -g tahcode
              </code>{" "}
              →{" "}
              <code className="bg-field rounded-[4px] px-1 font-mono text-[11px]">
                tahcode link
              </code>{" "}
              →{" "}
              <code className="bg-field rounded-[4px] px-1 font-mono text-[11px]">
                tahcode start
              </code>{" "}
              のコマンドが発行されます。
            </>
          )}
        </Notice>
      ) : (
        <>
          <button
            type="button"
            onClick={() => setRuntimeId(null)}
            aria-pressed={runtimeId === null}
            className={`rounded-card hover:bg-hover flex items-center gap-2.5 px-3 py-2.5 text-left transition-[box-shadow,background-color] duration-150 ${
              runtimeId === null
                ? "bg-surface shadow-[0_0_0_1px_var(--accent),var(--shadow-card)]"
                : "bg-surface shadow-card"
            }`}
          >
            <Cpu size={15} className="text-ink-3 shrink-0" />
            <span className="min-w-0 flex-1">
              <span className="text-ink block text-[13px] font-medium">
                自動選択
              </span>
              <span className="text-ink-3 block text-[11.5px]">
                {usable.length > 0
                  ? `オンラインで許可のある ${usable.length} 台から選びます`
                  : "いま使えるマシンはありません — 送信するとセットアップ手順が返信されます"}
              </span>
            </span>
            {runtimeId === null && (
              <Check size={14} className="text-accent-ink" />
            )}
          </button>
          {list.map((runtime) => (
            <RuntimeCard key={String(runtime._id)} runtime={runtime} />
          ))}
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="self-start"
            onClick={() => openDialog({ kind: "registerRuntime" })}
          >
            <Plus size={13} />{" "}
            {isDesktopShell() ? "別の Mac を登録" : "別のマシンを登録"}
          </Button>
        </>
      )}
    </div>
  );
}
