import { useMutation } from "convex/react";
import { Check, ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/atoms/Button";
import { Shimmer } from "@/components/atoms/Shimmer";
import { StatusPill } from "@/components/atoms/StatusPill";
import CodeBlock from "@/components/primitives/CodeBlock";
import LoadingState from "@/components/primitives/LoadingState";
import { PROVIDERS } from "@/lib/providers";
import { isLive, useOrg } from "@/harness/OrgContext";
import { Dialog, SectionLabel } from "@/harness/ui/Dialog";
import { InlineError, Input, Label } from "@/harness/ui/Field";
import { Notice } from "@/harness/ui/Notice";

/* ─────────────────────────────────────────────────────────
 * REGISTER RUNTIME — name this machine, receive a one-time
 * token, copy the commands, then watch the row flip to
 * online as the first heartbeat arrives. Ends with the
 * default-deny reminder and a shortcut to grant access.
 * ───────────────────────────────────────────────────────── */

function guessMachineName(): string {
  const ua = navigator.userAgent;
  const os = /Mac/.test(ua) ? "mac" : /Windows/.test(ua) ? "win" : /Linux/.test(ua) ? "linux" : "machine";
  return `${os}-${new Date().toISOString().slice(5, 10).replace("-", "")}`;
}

export function RegisterRuntimeDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { org, runtimes, now, setRuntimeId, openDialog } = useOrg();
  const register = useMutation(api.runtimes.register);
  const [name, setName] = useState(guessMachineName);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [issued, setIssued] = useState<{ runtimeId: Id<"runtimes">; token: string } | null>(null);

  useEffect(() => {
    if (open) {
      setIssued(null);
      setError(null);
      setName(guessMachineName());
    }
  }, [open]);

  const convexUrl = (import.meta.env.VITE_CONVEX_URL as string | undefined) ?? "<VITE_CONVEX_URL>";
  const runtime = issued ? runtimes?.find((item) => item._id === issued.runtimeId) : undefined;
  const live = runtime ? isLive(runtime, now) : false;
  const detected = runtime?.providers.filter((provider) => provider.available) ?? [];

  const lines = useMemo(
    () =>
      issued
        ? [
            "npm i -g dalecode",
            `dalecode link --url "${convexUrl}" --runtime "${String(issued.runtimeId)}" --token "${issued.token}" --name "${name.trim() || "machine"}"`,
            "dalecode start",
          ]
        : [],
    [issued, convexUrl, name],
  );

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={issued ? "このマシンで runtime を起動" : "マシンランタイムを登録"}
      description={
        issued
          ? "下の 3 行をエージェントを動かすマシンのターミナルで実行してください。dalecode CLI が Multica daemon を起動し、接続されるとこの画面が自動で更新されます。"
          : "エージェントはあなたのマシン上の Multica daemon 経由で動きます。登録すると一度だけ表示されるトークンと、dalecode CLI の起動コマンドが発行されます。"
      }
      width={560}
      footer={
        issued ? (
          <>
            <span className="text-[12px] text-ink-3">既定は default deny — 他のメンバーは許可されるまで使えません</span>
            <div className="flex items-center gap-1.5">
              <Button type="button" variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
                閉じる
              </Button>
              <Button
                type="button"
                variant="accent"
                size="sm"
                onClick={() => {
                  onOpenChange(false);
                  openDialog({ kind: "grant", runtimeId: issued.runtimeId });
                }}
              >
                <ShieldCheck size={13} /> アクセスを許可する
              </Button>
            </div>
          </>
        ) : (
          <>
            <span className="text-[12px] text-ink-3">{org.name} に登録されます</span>
            <div className="flex items-center gap-1.5">
              <Button type="button" variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
                キャンセル
              </Button>
              <Button type="submit" form="register-runtime" variant="accent" size="sm" disabled={!name.trim() || busy}>
                {busy ? "発行中…" : "トークンを発行"}
              </Button>
            </div>
          </>
        )
      }
    >
      {!issued ? (
        <form
          id="register-runtime"
          className="flex flex-col gap-4"
          onSubmit={async (event) => {
            event.preventDefault();
            if (!name.trim() || busy) return;
            setBusy(true);
            setError(null);
            try {
              const result = await register({ orgId: org._id, name: name.trim(), hostname: window.location.hostname });
              setIssued(result);
              setRuntimeId(result.runtimeId);
            } catch (e) {
              setError(e instanceof Error ? e.message : "登録に失敗しました");
            } finally {
              setBusy(false);
            }
          }}
        >
          <div>
            <Label hint="チームに見える名前">マシン名</Label>
            <Input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="例: office-mac" maxLength={60} />
          </div>
          <div className="rounded-card bg-inset p-3 shadow-hairline">
            <SectionLabel className="mb-1.5">起動前に必要なもの</SectionLabel>
            <ul className="flex flex-col gap-1 text-[12.5px] leading-relaxed text-ink-2">
              <li>· Node 20+ と <code className="rounded-[4px] bg-field px-1 font-mono text-[11.5px]">npm i -g dalecode</code></li>
              <li>
                · Multica CLI（未導入なら <code className="rounded-[4px] bg-field px-1 font-mono text-[11.5px]">dalecode install-multica</code> が案内）
              </li>
              <li>
                · いずれかのエージェント CLI にログイン済み:{" "}
                {Object.values(PROVIDERS)
                  .map((provider) => provider.binary)
                  .join(" / ")}
              </li>
            </ul>
          </div>
          {error && <InlineError>{error}</InlineError>}
        </form>
      ) : (
        <div className="flex flex-col gap-4" style={{ animation: "fade-up 300ms cubic-bezier(0.23,1,0.32,1) both" }}>
          <Notice tone="warn" title="トークンはこの画面を閉じると二度と表示されません">
            紛失した場合はランタイムを削除して登録し直してください。
          </Notice>

          <div>
            <SectionLabel>ターミナルで実行（dalecode CLI → Multica daemon）</SectionLabel>
            <CodeBlock fill variant="Code" filename="install-and-start.sh" lines={lines} code={lines.join("\n")} labels={{ copy: "コピー", copied: "コピーしました" }} />
            <p className="mt-1.5 text-[12px] leading-relaxed text-ink-3">
              困ったら <code className="rounded-[4px] bg-field px-1 font-mono text-[11px]">dalecode doctor</code>。状態は <code className="rounded-[4px] bg-field px-1 font-mono text-[11px]">dalecode status</code> / <code className="rounded-[4px] bg-field px-1 font-mono text-[11px]">dalecode logs -f</code>。
            </p>
          </div>

          <div className="flex min-h-9 items-center gap-3 rounded-card bg-inset px-3 py-2.5 shadow-hairline">
            {live ? (
              <>
                <span className="flex size-5 items-center justify-center rounded-full bg-green text-white" style={{ animation: "pop-in 300ms cubic-bezier(0.23,1,0.32,1) both" }}>
                  <Check size={12} strokeWidth={3} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-medium text-ink">{runtime?.name} が接続されました</div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[12px] text-ink-3">
                    {detected.length > 0 ? (
                      detected.map((provider) => (
                        <StatusPill key={provider.driverKind} tone="green" className="h-5 text-[11.5px]">
                          {PROVIDERS[provider.driverKind]?.label ?? provider.driverKind}
                          {provider.version ? ` ${provider.version}` : ""}
                        </StatusPill>
                      ))
                    ) : (
                      <Shimmer className="text-[12px]">エージェント CLI を検出しています</Shimmer>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <LoadingState label="最初のハートビートを待っています" variant="Dots" />
            )}
          </div>
        </div>
      )}
    </Dialog>
  );
}
