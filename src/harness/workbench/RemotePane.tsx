import {
  screenControlMode,
  screenRenderMode,
} from "@shared/workbenchScreen.ts";
import type { ScreenInputEvent } from "@shared/workbenchScreen.ts";
import { useMutation, useQuery } from "convex/react";
import { Monitor, Square } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

import { Button } from "@/components/atoms/Button";
import { useCancelJob } from "@/harness/Composer";

import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { BridgeUpdateAction, MachineNeededAction } from "./MachineNeeded";
import { WORKBENCH_PANELS } from "./panels";
import { AgentScreenConnecting, ScreenFrame } from "./screen/ScreenFrame";
import { useWorkbenchMachine } from "./useWorkbenchMachine";
import { WorkbenchEmpty } from "./WorkbenchEmpty";

function TrafficLights() {
  return (
    <span className="flex items-center gap-1" aria-hidden>
      <span className="bg-red size-2 rounded-full" />
      <span className="bg-orange size-2 rounded-full" />
      <span className="bg-green size-2 rounded-full" />
    </span>
  );
}

function remoteStage(input: {
  blurb: string;
  capturedAt?: number;
  control: ReturnType<typeof screenControlMode>;
  error?: string;
  frameUrl?: string | null;
  hasScreen: boolean;
  now: number;
  onInput?: (event: ScreenInputEvent) => void;
  online: boolean;
}): ReactNode {
  const mode = screenRenderMode({
    capturedAt: input.capturedAt,
    error: input.error,
    frameUrl: input.frameUrl,
    hasScreen: input.hasScreen,
    now: input.now,
    online: input.online,
  });
  if (mode === "offline") {
    return (
      <WorkbenchEmpty
        icon={<Monitor size={22} />}
        title="オンラインのマシンが必要です"
        badge="マシンが必要"
        action={<MachineNeededAction />}
      >
        リモートは接続中マシンの画面を見て操作する面です。
      </WorkbenchEmpty>
    );
  }
  if (mode === "upgrade") {
    return (
      <WorkbenchEmpty
        icon={<Monitor size={22} />}
        title="ブリッジを更新してください"
        badge="screen 未対応"
        action={<BridgeUpdateAction />}
      >
        このマシンの tahcode は画面フレーム能力をまだ報告していません。`npm i -g
        tahcode@latest && tahcode restart`
      </WorkbenchEmpty>
    );
  }
  if (mode === "error") {
    return (
      <WorkbenchEmpty
        icon={<Monitor size={22} />}
        title="画面を撮れませんでした"
        badge="キャプチャ失敗"
      >
        {input.error ??
          "マシン側でフレームを作れませんでした。画面収録の許可を確認してください。"}
      </WorkbenchEmpty>
    );
  }
  if ((mode === "frame" || mode === "stale") && input.frameUrl) {
    return (
      <ScreenFrame
        capturedAt={input.capturedAt}
        control={input.control}
        error={input.error}
        frameUrl={input.frameUrl}
        now={input.now}
        onInput={input.onInput}
        stale={mode === "stale"}
      />
    );
  }
  return (
    <div className="bg-inset flex min-h-0 flex-1 flex-col p-2 pt-0">
      <AgentScreenConnecting />
      <p className="text-ink-3 px-1 pt-1.5 text-[11px]">
        {input.blurb} フレームが届くまで接続済みにはしません。
      </p>
    </div>
  );
}

export function RemotePane() {
  const machine = useWorkbenchMachine();
  const { cancel, stopping } = useCancelJob();
  const activeJob = useQuery(
    api.jobs.activeForChat,
    machine.chatId ? { chatId: machine.chatId as Id<"chats"> } : "skip"
  );
  const open = useMutation(api.workbenchScreen.open);
  const close = useMutation(api.workbenchScreen.close);
  const enqueueInput = useMutation(api.workbenchScreen.enqueueInput);
  const [sessionId, setSessionId] = useState<Id<"screenSessions"> | null>(null);
  const sessionRef = useRef<Id<"screenSessions"> | null>(null);
  const session = useQuery(
    api.workbenchScreen.get,
    sessionId ? { sessionId } : "skip"
  );
  const meta = WORKBENCH_PANELS.remote;
  const canStop = Boolean(activeJob) && !stopping;
  const [now, setNow] = useState(() => Date.now());
  const mode = screenRenderMode({
    capturedAt: session?.capturedAt,
    error: session?.error,
    frameUrl: session?.frameUrl,
    hasScreen: machine.hasScreen,
    now,
    online: machine.online,
  });
  const control = screenControlMode({
    hasScreenInput: machine.hasScreenInput,
    mode,
  });

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => {
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (!machine.runtime || !machine.hasScreen) {
      setSessionId(null);
      sessionRef.current = null;
      return;
    }
    let cancelled = false;
    void open({
      chatId: machine.chatId ? (machine.chatId as Id<"chats">) : undefined,
      runtimeId: machine.runtime._id,
    }).then((id) => {
      if (cancelled) {
        void close({ sessionId: id });
        return;
      }
      sessionRef.current = id;
      setSessionId(id);
    });
    return () => {
      cancelled = true;
      const current = sessionRef.current;
      sessionRef.current = null;
      if (current) {
        void close({ sessionId: current });
      }
    };
  }, [close, machine.chatId, machine.hasScreen, machine.runtime, open]);

  return (
    <div
      data-workbench-agent-screen
      className="bg-surface flex min-h-0 flex-1 flex-col"
    >
      <div className="flex h-11 shrink-0 items-center justify-between gap-3 px-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <TrafficLights />
          <p className="text-ink truncate text-[13px] font-semibold">
            {machine.runtime?.name ?? "リモート"}
          </p>
          {mode === "frame" ? (
            <span className="bg-green-tint text-green inline-flex shrink-0 items-center gap-1.5 rounded-full py-0.5 pr-2 pl-1.5 text-[11.5px] font-medium">
              <span className="bg-green size-2 rounded-full" />
              ライブ
            </span>
          ) : null}
          {mode === "waiting" ? (
            <span className="text-ink-3 bg-inset inline-flex shrink-0 items-center gap-1.5 rounded-full py-0.5 pr-2 pl-1.5 text-[11.5px] font-medium">
              フレーム待ち
            </span>
          ) : null}
          {control === "view" ? (
            <span className="text-orange bg-orange-tint inline-flex shrink-0 items-center gap-1.5 rounded-full py-0.5 pr-2 pl-1.5 text-[11.5px] font-medium">
              操作は要更新
            </span>
          ) : null}
        </div>
        <Button
          type="button"
          size="xs"
          variant="danger"
          disabled={!canStop}
          aria-label="実行中ジョブを停止"
          title={
            activeJob
              ? "このチャットの実行中ジョブを停止"
              : "停止できるジョブがありません"
          }
          onClick={() => {
            if (!activeJob) {
              return;
            }
            void cancel(activeJob._id);
          }}
        >
          <Square size={10} fill="currentColor" />
          停止
        </Button>
      </div>
      <div data-workbench-remote className="flex min-h-0 flex-1 flex-col">
        {remoteStage({
          blurb: meta.blurb,
          capturedAt: session?.capturedAt,
          control,
          error: session?.error,
          frameUrl: session?.frameUrl,
          hasScreen: machine.hasScreen,
          now,
          onInput:
            sessionId && control === "control"
              ? (event) => {
                  void enqueueInput({ events: [event], sessionId });
                }
              : undefined,
          online: machine.online,
        })}
      </div>
    </div>
  );
}
