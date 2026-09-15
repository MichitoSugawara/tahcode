import { Globe, MessageSquare, Monitor, Terminal, X } from "lucide-react";
import type { ReactNode } from "react";

import { BrowserPane } from "@/harness/workbench/BrowserPane";
import type { WorkbenchPanelId } from "@/harness/workbench/panels";
import {
  WORKBENCH_PANEL_IDS,
  WORKBENCH_PANELS,
} from "@/harness/workbench/panels";
import { RemotePane } from "@/harness/workbench/RemotePane";
import { SideChatPane } from "@/harness/workbench/SideChatPane";
import { useWorkbenchPanel } from "@/harness/workbench/state";
import { TerminalPane } from "@/harness/workbench/TerminalPane";

const PANEL_ICONS: Record<WorkbenchPanelId, ReactNode> = {
  browser: <Globe size={14} />,
  chat: <MessageSquare size={14} />,
  remote: <Monitor size={14} />,
  terminal: <Terminal size={14} />,
};

function WorkbenchBody({ panel }: { panel: WorkbenchPanelId }) {
  if (panel === "terminal") {
    return <TerminalPane />;
  }
  if (panel === "browser") {
    return <BrowserPane />;
  }
  if (panel === "remote") {
    return <RemotePane />;
  }
  return <SideChatPane />;
}

/** Closable verification workbench — not the old Context / Runtime / Team settings. */
export function RightRail({ onClose }: { onClose?: () => void }) {
  const [panel, setPanel] = useWorkbenchPanel();
  const current = WORKBENCH_PANELS[panel];

  return (
    <div data-workbench className="flex min-h-0 flex-1 flex-col">
      <div className="border-line flex h-11 shrink-0 items-center gap-1 border-b px-2">
        <div
          role="tablist"
          aria-label="検証ワークベンチ"
          className="flex min-w-0 flex-1 items-center gap-0.5"
        >
          {WORKBENCH_PANEL_IDS.map((id) => {
            const item = WORKBENCH_PANELS[id];
            const selected = id === panel;
            return (
              <button
                key={id}
                type="button"
                role="tab"
                data-workbench-tab={id}
                aria-selected={selected}
                title={item.title}
                onClick={() => setPanel(id)}
                className={`flex h-7 min-w-0 flex-1 items-center justify-center gap-1 rounded-[7px] px-1 text-[11px] font-medium transition-colors duration-100 ${
                  selected
                    ? "bg-hover-2 text-ink"
                    : "text-ink-3 hover:bg-hover hover:text-ink"
                }`}
              >
                <span className="shrink-0">{PANEL_ICONS[id]}</span>
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </div>
        {onClose && (
          <button
            type="button"
            aria-label="閉じる"
            onClick={onClose}
            className="text-ink-3 hover:bg-hover hover:text-ink flex size-6 shrink-0 items-center justify-center rounded-[6px] transition-colors duration-100"
          >
            <X size={13} strokeWidth={2.2} />
          </button>
        )}
      </div>
      <div className="border-line shrink-0 border-b px-3 py-2">
        <h2 className="text-ink text-[13px] font-medium">{current.title}</h2>
        <p className="text-ink-3 mt-0.5 text-[11.5px] leading-snug">
          {current.blurb}
        </p>
      </div>
      <div
        role="tabpanel"
        data-workbench-panel={panel}
        className="flex min-h-0 flex-1 flex-col"
        style={{ animation: "fade-in 160ms ease-out both" }}
      >
        <WorkbenchBody panel={panel} />
      </div>
    </div>
  );
}
