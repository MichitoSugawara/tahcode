import type { WorkbenchPanelId } from "./panels";
import {
  DEFAULT_WORKBENCH_PANEL,
  isWorkbenchPanelId,
  WORKBENCH_PANEL_IDS,
} from "./panels";

export type WorkbenchTabsState = {
  active: WorkbenchPanelId | null;
  open: WorkbenchPanelId[];
};

export const DEFAULT_WORKBENCH_TABS: WorkbenchTabsState = {
  active: DEFAULT_WORKBENCH_PANEL,
  open: [DEFAULT_WORKBENCH_PANEL],
};

export function parseWorkbenchOpenTabs(raw: unknown): WorkbenchPanelId[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const seen = new Set<WorkbenchPanelId>();
  const open: WorkbenchPanelId[] = [];
  for (const item of raw) {
    if (!isWorkbenchPanelId(item) || seen.has(item)) {
      continue;
    }
    seen.add(item);
    open.push(item);
  }
  return open;
}

export function parseWorkbenchTabs(raw: unknown): WorkbenchTabsState {
  if (typeof raw === "string") {
    return isWorkbenchPanelId(raw)
      ? { active: raw, open: [raw] }
      : { ...DEFAULT_WORKBENCH_TABS, open: [...DEFAULT_WORKBENCH_TABS.open] };
  }
  if (Array.isArray(raw)) {
    const open = parseWorkbenchOpenTabs(raw);
    return { active: open.at(-1) ?? null, open };
  }
  if (raw && typeof raw === "object") {
    const record = raw as { active?: unknown; open?: unknown };
    const open = parseWorkbenchOpenTabs(record.open);
    const active =
      isWorkbenchPanelId(record.active) && open.includes(record.active)
        ? record.active
        : (open.at(-1) ?? null);
    return { active, open };
  }
  return {
    active: DEFAULT_WORKBENCH_TABS.active,
    open: [...DEFAULT_WORKBENCH_TABS.open],
  };
}

export function openWorkbenchTab(
  current: WorkbenchTabsState,
  id: WorkbenchPanelId
): WorkbenchTabsState {
  if (current.open.includes(id)) {
    return { active: id, open: current.open };
  }
  return { active: id, open: [...current.open, id] };
}

export function focusWorkbenchTab(
  current: WorkbenchTabsState,
  id: WorkbenchPanelId
): WorkbenchTabsState {
  if (!current.open.includes(id)) {
    return current;
  }
  return { active: id, open: current.open };
}

export function closeWorkbenchTab(
  current: WorkbenchTabsState,
  id: WorkbenchPanelId
): WorkbenchTabsState {
  const index = current.open.indexOf(id);
  if (index === -1) {
    return current;
  }
  const open = current.open.filter((item) => item !== id);
  if (open.length === 0) {
    return { active: null, open };
  }
  if (current.active !== id) {
    return { active: current.active, open };
  }
  return { active: open[index] ?? open[index - 1] ?? null, open };
}

export function shouldCollapseWorkbench(tabs: WorkbenchTabsState): boolean {
  return tabs.open.length === 0;
}

export function ensureWorkbenchTabs(
  current: WorkbenchTabsState
): WorkbenchTabsState {
  if (current.open.length > 0) {
    return current;
  }
  return {
    active: DEFAULT_WORKBENCH_TABS.active,
    open: [...DEFAULT_WORKBENCH_TABS.open],
  };
}

export function workbenchPickerIds(): WorkbenchPanelId[] {
  return [...WORKBENCH_PANEL_IDS];
}

export function cycleWorkbenchTab(
  open: WorkbenchPanelId[],
  current: WorkbenchPanelId | null,
  delta: number
): WorkbenchPanelId | null {
  if (open.length === 0) {
    return null;
  }
  const fallback = open[0];
  if (!fallback) {
    return null;
  }
  const index = current ? open.indexOf(current) : 0;
  const from = index === -1 ? 0 : index;
  const next = (from + delta + open.length) % open.length;
  return open[next] ?? fallback;
}
