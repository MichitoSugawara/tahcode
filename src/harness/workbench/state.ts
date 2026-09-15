import { useStoredState } from "@/lib/storage";

import type { WorkbenchPanelId } from "./panels";
import { DEFAULT_WORKBENCH_PANEL, resolveWorkbenchPanel } from "./panels";

export const WORKBENCH_DOCKED_KEY = "th:workbench:docked";
export const WORKBENCH_PANEL_KEY = "th:workbench:panel";
export const WORKBENCH_WIDTH_PX = 360;

export const DEFAULT_WORKBENCH_DOCKED = true;

export function parseWorkbenchDocked(raw: unknown): boolean {
  return typeof raw === "boolean" ? raw : DEFAULT_WORKBENCH_DOCKED;
}

export function parseWorkbenchPanel(raw: unknown): WorkbenchPanelId {
  return resolveWorkbenchPanel(typeof raw === "string" ? raw : null);
}

export function useWorkbenchDocked(): [boolean, (next: boolean) => void] {
  const [raw, setRaw] = useStoredState<unknown>(
    WORKBENCH_DOCKED_KEY,
    DEFAULT_WORKBENCH_DOCKED
  );
  const docked = parseWorkbenchDocked(raw);
  return [
    docked,
    (next: boolean) => {
      setRaw(next);
    },
  ];
}

export function useWorkbenchPanel(): [
  WorkbenchPanelId,
  (next: WorkbenchPanelId) => void,
] {
  const [raw, setRaw] = useStoredState<unknown>(
    WORKBENCH_PANEL_KEY,
    DEFAULT_WORKBENCH_PANEL
  );
  const panel = parseWorkbenchPanel(raw);
  return [
    panel,
    (next: WorkbenchPanelId) => {
      setRaw(next);
    },
  ];
}
