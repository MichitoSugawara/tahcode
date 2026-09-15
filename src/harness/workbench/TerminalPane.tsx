import { Terminal } from "lucide-react";

import { MachineNeededAction, useOnlineMachine } from "./MachineNeeded";
import { WORKBENCH_PANELS } from "./panels";
import { WorkbenchEmpty } from "./WorkbenchEmpty";

export function TerminalPane() {
  const online = useOnlineMachine();
  const meta = WORKBENCH_PANELS.terminal;

  return (
    <div className="flex min-h-0 flex-1 flex-col p-3">
      <div
        data-workbench-terminal
        className="bg-inset shadow-hairline flex min-h-0 flex-1 flex-col overflow-hidden rounded-[10px]"
      >
        <div className="border-line text-ink-3 flex h-8 shrink-0 items-center gap-2 border-b px-3 font-mono text-[11px]">
          <Terminal size={12} />
          tahcode · terminal
          <span className="ml-auto">PTY 待ち</span>
        </div>
        {online ? (
          <div className="flex min-h-0 flex-1 flex-col px-3 py-2.5 font-mono text-[12px] leading-relaxed">
            <p className="text-ink-3">$</p>
            <p className="text-ink-2 mt-3 text-[12.5px] leading-relaxed">
              {meta.next}
              接続中のマシンはありますが、シェル入出力はまだ載せません。
            </p>
          </div>
        ) : (
          <WorkbenchEmpty
            icon={<Terminal size={22} />}
            title="オンラインのマシンが必要です"
            action={<MachineNeededAction />}
          >
            ターミナルは手元のランタイムに接続してから開きます。{meta.next}
          </WorkbenchEmpty>
        )}
      </div>
    </div>
  );
}
