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
export const WORKBENCH_WIDTH_PX = 360;
export const WORKBENCH_WIDTH_MIN_PX = 280;
export const WORKBENCH_WIDTH_MAX_PX = 720;
export const WORKBENCH_WIDTH_NUDGE_PX = 16;

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

export function clampWorkbenchWidth(raw: unknown): number {
  const value = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(value)) {
    return WORKBENCH_WIDTH_PX;
  }
  return Math.min(
    WORKBENCH_WIDTH_MAX_PX,
    Math.max(WORKBENCH_WIDTH_MIN_PX, Math.round(value))
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

export function useWorkbenchWidth(): [number, (next: number) => void] {
  const chatId = useWorkbenchChatId();
  const key = workbenchWidthKey(chatId);
  const inherited = clampWorkbenchWidth(
    readWorkbenchPreference(key, WORKBENCH_WIDTH_KEY)
  );
  const [raw, setRaw] = useStoredState<unknown>(key, inherited);
  const width = clampWorkbenchWidth(raw);
  return [
    width,
    (next: number) => {
      setRaw(clampWorkbenchWidth(next));
    },
  ];
}
