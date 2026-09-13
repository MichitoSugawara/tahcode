import { posixShellQuote } from "@shared/shellQuote.ts";
import {
  displayHostname,
  fallbackRegisterCommands,
  guessBrowserMachineName,
} from "@tahcode/core/desktop";
import type {
  DesktopDoctorGuidance,
  RegisterProgressStep,
} from "@tahcode/core/desktop";
import { useMutation } from "convex/react";
import { Check, ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/atoms/Button";
import { Shimmer } from "@/components/atoms/Shimmer";
import { StatusPill } from "@/components/atoms/StatusPill";
import CodeBlock from "@/components/primitives/CodeBlock";
import LoadingState from "@/components/primitives/LoadingState";
import { isLive, useOrg } from "@/harness/OrgContext";
import type { Runtime } from "@/harness/OrgContext";
import { Dialog, SectionLabel } from "@/harness/ui/Dialog";
import { InlineError, Input, Label } from "@/harness/ui/Field";
import { Notice } from "@/harness/ui/Notice";
import {
  desktopCliStatusOrNull,
  desktopHostnameOrNull,
  getDesktopBridge,
  isDesktopShell,
  registerRuntimeCtaLabel,
} from "@/lib/desktop";
import { PROVIDERS } from "@/lib/providers";

import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

/* ─────────────────────────────────────────────────────────
 * REGISTER RUNTIME — name this machine, receive a one-time
 * token. In a browser the user copies 3 commands. In the
 * desktop shell, main runs tahcode link and restarts a
 * running bridge (or starts one) and this dialog waits
 * for the first heartbeat.
 * ───────────────────────────────────────────────────────── */

type Phase =
  | "form"
  | "registering"
  | "cli"
  | "restarting"
  | "starting"
  | "waiting";

function guessMachineName(): string {
  return guessBrowserMachineName(navigator.userAgent);
}

export function RegisterRuntimeDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { org, runtimes, now, setRuntimeId, openDialog } = useOrg();
  const register = useMutation(api.runtimes.register);
  const desktop = isDesktopShell();
  const [name, setName] = useState(guessMachineName);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("form");
  const [restartedBridge, setRestartedBridge] = useState(false);
  const [showFallback, setShowFallback] = useState(false);
  const [guidance, setGuidance] = useState<DesktopDoctorGuidance | null>(null);
  const [cliLabel, setCliLabel] = useState<string | null>(null);
  const [issued, setIssued] = useState<{
    runtimeId: Id<"runtimes">;
    token: string;
  } | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    setIssued(null);
    setError(null);
    setGuidance(null);
    setShowFallback(false);
    setPhase("form");
    setRestartedBridge(false);
    setBusy(false);
    setName(guessMachineName());
    if (!desktop) {
      return;
    }
    let cancelled = false;
    void desktopHostnameOrNull().then((hostname) => {
      if (cancelled || !hostname) {
        return;
      }
      setName(displayHostname(hostname) || guessMachineName());
    });
    void desktopCliStatusOrNull().then((status) => {
      if (cancelled || !status) {
        return;
      }
      if (status.available && status.version) {
        setCliLabel(
          status.path ? `${status.version}（${status.path}）` : status.version
        );
        return;
      }
      setCliLabel(
        status.npmAvailable
          ? "未検出 — 登録時に ~/.tahcode/npm へ入れます"
          : "未検出 — Node / npm を先に入れてください"
      );
    });
    return () => {
      cancelled = true;
    };
  }, [desktop, open]);

  const convexUrl =
    (import.meta.env.VITE_CONVEX_URL as string | undefined) ??
    "<VITE_CONVEX_URL>";
  const runtime = issued
    ? runtimes?.find((item) => item._id === issued.runtimeId)
    : undefined;
  const live = runtime ? isLive(runtime, now) : false;
  const detected =
    runtime?.providers.filter((provider) => provider.available) ?? [];

  const lines = useMemo(() => {
    if (!issued) {
      return [];
    }
    if (desktop) {
      return fallbackRegisterCommands({
        convexUrl,
        name: name.trim() || "machine",
        runtimeId: String(issued.runtimeId),
        token: issued.token,
      });
    }
    return [
      "npm i -g tahcode",
      `tahcode link --url ${posixShellQuote(convexUrl)} --runtime ${posixShellQuote(String(issued.runtimeId))} --token ${posixShellQuote(issued.token)} --name ${posixShellQuote(name.trim() || "machine")}`,
      "tahcode start",
    ];
  }, [convexUrl, desktop, issued, name]);

  const inProgress =
    phase === "registering" ||
    phase === "cli" ||
    phase === "restarting" ||
    phase === "starting";
  const showIssued = issued !== null && !inProgress;

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={
        desktop
          ? showIssued
            ? "この Mac を接続しています"
            : "この Mac を登録"
          : issued
            ? "このマシンで runtime を起動"
            : "マシンランタイムを登録"
      }
      description={
        desktop
          ? showIssued
            ? "この Mac の tahcode CLI を接続しました。ハートビートが届くとオンラインになります。"
            : "ワンクリックでこの Mac を org に登録し、tahcode CLI のブリッジを起動します。"
          : issued
            ? "下の 3 行をエージェントを動かすマシンのターミナルで実行してください。tahcode CLI がブリッジを起動し、接続されるとこの画面が自動で更新されます。"
            : "エージェントはあなたのマシン上の tahcode ブリッジ経由で動きます。登録すると一度だけ表示されるトークンと、tahcode CLI の起動コマンドが発行されます。"
      }
      width={560}
      footer={
        showIssued ? (
          <>
            <span className="text-ink-3 text-[12px]">
              あなたはこのマシンを使えます。他のメンバーへの許可は任意です
            </span>
            <div className="flex items-center gap-1.5">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  onOpenChange(false);
                  openDialog({ kind: "grant", runtimeId: issued.runtimeId });
                }}
              >
                <ShieldCheck size={13} /> 他のメンバーに許可
              </Button>
              <Button
                type="button"
                variant="accent"
                size="sm"
                onClick={() => onOpenChange(false)}
              >
                完了
              </Button>
            </div>
          </>
        ) : (
          <>
            <span className="text-ink-3 text-[12px]">
              {org.name} に登録されます
            </span>
            <div className="flex items-center gap-1.5">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onOpenChange(false)}
              >
                キャンセル
              </Button>
              <Button
                type="submit"
                form="register-runtime"
                variant="accent"
                size="sm"
                disabled={!name.trim() || busy}
              >
                {busy
                  ? phaseLabel(phase)
                  : desktop
                    ? registerRuntimeCtaLabel()
                    : "トークンを発行"}
              </Button>
            </div>
          </>
        )
      }
    >
      {inProgress ? (
        <ProgressView phase={phase} restartedBridge={restartedBridge} />
      ) : showIssued ? (
        <IssuedView
          desktop={desktop}
          detected={detected}
          error={error}
          guidance={guidance}
          lines={lines}
          live={live}
          restartedBridge={restartedBridge}
          runtimeName={runtime?.name}
          showCommands={!desktop || showFallback}
        />
      ) : (
        <form
          id="register-runtime"
          className="flex flex-col gap-4"
          onSubmit={async (event) => {
            event.preventDefault();
            if (!name.trim() || busy) {
              return;
            }
            setBusy(true);
            setError(null);
            setGuidance(null);
            setShowFallback(false);
            setPhase("registering");
            try {
              const hostname = desktop
                ? ((await desktopHostnameOrNull()) ?? window.location.hostname)
                : window.location.hostname;
              const result = await register({
                hostname,
                name: name.trim(),
                orgId: org._id,
              });
              setIssued(result);
              setRuntimeId(result.runtimeId);
              if (!desktop) {
                setPhase("waiting");
                return;
              }
              const bridge = getDesktopBridge();
              if (!bridge) {
                setShowFallback(true);
                setError(
                  "デスクトップ橋が見つかりません。下のコマンドをターミナルで実行してください。"
                );
                setPhase("waiting");
                return;
              }
              setPhase("cli");
              const linked = await bridge.registerLocalRuntime(
                {
                  convexUrl,
                  name: name.trim() || "machine",
                  runtimeId: String(result.runtimeId),
                  token: result.token,
                },
                (step) => {
                  if (step === "restarting-bridge") {
                    setRestartedBridge(true);
                  }
                  setPhase(phaseFromProgress(step));
                }
              );
              if (!linked.ok) {
                setError(linked.message);
                setGuidance(linked.guidance ?? null);
                setShowFallback(true);
                setPhase("waiting");
                return;
              }
              setRestartedBridge(linked.restartedBridge);
              setGuidance(linked.guidance ?? null);
              setPhase("waiting");
            } catch (caught) {
              setIssued(null);
              setPhase("form");
              setError(
                caught instanceof Error ? caught.message : "登録に失敗しました"
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          <div>
            <Label hint="チームに見える名前">マシン名</Label>
            <Input
              autoFocus
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="例: office-mac"
              maxLength={60}
            />
          </div>
          <div className="rounded-card bg-inset shadow-hairline p-3">
            <SectionLabel className="mb-1.5">起動前に必要なもの</SectionLabel>
            {desktop ? (
              <ul className="text-ink-2 flex flex-col gap-1 text-[12.5px] leading-relaxed">
                <li>
                  · tahcode CLI
                  {cliLabel ? ` — ${cliLabel}` : " をこのアプリが探します"}
                </li>
                <li>
                  · いずれかのエージェント CLI にログイン済み:{" "}
                  {Object.values(PROVIDERS)
                    .map((provider) => provider.binary)
                    .join(" / ")}
                </li>
              </ul>
            ) : (
              <ul className="text-ink-2 flex flex-col gap-1 text-[12.5px] leading-relaxed">
                <li>
                  · Node 20+ と{" "}
                  <code className="bg-field rounded-[4px] px-1 font-mono text-[11.5px]">
                    npm i -g tahcode
                  </code>
                </li>
                <li>
                  · いずれかのエージェント CLI にログイン済み:{" "}
                  {Object.values(PROVIDERS)
                    .map((provider) => provider.binary)
                    .join(" / ")}
                </li>
              </ul>
            )}
          </div>
          {error && <InlineError>{error}</InlineError>}
        </form>
      )}
    </Dialog>
  );
}

function phaseFromProgress(step: RegisterProgressStep): Phase {
  if (step === "restarting-bridge") {
    return "restarting";
  }
  if (step === "starting-bridge") {
    return "starting";
  }
  return "cli";
}

function phaseLabel(phase: Phase): string {
  if (phase === "cli") {
    return "CLI 準備…";
  }
  if (phase === "restarting") {
    return "ブリッジ再起動…";
  }
  if (phase === "starting") {
    return "ブリッジ起動…";
  }
  if (phase === "waiting") {
    return "接続待ち…";
  }
  return "登録中…";
}

function ProgressView({
  phase,
  restartedBridge,
}: {
  phase: Phase;
  restartedBridge: boolean;
}) {
  return (
    <div className="flex flex-col gap-4">
      <PhaseSteps current={phase} restartedBridge={restartedBridge} />
      <LoadingState label={phaseLabel(phase)} variant="Dots" />
    </div>
  );
}

function stepIndex(current: Phase): number {
  if (current === "registering") {
    return 0;
  }
  if (current === "cli") {
    return 1;
  }
  if (current === "restarting" || current === "starting") {
    return 2;
  }
  return 3;
}

function PhaseSteps({
  current,
  restartedBridge,
}: {
  current: Phase;
  restartedBridge: boolean;
}) {
  const bridgeLabel = restartedBridge ? "ブリッジ再起動" : "ブリッジ起動";
  const steps = [
    { id: "registering", label: "登録中" },
    { id: "cli", label: "CLI 準備" },
    { id: "bridge", label: bridgeLabel },
    { id: "waiting", label: "接続待ち" },
  ] as const;
  const currentIndex = stepIndex(current);
  return (
    <ol className="text-ink-3 flex flex-wrap items-center gap-1.5 text-[12px]">
      {steps.map((step, index) => (
        <li key={step.id} className="flex items-center gap-1.5">
          {index > 0 && <span aria-hidden="true">→</span>}
          <span
            className={
              index === currentIndex
                ? "text-ink font-medium"
                : index < currentIndex
                  ? "text-ink-2"
                  : undefined
            }
          >
            {step.label}
          </span>
        </li>
      ))}
    </ol>
  );
}

function IssuedView({
  desktop,
  detected,
  error,
  guidance,
  lines,
  live,
  restartedBridge,
  runtimeName,
  showCommands,
}: {
  desktop: boolean;
  detected: Runtime["providers"];
  error: string | null;
  guidance: DesktopDoctorGuidance | null;
  lines: string[];
  live: boolean;
  restartedBridge: boolean;
  runtimeName: string | undefined;
  showCommands: boolean;
}) {
  return (
    <div
      className="flex flex-col gap-4"
      style={{
        animation: "fade-up 300ms cubic-bezier(0.23,1,0.32,1) both",
      }}
    >
      {desktop && (
        <PhaseSteps current="waiting" restartedBridge={restartedBridge} />
      )}
      {error && <InlineError>{error}</InlineError>}
      {guidance && (
        <Notice tone="warn" title={guidance.title}>
          <p>{guidance.detail}</p>
          {guidance.commands.length > 0 && (
            <p className="mt-1.5">
              {guidance.commands.map((command, index) => (
                <span key={command}>
                  {index > 0 && " · "}
                  <code className="bg-field rounded-[4px] px-1 font-mono text-[11px]">
                    {command}
                  </code>
                </span>
              ))}
            </p>
          )}
        </Notice>
      )}
      {showCommands && (
        <>
          <Notice
            tone="warn"
            title="トークンはこの画面を閉じると二度と表示されません"
          >
            紛失した場合はランタイムを削除して登録し直してください。
          </Notice>
          <div>
            <SectionLabel>
              ターミナルで実行（tahcode CLI → ブリッジ）
            </SectionLabel>
            <CodeBlock
              fill
              variant="Code"
              filename="install-and-start.sh"
              lines={lines}
              code={lines.join("\n")}
              labels={{ copy: "コピー", copied: "コピーしました" }}
            />
            <p className="text-ink-3 mt-1.5 text-[12px] leading-relaxed">
              困ったら{" "}
              <code className="bg-field rounded-[4px] px-1 font-mono text-[11px]">
                tahcode doctor
              </code>
              。状態は{" "}
              <code className="bg-field rounded-[4px] px-1 font-mono text-[11px]">
                tahcode status
              </code>{" "}
              /{" "}
              <code className="bg-field rounded-[4px] px-1 font-mono text-[11px]">
                tahcode logs -f
              </code>
              。
            </p>
          </div>
        </>
      )}

      <div className="rounded-card bg-inset shadow-hairline flex min-h-9 items-center gap-3 px-3 py-2.5">
        {live ? (
          <>
            <span
              className="bg-green flex size-5 items-center justify-center rounded-full text-white"
              style={{
                animation: "pop-in 300ms cubic-bezier(0.23,1,0.32,1) both",
              }}
            >
              <Check size={12} strokeWidth={3} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-ink text-[13px] font-medium">
                {runtimeName} が接続されました
              </div>
              <div className="text-ink-3 mt-0.5 flex flex-wrap items-center gap-1.5 text-[12px]">
                {detected.length > 0 ? (
                  detected.map((provider) => (
                    <StatusPill
                      key={provider.driverKind}
                      tone="green"
                      className="h-5 text-[11.5px]"
                    >
                      {PROVIDERS[provider.driverKind]?.label ??
                        provider.driverKind}
                      {provider.version ? ` ${provider.version}` : ""}
                    </StatusPill>
                  ))
                ) : (
                  <Shimmer className="text-[12px]">
                    エージェント CLI を検出しています
                  </Shimmer>
                )}
              </div>
            </div>
          </>
        ) : (
          <LoadingState
            label={
              desktop
                ? "接続待ち — 最初のハートビート"
                : "最初のハートビートを待っています"
            }
            variant="Dots"
          />
        )}
      </div>
    </div>
  );
}
