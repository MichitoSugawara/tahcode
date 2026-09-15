import { Globe } from "lucide-react";

import { Input } from "@/harness/ui/Field";

import { MachineNeededAction, useOnlineMachine } from "./MachineNeeded";
import { WORKBENCH_PANELS } from "./panels";
import { WorkbenchEmpty } from "./WorkbenchEmpty";

export function BrowserPane() {
  const online = useOnlineMachine();
  const meta = WORKBENCH_PANELS.browser;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-line flex shrink-0 items-center gap-2 border-b px-3 py-2">
        <label className="sr-only" htmlFor="workbench-preview-url">
          プレビュー URL
        </label>
        <Input
          id="workbench-preview-url"
          disabled
          readOnly
          value=""
          placeholder="http://localhost:3000"
          className="h-8 font-mono text-[12px]"
        />
      </div>
      <div data-workbench-browser className="flex min-h-0 flex-1 flex-col">
        {online ? (
          <WorkbenchEmpty
            icon={<Globe size={22} />}
            title="プレビュー枠は用意済み"
          >
            {meta.next} アドレス欄は見た目だけです。ページはまだ開きません。
          </WorkbenchEmpty>
        ) : (
          <WorkbenchEmpty
            icon={<Globe size={22} />}
            title="オンラインのマシンが必要です"
            action={<MachineNeededAction />}
          >
            プレビューは接続中マシンのローカルサーバを見る面です。{meta.next}
          </WorkbenchEmpty>
        )}
      </div>
    </div>
  );
}
