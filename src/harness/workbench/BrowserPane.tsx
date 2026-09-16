import { useMutation, useQuery } from "convex/react";
import { Globe } from "lucide-react";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";

import { Button } from "@/components/atoms/Button";
import { Input } from "@/harness/ui/Field";

import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { BridgeUpdateAction, MachineNeededAction } from "./MachineNeeded";
import { WORKBENCH_PANELS } from "./panels";
import { previewNavigateInput } from "./preview/openPreviewSession";
import { PreviewFrame } from "./preview/PreviewFrame";
import { useWorkbenchMachine } from "./useWorkbenchMachine";
import { WorkbenchEmpty } from "./WorkbenchEmpty";

function browserStage(input: {
  blurb: string;
  hasPreview: boolean;
  localError: string | null;
  online: boolean;
  session:
    | {
        body?: string;
        contentType?: string;
        error?: string;
        status: "failed" | "idle" | "loading" | "success";
        url: string;
      }
    | null
    | undefined;
}): ReactNode {
  if (!input.online) {
    return (
      <WorkbenchEmpty
        icon={<Globe size={22} />}
        title="オンラインのマシンが必要です"
        badge="マシンが必要"
        action={<MachineNeededAction />}
      >
        プレビューは接続中マシンのローカルサーバを見る面です。
      </WorkbenchEmpty>
    );
  }
  if (!input.hasPreview) {
    return (
      <WorkbenchEmpty
        icon={<Globe size={22} />}
        title="ブリッジを更新してください"
        badge="preview 未対応"
        action={<BridgeUpdateAction />}
      >
        このマシンの tahcode はプレビュー能力をまだ報告していません。`npm i -g
        tahcode@latest && tahcode restart`
      </WorkbenchEmpty>
    );
  }
  if (!input.session || input.session.status === "idle") {
    return (
      <WorkbenchEmpty
        icon={<Globe size={22} />}
        title="URL を開く"
        badge="プレビュー"
      >
        {input.blurb} localhost はマシン側で取得し、この面に描画します。
      </WorkbenchEmpty>
    );
  }
  return (
    <PreviewFrame
      body={input.session.body}
      contentType={input.session.contentType}
      error={input.localError ?? input.session.error}
      status={input.session.status}
      url={input.session.url}
    />
  );
}

export function BrowserPane() {
  const machine = useWorkbenchMachine();
  const meta = WORKBENCH_PANELS.browser;
  const open = useMutation(api.workbenchPreview.open);
  const navigate = useMutation(api.workbenchPreview.navigate);
  const [sessionId, setSessionId] = useState<Id<"previewSessions"> | null>(
    null
  );
  const [draft, setDraft] = useState("http://localhost:3000");
  const [localError, setLocalError] = useState<string | null>(null);
  const session = useQuery(
    api.workbenchPreview.get,
    sessionId ? { sessionId } : "skip"
  );

  useEffect(() => {
    if (!machine.runtime || !machine.hasPreview) {
      setSessionId(null);
      return;
    }
    let cancelled = false;
    void open({
      chatId: machine.chatId ? (machine.chatId as Id<"chats">) : undefined,
      runtimeId: machine.runtime._id,
    }).then((id) => {
      if (!cancelled) {
        setSessionId(id);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [machine.chatId, machine.hasPreview, machine.runtime, open]);

  useEffect(() => {
    if (session?.url) {
      setDraft(session.url);
    }
  }, [session?.url]);

  const go = () => {
    if (!sessionId) {
      return;
    }
    const parsed = previewNavigateInput(draft);
    if (!parsed.ok) {
      setLocalError(parsed.error);
      return;
    }
    setLocalError(null);
    void navigate({ sessionId, url: parsed.url });
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-line flex shrink-0 items-center gap-1.5 border-b px-2 py-1">
        <label className="sr-only" htmlFor="workbench-preview-url">
          プレビュー URL
        </label>
        <Input
          id="workbench-preview-url"
          value={draft}
          disabled={!machine.online || !machine.hasPreview}
          placeholder="http://localhost:3000"
          className="h-7 font-mono text-[12px]"
          onChange={(event) => {
            setDraft(event.target.value);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              go();
            }
          }}
        />
        <Button
          type="button"
          size="xs"
          variant="accent"
          disabled={!machine.online || !machine.hasPreview || !sessionId}
          onClick={go}
        >
          開く
        </Button>
      </div>
      <div data-workbench-browser className="flex min-h-0 flex-1 flex-col">
        {browserStage({
          blurb: meta.blurb,
          hasPreview: machine.hasPreview,
          localError,
          online: machine.online,
          session,
        })}
      </div>
    </div>
  );
}
