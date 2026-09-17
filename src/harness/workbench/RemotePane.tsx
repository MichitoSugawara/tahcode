import { screenRenderMode } from "@shared/workbenchScreen.ts";
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
import { ScreenFrame } from "./screen/ScreenFrame";
import { useWorkbenchMachine } from "./useWorkbenchMachine";
import { WorkbenchEmpty } from "./WorkbenchEmpty";

function remoteStage(input: {
  blurb: string;
  capturedAt?: number;
  error?: string;
  frameUrl?: string | null;
  hasScreen: boolean;
  now: number;
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
        リモートは接続中マシンの画面フレームを見る面です。
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
        error={input.error}
        frameUrl={input.frameUrl}
        now={input.now}
        stale={mode === "stale"}
      />
    );
  }
  return (
    <WorkbenchEmpty
      icon={<Monitor size={22} />}
      title="フレームはまだ届いていません"
      badge="フレーム待ち"
    >
      {input.blurb} 届いた JPEG / PNG
      だけを描画します。フレーム無しを接続済みにはしません。
    </WorkbenchEmpty>
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
  const [sessionId, setSessionId] = useState<Id<"screenSessions"> | null>(null);
  const sessionRef = useRef<Id<"screenSessions"> | null>(null);
  const session = useQuery(
    api.workbenchScreen.get,
    sessionId ? { sessionId } : "skip"
  );
  const meta = WORKBENCH_PANELS.remote;
  const canStop = Boolean(activeJob) && !stopping;
  const [now, setNow] = useState(() => Date.now());

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
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-line flex shrink-0 items-center justify-between gap-2 border-b px-3 py-2">
        <p className="text-ink-2 text-[12px]">リモートセッション</p>
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
          error: session?.error,
          frameUrl: session?.frameUrl,
          hasScreen: machine.hasScreen,
          now,
          online: machine.online,
        })}
      </div>
    </div>
  );
}
