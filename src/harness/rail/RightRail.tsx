import { Check, Globe, MessageSquare, Monitor, Terminal } from "lucide-react";
import { useState } from "react";
import type { ReactNode } from "react";

import { ContextMenu } from "@/harness/ui/ContextMenu";
import { BrowserPane } from "@/harness/workbench/BrowserPane";
import type { WorkbenchPanelId } from "@/harness/workbench/panels";
import { WORKBENCH_PANELS } from "@/harness/workbench/panels";
import { RemotePane } from "@/harness/workbench/RemotePane";
import { SideChatPane } from "@/harness/workbench/SideChatPane";
import { useWorkbenchTabs } from "@/harness/workbench/state";
import { workbenchPickerIds } from "@/harness/workbench/tabs";
import { TerminalPane } from "@/harness/workbench/TerminalPane";
import { WorkbenchTabStrip } from "@/harness/workbench/WorkbenchTabStrip";

const PANEL_ICONS: Record<WorkbenchPanelId, ReactNode> = {
  browser: <Globe size={12} />,
  chat: <MessageSquare size={12} />,
  remote: <Monitor size={12} />,
  terminal: <Terminal size={12} />,
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

/** Closable verification workbench — open surfaces as real tabs, not a 4-way nav. */
export function RightRail({ onCollapse }: { onCollapse?: () => void }) {
  const tabs = useWorkbenchTabs();
  const [picker, setPicker] = useState<{ x: number; y: number } | null>(null);
  const current = tabs.active ? WORKBENCH_PANELS[tabs.active] : null;

  const closeTab = (id: WorkbenchPanelId) => {
    const next = tabs.closeTab(id);
    if (next.open.length === 0) {
      onCollapse?.();
    }
  };

  return (
    <div data-workbench className="flex min-h-0 flex-1 flex-col">
      <WorkbenchTabStrip
        active={tabs.active}
        icons={PANEL_ICONS}
        open={tabs.open}
        onCloseTab={closeTab}
        onFocusTab={tabs.setActive}
        onOpenPicker={(x, y) => {
          setPicker({ x, y });
        }}
      />
      {current && tabs.active && (
        <>
          <h2 className="sr-only">{current.title}</h2>
          <div
            role="tabpanel"
            id={`workbench-panel-${tabs.active}`}
            aria-labelledby={`workbench-tab-${tabs.active}`}
            data-workbench-panel={tabs.active}
            className="flex min-h-0 flex-1 flex-col"
          >
            <WorkbenchBody panel={tabs.active} />
          </div>
        </>
      )}
      {picker && (
        <ContextMenu
          header={
            <p
              data-workbench-panel-picker
              className="text-ink-3 px-2.5 pt-1 pb-1.5 text-[11px]"
            >
              パネルを開く
            </p>
          }
          items={workbenchPickerIds().map((id) => {
            const item = WORKBENCH_PANELS[id];
            const opened = tabs.open.includes(id);
            return {
              icon: opened ? <Check size={14} /> : PANEL_ICONS[id],
              key: id,
              label: item.title,
              onSelect: () => {
                tabs.openTab(id);
              },
            };
          })}
          x={picker.x}
          y={picker.y}
          onClose={() => {
            setPicker(null);
          }}
        />
      )}
    </div>
  );
}
