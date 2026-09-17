import { useMutation, useQuery } from "convex/react";
import { Terminal } from "lucide-react";
import { useEffect, useState } from "react";

import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { BridgeUpdateAction, MachineNeededAction } from "./MachineNeeded";
import { WORKBENCH_PANELS } from "./panels";
import { previewNavigateInput } from "./preview/openPreviewSession";
import { useWorkbenchPanel } from "./state";
import { FallbackTerminal } from "./terminal/FallbackTerminal";
import { GhosttySurface } from "./terminal/GhosttySurface";
import { useWorkbenchMachine } from "./useWorkbenchMachine";
import { WorkbenchEmpty } from "./WorkbenchEmpty";

export function TerminalPane() {
  const machine = useWorkbenchMachine();
  const meta = WORKBENCH_PANELS.terminal;
  const [, setPanel] = useWorkbenchPanel();
  const open = useMutation(api.workbenchPty.open);
  const write = useMutation(api.workbenchPty.write);
  const resize = useMutation(api.workbenchPty.resize);
  const navigatePreview = useMutation(api.workbenchPreview.navigate);
  const openPreview = useMutation(api.workbenchPreview.open);
  const [sessionId, setSessionId] = useState<Id<"ptySessions"> | null>(null);
  const [ghosttyFailed, setGhosttyFailed] = useState(false);
  const session = useQuery(
    api.workbenchPty.get,
    sessionId ? { sessionId } : "skip"
  );

  useEffect(() => {
    if (!machine.runtime || !machine.hasPty) {
      setSessionId(null);
      return;
    }
    let cancelled = false;
    void open({
      chatId: machine.chatId ? (machine.chatId as Id<"chats">) : undefined,
      cwd: machine.cwd,
      runtimeId: machine.runtime._id,
    }).then((id) => {
      if (!cancelled) {
        setSessionId(id);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [machine.chatId, machine.cwd, machine.hasPty, machine.runtime, open]);

  const send = (data: string) => {
    if (!sessionId || data.length === 0) {
      return;
    }
    void write({ data, sessionId });
  };

  const openLink = (href: string) => {
    const parsed = previewNavigateInput(href);
    if (!parsed.ok || !machine.runtime || !machine.hasPreview) {
      return;
    }
    void openPreview({
      chatId: machine.chatId ? (machine.chatId as Id<"chats">) : undefined,
      runtimeId: machine.runtime._id,
      url: parsed.url,
    }).then(async (id) => {
      await navigatePreview({ sessionId: id, url: parsed.url });
      setPanel("browser");
    });
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        data-workbench-terminal
        className="bg-inset flex min-h-0 flex-1 flex-col overflow-hidden"
      >
        <div className="border-line text-ink-3 flex h-8 shrink-0 items-center gap-2 border-b px-3 font-mono text-[11px]">
          <Terminal size={12} />
          tahcode · terminal
          <span className="ml-auto truncate">
            {session?.label ?? (machine.online ? "接続中" : "オフライン")}
          </span>
        </div>
        {machine.online ? (
          machine.hasPty ? (
            <div className="flex min-h-0 flex-1 flex-col">
              {ghosttyFailed ? (
                <FallbackTerminal
                  disabled={session?.status !== "running"}
                  history={session?.history ?? ""}
                  onData={send}
                />
              ) : (
                <GhosttySurface
                  disabled={session?.status !== "running"}
                  history={session?.history ?? ""}
                  onData={send}
                  onFail={() => {
                    setGhosttyFailed(true);
                  }}
                  onLink={openLink}
                  onResize={(cols, rows) => {
                    if (!sessionId) {
                      return;
                    }
                    void resize({ cols, rows, sessionId });
                  }}
                />
              )}
              {session?.status === "starting" && (
                <p className="text-ink-3 px-3 py-1 font-mono text-[11px]">
                  PTY を起動しています…
                </p>
              )}
              {session?.error && (
                <p className="text-ink-2 px-3 py-1 text-[11.5px]">
                  {session.error}
                </p>
              )}
              <p className="sr-only">{meta.blurb}</p>
            </div>
          ) : (
            <WorkbenchEmpty
              icon={<Terminal size={22} />}
              title="ブリッジを更新してください"
              badge="pty 未対応"
              action={<BridgeUpdateAction />}
            >
              このマシンの tahcode はターミナル能力をまだ報告していません。`npm
              i -g tahcode@latest && tahcode restart`
            </WorkbenchEmpty>
          )
        ) : (
          <WorkbenchEmpty
            icon={<Terminal size={22} />}
            title="オンラインのマシンが必要です"
            badge="マシンが必要"
            action={<MachineNeededAction />}
          >
            ターミナルは手元のランタイムに接続してから開きます。
          </WorkbenchEmpty>
        )}
      </div>
    </div>
  );
}
