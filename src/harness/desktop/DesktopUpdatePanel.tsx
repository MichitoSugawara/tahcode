import { DESKTOP_RELEASES_URL, UPDATE_UI } from "@tahcode/core/desktop";
import type { DesktopUpdateState } from "@tahcode/core/desktop";
import { ArrowUpCircle, Download, RefreshCw } from "lucide-react";

import { Button } from "@/components/atoms/Button";
import { Shimmer } from "@/components/atoms/Shimmer";
import { StatusPill } from "@/components/atoms/StatusPill";
import { TextRow } from "@/components/atoms/TextRow";
import { Notice } from "@/harness/ui/Notice";
import { Switch } from "@/harness/ui/Switch";
import { getDesktopBridge } from "@/lib/desktop";

const PHASE_LABEL: Record<DesktopUpdateState["phase"], string> = {
  available: "更新あり",
  checking: "確認中",
  downloading: "ダウンロード",
  error: "失敗",
  idle: "待機",
  ready: "適用待ち",
  upToDate: "最新",
};

const PHASE_TONE: Record<
  DesktopUpdateState["phase"],
  "accent" | "green" | "neutral" | "orange"
> = {
  available: "accent",
  checking: "neutral",
  downloading: "accent",
  error: "orange",
  idle: "neutral",
  ready: "green",
  upToDate: "green",
};

export function DesktopUpdatePanel({
  apply,
  check,
  download,
  openRelease,
  setAutoUpdate,
  state,
}: {
  apply: () => Promise<void>;
  check: () => Promise<void>;
  download: () => Promise<void>;
  openRelease: () => Promise<void>;
  setAutoUpdate: (enabled: boolean) => Promise<void>;
  state: DesktopUpdateState;
}) {
  const busy = state.phase === "checking" || state.phase === "downloading";
  const applyLabel = state.canInstallInApp
    ? UPDATE_UI.applySigned
    : UPDATE_UI.applyUnsigned;
  const notice = updateConstraintNotice(state);

  return (
    <div className="flex flex-col gap-1">
      <TextRow
        label="バージョン"
        value={state.currentVersion}
        meta={getDesktopBridge()?.platform ?? state.platform}
      />
      <TextRow
        label="状態"
        value={
          <StatusPill tone={PHASE_TONE[state.phase]}>
            {PHASE_LABEL[state.phase]}
          </StatusPill>
        }
        meta={
          state.availableVersion ? `→ ${state.availableVersion}` : undefined
        }
      />
      <div className="text-ink-2 py-2 text-[13px] leading-relaxed">
        {busy ? <Shimmer>{state.message}</Shimmer> : state.message}
      </div>
      {state.phase === "downloading" && (
        <div
          aria-valuemax={100}
          aria-valuemin={0}
          aria-valuenow={state.downloadPercent ?? 0}
          className="bg-line mb-2 h-1.5 overflow-hidden rounded-full"
          role="progressbar"
        >
          <div
            className="bg-btn h-full transition-[width] duration-200"
            style={{ width: `${state.downloadPercent ?? 0}%` }}
          />
        </div>
      )}
      <div className="flex min-h-11 items-center justify-between gap-4 py-2">
        <div className="min-w-0">
          <div className="text-ink-2 text-sm">{UPDATE_UI.autoUpdate}</div>
          <div className="text-ink-3 mt-0.5 text-[12px] leading-relaxed">
            {UPDATE_UI.autoUpdateHint}
          </div>
        </div>
        <Switch
          checked={state.autoUpdateEnabled}
          disabled={busy}
          label={UPDATE_UI.autoUpdate}
          onCheckedChange={(enabled) => {
            void setAutoUpdate(enabled);
          }}
        />
      </div>
      {notice && (
        <Notice className="mt-1" tone="warn" title="未署名の配布">
          {notice}
        </Notice>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          disabled={busy}
          size="sm"
          variant="secondary"
          onClick={() => {
            void check();
          }}
        >
          <RefreshCw size={13} /> {UPDATE_UI.check}
        </Button>
        {state.phase === "available" && state.canDownload && (
          <Button
            disabled={busy}
            size="sm"
            variant="accent"
            onClick={() => {
              void download();
            }}
          >
            <Download size={13} /> {UPDATE_UI.updateNow}
          </Button>
        )}
        {state.phase === "ready" && (
          <Button
            size="sm"
            variant="accent"
            onClick={() => {
              void apply();
            }}
          >
            <ArrowUpCircle size={13} /> {applyLabel}
          </Button>
        )}
        <Button
          size="sm"
          variant="quiet"
          onClick={() => {
            void openRelease();
          }}
        >
          {UPDATE_UI.openReleases}
        </Button>
      </div>
    </div>
  );
}

export function DesktopUpdateFallback() {
  return (
    <div className="flex flex-col gap-3">
      <Notice tone="info" title="手動で更新">
        {UPDATE_UI.staleShell}
      </Notice>
      <div>
        <a
          className="text-accent text-[13px] underline-offset-2 hover:underline"
          href={DESKTOP_RELEASES_URL}
          rel="noopener noreferrer"
          target="_blank"
        >
          {UPDATE_UI.openReleases}
        </a>
      </div>
    </div>
  );
}

function updateConstraintNotice(state: DesktopUpdateState): string | null {
  if (state.canInstallInApp) {
    return null;
  }
  if (state.platform !== "darwin") {
    return UPDATE_UI.nonMacNotice;
  }
  if (!state.packaged) {
    return UPDATE_UI.unpackagedNotice;
  }
  return UPDATE_UI.unsignedNotice;
}
