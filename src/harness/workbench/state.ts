import { createContext, createElement, useContext, useMemo } from "react";
import type { ReactNode } from "react";
import { useParams } from "react-router-dom";

import { useStoredState } from "@/lib/storage";

import type { WorkbenchPanelId } from "./panels";
import { DEFAULT_WORKBENCH_PANEL, resolveWorkbenchPanel } from "./panels";
import type { WorkbenchTabsState } from "./tabs";
import {
  closeWorkbenchTab,
  DEFAULT_WORKBENCH_TABS,
  ensureWorkbenchTabs,
  focusWorkbenchTab,
  openWorkbenchTab,
  parseWorkbenchTabs,
} from "./tabs";

/** Legacy global keys — still read when a scoped key is missing. */
export const WORKBENCH_DOCKED_KEY = "th:workbench:docked";
export const WORKBENCH_PANEL_KEY = "th:workbench:panel";
export const WORKBENCH_TABS_KEY = "th:workbench:tabs";
export const WORKBENCH_WIDTH_KEY = "th:workbench:width";

export const WORKBENCH_HOME_SCOPE = "home";
/** Fallback px used only to interpret legacy stored widths. */
export const WORKBENCH_WIDTH_PX = 360;
export const WORKBENCH_WIDTH_MIN_PX = 280;
export const WORKBENCH_WIDTH_NUDGE_PX = 16;
export const WORKBENCH_RATIO_DEFAULT = 0.36;
export const WORKBENCH_RATIO_MIN = 0.22;
export const WORKBENCH_RATIO_MAX = 0.52;
/** Assumed chat+rail width when converting a legacy absolute px store. */
export const WORKBENCH_RATIO_REFERENCE_PX = 1000;

/** @deprecated Use WORKBENCH_RATIO_MAX against the live row width. */
export const WORKBENCH_WIDTH_MAX_PX = Math.round(
  WORKBENCH_RATIO_REFERENCE_PX * WORKBENCH_RATIO_MAX
);

export const DEFAULT_WORKBENCH_DOCKED = true;

export function workbenchScope(chatId?: string | null): string {
  if (typeof chatId !== "string") {
    return WORKBENCH_HOME_SCOPE;
  }
  const trimmed = chatId.trim();
  return trimmed.length > 0 ? trimmed : WORKBENCH_HOME_SCOPE;
}

export function workbenchDockedKey(chatId?: string | null): string {
  return `${WORKBENCH_DOCKED_KEY}:${workbenchScope(chatId)}`;
}

export function workbenchPanelKey(chatId?: string | null): string {
  return `${WORKBENCH_PANEL_KEY}:${workbenchScope(chatId)}`;
}

export function workbenchTabsKey(chatId?: string | null): string {
  return `${WORKBENCH_TABS_KEY}:${workbenchScope(chatId)}`;
}

export function workbenchWidthKey(chatId?: string | null): string {
  return `${WORKBENCH_WIDTH_KEY}:${workbenchScope(chatId)}`;
}

export function parseWorkbenchStoredRaw(
  scopedRaw: string | null,
  legacyRaw: string | null
): unknown {
  for (const raw of [scopedRaw, legacyRaw]) {
    if (raw === null) {
      continue;
    }
    try {
      return JSON.parse(raw) as unknown;
    } catch {
      continue;
    }
  }
  return undefined;
}

function readLocalRaw(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function readWorkbenchPreference(
  scopedKey: string,
  legacyKey: string
): unknown {
  return parseWorkbenchStoredRaw(
    readLocalRaw(scopedKey),
    readLocalRaw(legacyKey)
  );
}

export function parseWorkbenchDocked(raw: unknown): boolean {
  return typeof raw === "boolean" ? raw : DEFAULT_WORKBENCH_DOCKED;
}

export function parseWorkbenchPanel(raw: unknown): WorkbenchPanelId {
  return resolveWorkbenchPanel(typeof raw === "string" ? raw : null);
}

export function readWorkbenchTabsState(
  chatId?: string | null
): WorkbenchTabsState {
  const scopedTabs = parseWorkbenchStoredRaw(
    readLocalRaw(workbenchTabsKey(chatId)),
    null
  );
  if (scopedTabs !== undefined) {
    return parseWorkbenchTabs(scopedTabs);
  }
  const legacyPanel = readWorkbenchPreference(
    workbenchPanelKey(chatId),
    WORKBENCH_PANEL_KEY
  );
  if (legacyPanel !== undefined) {
    return parseWorkbenchTabs(legacyPanel);
  }
  return {
    active: DEFAULT_WORKBENCH_TABS.active,
    open: [...DEFAULT_WORKBENCH_TABS.open],
  };
}

export function clampWorkbenchRatio(raw: unknown): number {
  const value = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(value)) {
    return WORKBENCH_RATIO_DEFAULT;
  }
  return Math.min(WORKBENCH_RATIO_MAX, Math.max(WORKBENCH_RATIO_MIN, value));
}

/** Number in (0, 1] is a ratio. Number > 1 is a legacy absolute px width. */
export function parseWorkbenchRatio(
  raw: unknown,
  available = WORKBENCH_RATIO_REFERENCE_PX
): number {
  if (raw && typeof raw === "object" && "ratio" in raw) {
    return clampWorkbenchRatio(raw.ratio);
  }
  const value = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(value)) {
    return WORKBENCH_RATIO_DEFAULT;
  }
  if (value > 0 && value <= 1) {
    return clampWorkbenchRatio(value);
  }
  const span = Math.max(1, available);
  return clampWorkbenchRatio(value / span);
}

export function workbenchWidthFromRatio(
  ratio: number,
  available: number
): number {
  const span = Math.max(1, available);
  const maxPx = Math.max(
    WORKBENCH_WIDTH_MIN_PX,
    Math.round(span * WORKBENCH_RATIO_MAX)
  );
  const minPx = Math.min(WORKBENCH_WIDTH_MIN_PX, maxPx);
  return Math.min(
    maxPx,
    Math.max(minPx, Math.round(span * clampWorkbenchRatio(ratio)))
  );
}

export function workbenchRatioFromWidth(
  width: number,
  available: number
): number {
  const span = Math.max(1, available);
  return clampWorkbenchRatio(width / span);
}

export function clampWorkbenchWidth(
  raw: unknown,
  available = WORKBENCH_RATIO_REFERENCE_PX
): number {
  return workbenchWidthFromRatio(
    parseWorkbenchRatio(raw, available),
    available
  );
}

function useWorkbenchChatId(): string | undefined {
  const { chatId } = useParams();
  return chatId;
}

export function useWorkbenchDocked(): [boolean, (next: boolean) => void] {
  const chatId = useWorkbenchChatId();
  const key = workbenchDockedKey(chatId);
  const inherited = parseWorkbenchDocked(
    readWorkbenchPreference(key, WORKBENCH_DOCKED_KEY)
  );
  const [raw, setRaw] = useStoredState<unknown>(key, inherited);
  const docked = parseWorkbenchDocked(raw);
  return [
    docked,
    (next: boolean) => {
      setRaw(next);
    },
  ];
}

export type WorkbenchTabsApi = {
  active: WorkbenchPanelId | null;
  closeTab: (id: WorkbenchPanelId) => WorkbenchTabsState;
  ensureOpen: () => WorkbenchTabsState;
  open: WorkbenchPanelId[];
  openTab: (id: WorkbenchPanelId) => WorkbenchTabsState;
  setActive: (id: WorkbenchPanelId) => WorkbenchTabsState;
};

const WorkbenchTabsContext = createContext<WorkbenchTabsApi | null>(null);

export function WorkbenchTabsProvider({ children }: { children: ReactNode }) {
  const chatId = useWorkbenchChatId();
  const key = workbenchTabsKey(chatId);
  const inherited = readWorkbenchTabsState(chatId);
  const [raw, setRaw] = useStoredState<unknown>(key, inherited);
  const tabs = parseWorkbenchTabs(raw);

  const value = useMemo<WorkbenchTabsApi>(() => {
    const commit = (next: WorkbenchTabsState): WorkbenchTabsState => {
      setRaw(next);
      return next;
    };
    return {
      active: tabs.active,
      closeTab: (id: WorkbenchPanelId) => commit(closeWorkbenchTab(tabs, id)),
      ensureOpen: () => commit(ensureWorkbenchTabs(tabs)),
      open: tabs.open,
      openTab: (id: WorkbenchPanelId) => commit(openWorkbenchTab(tabs, id)),
      setActive: (id: WorkbenchPanelId) => commit(focusWorkbenchTab(tabs, id)),
    };
  }, [setRaw, tabs]);

  return createElement(WorkbenchTabsContext.Provider, { value }, children);
}

export function useWorkbenchTabs(): WorkbenchTabsApi {
  const ctx = useContext(WorkbenchTabsContext);
  if (!ctx) {
    throw new Error("useWorkbenchTabs requires WorkbenchTabsProvider");
  }
  return ctx;
}

/** Opens or focuses a surface. Used by Terminal link → Browser. */
export function useWorkbenchPanel(): [
  WorkbenchPanelId,
  (next: WorkbenchPanelId) => void,
] {
  const { active, openTab } = useWorkbenchTabs();
  return [active ?? DEFAULT_WORKBENCH_PANEL, openTab];
}

export function useWorkbenchRatio(): [number, (next: number) => void] {
  const chatId = useWorkbenchChatId();
  const key = workbenchWidthKey(chatId);
  const inherited = parseWorkbenchRatio(
    readWorkbenchPreference(key, WORKBENCH_WIDTH_KEY)
  );
  const [raw, setRaw] = useStoredState<unknown>(key, inherited);
  const ratio = parseWorkbenchRatio(raw);
  return [
    ratio,
    (next: number) => {
      setRaw(clampWorkbenchRatio(next));
    },
  ];
}
