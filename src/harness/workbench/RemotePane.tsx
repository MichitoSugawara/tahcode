import { useQuery } from "convex/react";
import { Monitor, Square } from "lucide-react";
import { useParams } from "react-router-dom";

import { Button } from "@/components/atoms/Button";
import { useCancelJob } from "@/harness/Composer";
import { Notice } from "@/harness/ui/Notice";

import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { MachineNeededAction, useOnlineMachine } from "./MachineNeeded";
import { WORKBENCH_PANELS } from "./panels";
import { WorkbenchEmpty } from "./WorkbenchEmpty";

export function RemotePane() {
  const { chatId } = useParams();
  const online = useOnlineMachine();
  const { cancel, stopping } = useCancelJob();
  const activeJob = useQuery(
    api.jobs.activeForChat,
    chatId ? { chatId: chatId as Id<"chats"> } : "skip"
  );
  const meta = WORKBENCH_PANELS.remote;
  const canStop = Boolean(activeJob) && !stopping;

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
      <div className="px-3 pt-2.5">
        <Notice tone="info" title="画面共有は未接続">
          {meta.next}
        </Notice>
      </div>
      <div data-workbench-remote className="flex min-h-0 flex-1 flex-col">
        {online ? (
          <WorkbenchEmpty
            icon={<Monitor size={22} />}
            title="リモートデスクトップ枠"
          >
            マシン画面はまだ流れません。実行中ジョブがあれば上の停止で中断できます（本線
            Composer と同じ TAH-13）。
          </WorkbenchEmpty>
        ) : (
          <WorkbenchEmpty
            icon={<Monitor size={22} />}
            title="オンラインのマシンが必要です"
            action={<MachineNeededAction />}
          >
            リモートセッションは接続中のマシン画面を見る面です。{meta.next}
          </WorkbenchEmpty>
        )}
      </div>
    </div>
  );
}
