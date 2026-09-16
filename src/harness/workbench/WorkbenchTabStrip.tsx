import { Plus, X } from "lucide-react";
import type { KeyboardEvent, ReactNode } from "react";

import { isMiddleClickButton } from "@/harness/tabActions";

import type { WorkbenchPanelId } from "./panels";
import { WORKBENCH_PANELS } from "./panels";
import { cycleWorkbenchTab } from "./tabs";

export function workbenchTabButtonId(id: WorkbenchPanelId): string {
  return `workbench-tab-${id}`;
}

export function focusWorkbenchTabButton(id: WorkbenchPanelId): void {
  document.getElementById(workbenchTabButtonId(id))?.focus();
}

export function WorkbenchTab({
  active,
  icon,
  id,
  onClose,
  onSelect,
}: {
  active: boolean;
  icon: ReactNode;
  id: WorkbenchPanelId;
  onClose: () => void;
  onSelect: () => void;
}) {
  const item = WORKBENCH_PANELS[id];

  return (
    <div
      data-workbench-tab={id}
      className={`group/workbench-tab flex h-7 max-w-[8.5rem] shrink-0 items-center border-b pr-0.5 pl-1.5 ${
        active
          ? "border-ink text-ink"
          : "text-ink-3 hover:text-ink border-transparent"
      }`}
    >
      <button
        type="button"
        role="tab"
        id={workbenchTabButtonId(id)}
        aria-controls={`workbench-panel-${id}`}
        aria-selected={active}
        tabIndex={active ? 0 : -1}
        title={item.title}
        onClick={onSelect}
        onAuxClick={(event) => {
          if (!isMiddleClickButton(event.button)) {
            return;
          }
          event.preventDefault();
          onClose();
        }}
        onMouseDown={(event) => {
          if (isMiddleClickButton(event.button)) {
            event.preventDefault();
          }
        }}
        className="flex min-w-0 flex-1 items-center gap-1 text-left text-[11px] font-medium"
      >
        <span className="shrink-0">{icon}</span>
        <span className="truncate">{item.title}</span>
      </button>
      <button
        type="button"
        data-workbench-tab-close={id}
        aria-label={`${item.title}を閉じる`}
        tabIndex={-1}
        onClick={(event) => {
          event.stopPropagation();
          onClose();
        }}
        className="text-ink-3 hover:text-ink hover:bg-hover flex size-4 shrink-0 items-center justify-center rounded-[3px] opacity-0 transition-opacity duration-100 group-hover/workbench-tab:opacity-100"
      >
        <X size={10} strokeWidth={2.4} />
      </button>
    </div>
  );
}

export function WorkbenchTabStrip({
  active,
  icons,
  onCloseTab,
  onFocusTab,
  onOpenPicker,
  open,
}: {
  active: WorkbenchPanelId | null;
  icons: Record<WorkbenchPanelId, ReactNode>;
  onCloseTab: (id: WorkbenchPanelId) => void;
  onFocusTab: (id: WorkbenchPanelId) => void;
  onOpenPicker: (x: number, y: number) => void;
  open: WorkbenchPanelId[];
}) {
  const onTabListKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (open.length === 0) {
      return;
    }
    if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      event.preventDefault();
      const next = cycleWorkbenchTab(
        open,
        active,
        event.key === "ArrowRight" ? 1 : -1
      );
      if (next) {
        onFocusTab(next);
        focusWorkbenchTabButton(next);
      }
      return;
    }
    if (event.key === "Home") {
      event.preventDefault();
      const first = open[0];
      if (first) {
        onFocusTab(first);
        focusWorkbenchTabButton(first);
      }
      return;
    }
    if (event.key === "End") {
      event.preventDefault();
      const last = open.at(-1);
      if (last) {
        onFocusTab(last);
        focusWorkbenchTabButton(last);
      }
      return;
    }
    if (
      (event.key === "Delete" || event.key === "Backspace") &&
      active &&
      !event.metaKey &&
      !event.ctrlKey
    ) {
      event.preventDefault();
      onCloseTab(active);
    }
  };

  return (
    <div className="border-line flex h-7 shrink-0 items-center border-b">
      <div
        role="tablist"
        aria-label="開いているパネル"
        data-workbench-tablist
        tabIndex={0}
        onKeyDown={onTabListKeyDown}
        className="flex min-w-0 flex-1 [scrollbar-width:none] items-center overflow-x-auto [&::-webkit-scrollbar]:hidden"
      >
        {open.map((id) => (
          <WorkbenchTab
            key={id}
            id={id}
            active={id === active}
            icon={icons[id]}
            onClose={() => {
              onCloseTab(id);
            }}
            onSelect={() => {
              onFocusTab(id);
            }}
          />
        ))}
      </div>
      <button
        type="button"
        data-workbench-open-panel
        aria-haspopup="menu"
        aria-label="パネルを開く"
        title="パネルを開く"
        onClick={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          onOpenPicker(rect.left, rect.bottom + 4);
        }}
        className="text-ink-3 hover:text-ink hover:bg-hover flex size-7 shrink-0 items-center justify-center transition-colors duration-100"
      >
        <Plus size={13} strokeWidth={2.2} />
      </button>
    </div>
  );
}
