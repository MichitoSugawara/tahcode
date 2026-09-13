import { useMutation, useQuery } from "convex/react";
import { ArrowUpCircle, Check, ChevronDown, ChevronRight, Cpu, RefreshCw, ShieldCheck, Terminal, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/atoms/Button";
import { Monogram } from "@/components/atoms/EntityChip";
import { Shimmer } from "@/components/atoms/Shimmer";
import { StatusPill } from "@/components/atoms/StatusPill";
import { isLive, useOrg, type Runtime, type RuntimeProvider } from "@/harness/OrgContext";
import { Dialog, SectionLabel, Well } from "@/harness/ui/Dialog";
import { Notice } from "@/harness/ui/Notice";
import { Switch } from "@/harness/ui/Switch";
import { displayName, errorSummary, relativeTime } from "@/lib/format";
import {
  MAINTENANCE_LABEL,
  MAINTENANCE_NOUN,
  MAINTENANCE_STATUS_LABEL,
  PROVIDERS,
  PROVIDER_KINDS,
  PROVIDER_MAINTENANCE,
  STALE_RUNNING_MS,
  canRequestMaintenance,
  installMethodLabel,
  mergeModelCatalog,
  modelsCommandLabel,
  supportsLiveModels,
  type MaintenanceKind,
  type MaintenanceStatus,
  type ProviderDriverKind,
} from "@/lib/providers";

/* ─────────────────────────────────────────────────────────
 * MACHINE PROVIDER SETTINGS — one machine, six providers:
 * which CLIs the bridge detected, the models each one can
 * actually use (live from `agent models` & co., static catalog
 * otherwise), versions, and — for the machine owner — the
 * allowlisted update / refresh actions with their progress.
 * Modeled on Multica's per-runtime agent list; the server never
 * sends a command string, only (kind, provider).
 * ───────────────────────────────────────────────────────── */

type Command = {
  _id: Id<"runtimeCommands">;
  _creationTime: number;
  kind: MaintenanceKind;
  driverKind: ProviderDriverKind;
  status: MaintenanceStatus;
  requestedBy: Id<"users">;
  command?: string;
  log: string;
  error?: string;
  versionBefore?: string;
  versionAfter?: string;
  claimedAt?: number;
  completedAt?: number;
};

const MAINTENANCE_CAPABILITY = "maintenance";
const SHOW_MODELS = 10;

export function RuntimeProvidersDialog({
  open,
  onOpenChange,
  runtimeId,
  focus,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  runtimeId: Id<"runtimes">;
  focus?: ProviderDriverKind;
}) {
  const { runtimes, members, me, role, now, openDialog } = useOrg();
  const runtime = runtimes?.find((item) => item._id === runtimeId);
  const commands = (useQuery(api.runtimeCommands.list, runtime ? { runtimeId } : "skip") ?? []) as Command[];
  const setPolicy = useMutation(api.runtimes.setMaintenancePolicy);
  const [policyBusy, setPolicyBusy] = useState(false);

  const mine = !!runtime && String(runtime.ownerUserId) === String(me._id);
  const owner = members?.find((member) => String(member.user._id) === String(runtime?.ownerUserId));
  const actor = runtime
    ? {
        actorUserId: String(me._id),
        actorRole: role,
        runtimeOwnerUserId: String(runtime.ownerUserId),
        maintenanceByAdmins: runtime.maintenanceByAdmins,
        canUseRuntime: runtime.canUse,
      }
    : null;
  const canUpdate = !!actor && canRequestMaintenance("updateCli", actor);
  const canRefresh = !!actor && canRequestMaintenance("refreshModels", actor);
  const bridgeSupports = !!runtime && runtime.capabilities.includes(MAINTENANCE_CAPABILITY);
  const live = !!runtime && isLive(runtime, now);

  const byKind = useMemo(() => new Map(runtime?.providers.map((provider) => [provider.driverKind, provider] as const) ?? []), [runtime]);
  const detected = runtime?.providers.filter((provider) => provider.available) ?? [];
  const liveModelCount = detected.reduce((sum, provider) => sum + (provider.models?.length ?? 0), 0);
  const active = commands.filter((command) => command.status === "queued" || command.status === "running");

  if (!runtime) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange} title="マシンのプロバイダ設定" width={640}>
        <Notice tone="info" title="このマシンは見つかりません">削除されたか、まだ読み込み中です。</Notice>
      </Dialog>
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={
        <span className="inline-flex items-center gap-2">
          <Cpu size={16} className="text-ink-3" /> {runtime.name} のプロバイダ設定
        </span>
      }
      description="このマシンで検出されたエージェント CLI と、それぞれが使えるモデル・バージョン。更新はマシン側の許可リストにあるコマンドだけを tahcode ブリッジが実行します。"
      width={680}
      footer={
        <>
          <span className="truncate text-[12px] text-ink-3">
            所有者: {mine ? "あなた" : owner ? displayName(owner.user) : "—"} · {active.length > 0 ? `${active.length} 件実行中 / 待機中` : `履歴 ${commands.length} 件`}
          </span>
          <div className="flex items-center gap-1.5">
            {(mine || role !== "member") && (
              <Button type="button" variant="ghost" size="sm" onClick={() => openDialog({ kind: "grant", runtimeId: runtime._id })}>
                <ShieldCheck size={13} /> 利用許可
              </Button>
            )}
            <Button type="button" variant="primary" size="sm" onClick={() => onOpenChange(false)}>
              閉じる
            </Button>
          </div>
        </>
      }
    >
      <div className="flex flex-col gap-4" style={{ animation: "fade-up 300ms cubic-bezier(0.23,1,0.32,1) both" }}>
        <MachineStrip runtime={runtime} live={live} now={now} detectedCount={detected.length} liveModelCount={liveModelCount} />

        {!bridgeSupports && (
          <Notice tone="warn" title="このマシンの tahcode ブリッジはリモート更新に未対応です">
            {runtime.bridgeVersion ? `tahcode v${runtime.bridgeVersion}` : "旧バージョンの tahcode"} が接続中です。マシン側で{" "}
            <code className="rounded-[4px] bg-field px-1 font-mono text-[11.5px] text-ink">npm i -g tahcode@latest && tahcode restart</code> を実行すると、モデルのライブ取得と CLI 更新がここから使えます。
          </Notice>
        )}

        <Well className="px-3 py-2.5">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-medium text-ink">Org の Owner / Admin にも CLI の更新を許可</div>
              <div className="mt-0.5 text-[12px] leading-relaxed text-ink-3">
                既定はオフ — 他人のマシンのソフトウェアを更新できるのは所有者だけです。オンにすると Admin 以上がこの画面から更新を実行できます（ジョブの利用許可とは別）。
              </div>
            </div>
            <Switch
              label="Owner / Admin にも CLI の更新を許可"
              checked={runtime.maintenanceByAdmins}
              disabled={!mine || policyBusy}
              onCheckedChange={(next) => {
                setPolicyBusy(true);
                setPolicy({ runtimeId: runtime._id, maintenanceByAdmins: next })
                  .then(() => toast.success(next ? "Admin 以上も更新できるようにしました" : "更新は所有者のみに戻しました"))
                  .catch((error: unknown) => toast.error(errorSummary(error) ?? "設定を変更できませんでした"))
                  .finally(() => setPolicyBusy(false));
              }}
            />
          </div>
          {!mine && (
            <div className="mt-2 text-[11.5px] text-ink-3">
              {canUpdate ? "所有者がこの設定をオンにしているため、あなたも更新を実行できます。" : "この設定を変えられるのは所有者だけです。"}
            </div>
          )}
        </Well>

        <div className="flex flex-col gap-2.5">
          <SectionLabel className="mb-0">プロバイダとモデル</SectionLabel>
          {PROVIDER_KINDS.map((kind) => (
            <ProviderRow
              key={kind}
              kind={kind}
              runtime={runtime}
              provider={byKind.get(kind)}
              commands={commands.filter((command) => command.driverKind === kind)}
              canUpdate={canUpdate}
              canRefresh={canRefresh}
              bridgeSupports={bridgeSupports}
              live={live}
              focused={focus === kind}
              now={now}
              mine={mine}
            />
          ))}
        </div>

        {commands.length > 0 && <History commands={commands} now={now} />}
      </div>
    </Dialog>
  );
}

/* ── machine summary strip ───────────────────────────────── */

function MachineStrip({ runtime, live, now, detectedCount, liveModelCount }: { runtime: Runtime; live: boolean; now: number; detectedCount: number; liveModelCount: number }) {
  const tone = live ? "green" : runtime.status === "online" ? "orange" : "neutral";
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-card bg-surface px-3 py-2.5 shadow-card">
      <span className="relative flex size-2.5 shrink-0 items-center justify-center">
        <span className={`size-2 rounded-full ${tone === "green" ? "bg-green" : tone === "orange" ? "bg-orange" : "bg-ink-3"}`} />
        {live && <span className="absolute inset-0 rounded-full bg-green opacity-40" style={{ animation: "pixel-on 1.6s ease-in-out infinite" }} />}
      </span>
      <span className="text-[13px] font-medium text-ink">{live ? "オンライン" : runtime.status === "online" ? "応答なし" : "オフライン"}</span>
      {runtime.hostname && <span className="font-mono text-[12px] text-ink-3">{runtime.hostname}</span>}
      <span className="text-[12px] text-ink-3">最終ハートビート {runtime.lastSeenAt ? relativeTime(runtime.lastSeenAt, now) : "—"}</span>
      <span className="ml-auto inline-flex items-center gap-1.5">
        <Stat label="CLI" value={`${detectedCount}/${PROVIDER_KINDS.length}`} />
        <Stat label="live モデル" value={String(liveModelCount)} />
        <Stat label="bridge" value={runtime.bridgeVersion ? `v${runtime.bridgeVersion}` : "旧"} />
      </span>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex h-5.5 items-center gap-1 rounded-chip bg-field px-1.5 text-[11px] text-ink-3 shadow-hairline">
      {label} <span className="font-mono font-medium text-ink-2 tabular-nums">{value}</span>
    </span>
  );
}

/* ── one provider ────────────────────────────────────────── */

function ProviderRow({
  kind,
  runtime,
  provider,
  commands,
  canUpdate,
  canRefresh,
  bridgeSupports,
  live,
  focused,
  now,
  mine,
}: {
  kind: ProviderDriverKind;
  runtime: Runtime;
  provider: RuntimeProvider | undefined;
  commands: Command[];
  canUpdate: boolean;
  canRefresh: boolean;
  bridgeSupports: boolean;
  live: boolean;
  focused: boolean;
  now: number;
  mine: boolean;
}) {
  const info = PROVIDERS[kind];
  const maintenance = PROVIDER_MAINTENANCE[kind];
  const request = useMutation(api.runtimeCommands.request);
  const cancel = useMutation(api.runtimeCommands.cancel);
  const [busy, setBusy] = useState<MaintenanceKind | null>(null);
  const [showAllModels, setShowAllModels] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (focused) ref.current?.scrollIntoView({ block: "center" });
  }, [focused]);

  const noCli = kind === "antigravity";
  const available = !!provider?.available;
  const catalog = mergeModelCatalog(kind, provider?.models);
  const liveList = catalog.source === "live";
  const activeCommand = commands.find((command) => command.status === "queued" || command.status === "running");
  const lastFinished = commands.find((command) => command.status === "done" || command.status === "failed");
  const liveCapable = supportsLiveModels(kind);
  const updateCommand = provider?.updateCommand;

  const run = async (maintenanceKind: MaintenanceKind) => {
    if (busy) return;
    setBusy(maintenanceKind);
    try {
      await request({ runtimeId: runtime._id, kind: maintenanceKind, driverKind: kind });
      toast.success(live ? `${info.label}: ${MAINTENANCE_NOUN[maintenanceKind]}をマシンに送りました` : `${info.label}: ${MAINTENANCE_NOUN[maintenanceKind]}をキューに入れました（接続後に実行）`);
    } catch (error) {
      toast.error(errorSummary(error) ?? "リクエストに失敗しました");
    } finally {
      setBusy(null);
    }
  };

  const disabledReason = (maintenanceKind: MaintenanceKind): string | null => {
    if (!available) return "CLI 未検出";
    if (!bridgeSupports) return "ブリッジが未対応";
    if (activeCommand) return "実行中のコマンドがあります";
    const allowed = maintenanceKind === "updateCli" ? canUpdate : canRefresh;
    if (!allowed) return maintenanceKind === "updateCli" ? "所有者のみ" : "利用許可が必要";
    return null;
  };

  const status = noCli
    ? { tone: "neutral" as const, label: "CLI なし" }
    : available
      ? { tone: "green" as const, label: "検出" }
      : provider
        ? { tone: "neutral" as const, label: "未検出" }
        : { tone: "neutral" as const, label: "未報告" };

  return (
    <div
      ref={ref}
      data-provider={kind}
      className={`overflow-hidden rounded-card bg-surface transition-[box-shadow] duration-200 ${focused ? "shadow-[0_0_0_1px_var(--accent),var(--shadow-card)]" : "shadow-card"}`}
    >
      <div className="primitive-card-bar flex flex-wrap items-center gap-2 border-b border-line">
        <Monogram color={info.color}>{info.label.charAt(0)}</Monogram>
        <span className="text-[13px] font-medium text-ink">{info.label}</span>
        <StatusPill tone={status.tone} className="h-5 text-[11px]">
          {status.label}
        </StatusPill>
        {available && provider?.version && <span className="font-mono text-[11.5px] text-ink-2">{provider.version}</span>}
        {available && provider?.installMethod && provider.installMethod !== "unknown" && (
          <span className="inline-flex h-5 items-center rounded-chip bg-field px-1.5 text-[11px] text-ink-3 shadow-hairline">{installMethodLabel(provider.installMethod)}</span>
        )}
        {available && provider?.binaryPath && (
          <span className="ml-auto min-w-0 max-w-[45%] truncate font-mono text-[11px] text-ink-3" title={provider.binaryPath}>
            {provider.binaryPath}
          </span>
        )}
      </div>

      <div className="flex flex-col gap-2.5 px-3 py-2.5">
        {/* models */}
        <div className="flex flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-1.5 text-[11.5px] text-ink-3">
            <span className="font-medium text-ink-2">モデル {catalog.models.length} 件</span>
            <span
              className={`inline-flex h-5 items-center gap-1 rounded-full px-2 text-[11px] font-medium ${liveList ? "bg-green-tint text-green" : "bg-inset text-ink-2 shadow-hairline"}`}
              title={liveList ? `${modelsCommandLabel(kind, provider?.binaryPath)} の結果` : maintenance.modelsHint}
            >
              {liveList ? <Terminal size={10} /> : null}
              {liveList ? `live · ${modelsCommandLabel(kind)}` : "静的カタログ"}
            </span>
            {liveList && provider?.modelsCheckedAt && <span>{relativeTime(provider.modelsCheckedAt, now)} に取得</span>}
            {!liveList && available && liveCapable && provider?.modelsError && (
              <span className="text-orange" title={provider.modelsError}>
                ライブ取得に失敗 — {provider.modelsError.length > 60 ? `${provider.modelsError.slice(0, 60)}…` : provider.modelsError}
              </span>
            )}
            {!liveList && available && liveCapable && !provider?.modelsError && provider?.modelsCheckedAt === undefined && (
              <span>{bridgeSupports ? "まだ取得していません" : "ブリッジを更新するとライブ取得します"}</span>
            )}
            {!liveList && !liveCapable && !noCli && <span>{maintenance.modelsHint.replace(/静的カタログ.*$/, "静的カタログ")}</span>}
          </div>
          <div className="flex flex-wrap gap-1">
            {(showAllModels ? catalog.models : catalog.models.slice(0, SHOW_MODELS)).map((model) => (
              <span
                key={model.slug}
                title={model.name && model.name !== model.slug ? model.name : undefined}
                className={`inline-flex h-5.5 items-center gap-1 rounded-chip px-1.5 font-mono text-[11px] shadow-hairline ${
                  model.default ? "bg-accent-tint text-accent-ink" : model.legacy ? "bg-field text-ink-3" : "bg-field text-ink-2"
                }`}
              >
                {model.slug}
                {model.default && <Check size={10} strokeWidth={3} />}
                {model.legacy && <span className="text-[10px]">legacy</span>}
              </span>
            ))}
            {catalog.models.length > SHOW_MODELS && (
              <button type="button" onClick={() => setShowAllModels((value) => !value)} className="inline-flex h-5.5 items-center rounded-chip px-1.5 text-[11px] text-ink-3 hover:bg-hover hover:text-ink">
                {showAllModels ? "折りたたむ" : `+${catalog.models.length - SHOW_MODELS}`}
              </button>
            )}
          </div>
          {available && !liveList && liveCapable && <p className="text-[11.5px] text-ink-3">一覧にないスラッグも @{info.handle}/&lt;slug&gt; で直接指名できます（CLI 側のカタログが正）。</p>}
        </div>

        {/* actions */}
        {!noCli && (
          <div className="flex flex-wrap items-center gap-1.5">
            {available && liveCapable && (
              <ActionButton
                icon={<RefreshCw size={12} className={busy === "refreshModels" ? "animate-spin" : ""} />}
                label={MAINTENANCE_LABEL.refreshModels}
                reason={disabledReason("refreshModels")}
                busy={busy === "refreshModels"}
                onClick={() => void run("refreshModels")}
              />
            )}
            {available && updateCommand && (
              <ActionButton
                icon={<ArrowUpCircle size={12} />}
                label={MAINTENANCE_LABEL.updateCli}
                reason={disabledReason("updateCli")}
                busy={busy === "updateCli"}
                accent
                onClick={() => void run("updateCli")}
              />
            )}
            {available && updateCommand && (
              <code className="rounded-[4px] bg-field px-1.5 py-0.5 font-mono text-[11px] text-ink-2 shadow-hairline" title="ブリッジが実行するコマンド（許可リスト）">
                $ {updateCommand}
              </code>
            )}
            {available && !updateCommand && (
              <span className="text-[11.5px] text-ink-3">
                自動更新の対象外 — 手動: <code className="rounded-[4px] bg-field px-1 font-mono text-[11px] text-ink-2">{maintenance.manualHint}</code>
              </span>
            )}
            {!available && (
              <span className="text-[11.5px] text-ink-3">
                {provider ? `このマシンでは未検出（${info.binary} を PATH に入れてサインイン後、次のハートビートで検出）` : "tahcode start で接続すると検出結果が届きます"}
              </span>
            )}
            {available && !canUpdate && bridgeSupports && (
              <span className="ml-auto text-[11.5px] text-ink-3">
                {mine ? "" : runtime.maintenanceByAdmins ? "更新は所有者と Admin 以上" : "更新は所有者のみ"}
              </span>
            )}
          </div>
        )}
        {noCli && <p className="text-[11.5px] text-ink-3">{maintenance.manualHint}</p>}

        {activeCommand && (
          <ActiveCommand
            command={activeCommand}
            now={now}
            live={live}
            onCancel={
              activeCommand.status === "queued" || (activeCommand.claimedAt !== undefined && now - activeCommand.claimedAt > STALE_RUNNING_MS)
                ? () => void cancel({ commandId: activeCommand._id }).catch((error: unknown) => toast.error(errorSummary(error) ?? "取り消せませんでした"))
                : undefined
            }
          />
        )}
        {!activeCommand && lastFinished && <FinishedCommand command={lastFinished} now={now} />}
      </div>
    </div>
  );
}

function ActionButton({ icon, label, reason, busy, accent = false, onClick }: { icon: ReactNode; label: string; reason: string | null; busy: boolean; accent?: boolean; onClick: () => void }) {
  return (
    <span title={reason ?? undefined} className="inline-flex">
      <Button type="button" size="xs" variant={accent ? "accent" : "secondary"} disabled={!!reason || busy} onClick={onClick}>
        {icon} {label}
        {reason && <span className="text-[10.5px] opacity-80">· {reason}</span>}
      </Button>
    </span>
  );
}

/* ── command progress / result ───────────────────────────── */

function logTail(log: string, lines = 8): string[] {
  return log.split("\n").filter((line) => line.trim().length > 0).slice(-lines);
}

function ActiveCommand({ command, now, live, onCancel }: { command: Command; now: number; live: boolean; onCancel?: () => void }) {
  const tail = logTail(command.log);
  const stale = command.status === "running" && command.claimedAt !== undefined && now - command.claimedAt > STALE_RUNNING_MS;
  return (
    <div className="rounded-card bg-inset px-3 py-2.5 shadow-hairline" style={{ animation: "fade-in 200ms ease-out both" }}>
      <div className="flex items-center gap-2 text-[12.5px]">
        <span className="size-3 shrink-0 rounded-full border-2 border-ink-3 border-t-transparent" style={{ animation: "spin 0.9s linear infinite" }} />
        <Shimmer className="font-medium">
          {command.status === "queued"
            ? `${MAINTENANCE_NOUN[command.kind]} — ${live ? "マシンの受付を待っています" : "マシンがオフラインです。接続後に実行されます"}`
            : stale
              ? `${MAINTENANCE_NOUN[command.kind]} — ブリッジからの応答が途絶えています`
              : `${MAINTENANCE_NOUN[command.kind]}を実行中`}
        </Shimmer>
        {command.command && <code className="truncate font-mono text-[11.5px] text-ink-2">$ {command.command}</code>}
        <span className="ml-auto shrink-0 text-[11.5px] text-ink-3">{relativeTime(command.claimedAt ?? command._creationTime, now)}</span>
        {onCancel && (
          <Button type="button" size="xs" variant="quiet" onClick={onCancel} className="-mr-1.5 text-ink-3 hover:text-red">
            <X size={12} /> 取り消す
          </Button>
        )}
      </div>
      {tail.length > 0 && (
        <pre className="mt-2 max-h-40 overflow-y-auto rounded-[6px] bg-page px-2.5 py-2 font-mono text-[11px] leading-relaxed text-ink-2 whitespace-pre-wrap break-all">{tail.join("\n")}</pre>
      )}
    </div>
  );
}

function FinishedCommand({ command, now }: { command: Command; now: number }) {
  const [openLog, setOpenLog] = useState(false);
  const failed = command.status === "failed";
  const versionLine =
    command.kind === "updateCli" && command.versionAfter
      ? command.versionBefore && command.versionBefore !== command.versionAfter
        ? `${command.versionBefore} → ${command.versionAfter}`
        : `${command.versionAfter}（最新）`
      : null;
  const lines = command.log.split("\n").filter((line) => line.trim().length > 0);
  return (
    <Notice tone={failed ? "warn" : "success"} title={`${MAINTENANCE_NOUN[command.kind]}${failed ? "に失敗しました" : "が完了しました"} · ${command.completedAt ? relativeTime(command.completedAt, now) : ""}`}>
      <div className="flex flex-col gap-1">
        {command.command && <code className="font-mono text-[11.5px]">$ {command.command}</code>}
        {versionLine && <span className="font-mono text-[12px]">{versionLine}</span>}
        {failed && command.error && <span className="break-words">{command.error}</span>}
        {lines.length > 0 && (
          <button type="button" onClick={() => setOpenLog((value) => !value)} className="inline-flex w-fit items-center gap-1 text-[11.5px] underline-offset-2 hover:underline">
            {openLog ? <ChevronDown size={11} /> : <ChevronRight size={11} />} ログ {lines.length} 行
          </button>
        )}
        {openLog && (
          <pre className="max-h-48 overflow-y-auto rounded-[6px] bg-page px-2.5 py-2 font-mono text-[11px] leading-relaxed text-ink-2 whitespace-pre-wrap break-all">{lines.join("\n")}</pre>
        )}
      </div>
    </Notice>
  );
}

/* ── history ─────────────────────────────────────────────── */

function History({ commands, now }: { commands: Command[]; now: number }) {
  const { members } = useOrg();
  const [open, setOpen] = useState(false);
  const rows = commands.slice(0, 12);
  return (
    <div className="flex flex-col gap-1.5">
      <button type="button" onClick={() => setOpen((value) => !value)} className="inline-flex w-fit items-center gap-1 text-[12.5px] font-medium text-ink-2 hover:text-ink">
        {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />} 実行履歴 <span className="text-ink-3">{commands.length}</span>
      </button>
      {open && (
        <Well>
          {rows.map((command) => {
            const who = members?.find((member) => String(member.user._id) === String(command.requestedBy));
            const tone = command.status === "done" ? "green" : command.status === "failed" ? "red" : command.status === "running" ? "accent" : "neutral";
            return (
              <div key={String(command._id)} className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2 text-[12px] last:border-b-0">
                <Monogram color={PROVIDERS[command.driverKind].color}>{PROVIDERS[command.driverKind].label.charAt(0)}</Monogram>
                <span className="font-medium text-ink">{MAINTENANCE_NOUN[command.kind]}</span>
                {command.command && <code className="truncate font-mono text-[11px] text-ink-3">$ {command.command}</code>}
                <StatusPill tone={tone} className="h-5 text-[11px]">
                  {MAINTENANCE_STATUS_LABEL[command.status]}
                </StatusPill>
                <span className="ml-auto text-ink-3">
                  {who ? displayName(who.user) : "—"} · {relativeTime(command.completedAt ?? command._creationTime, now)}
                </span>
              </div>
            );
          })}
        </Well>
      )}
    </div>
  );
}
