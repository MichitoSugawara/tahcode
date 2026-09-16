import { useParams } from "react-router-dom";

import { useStoredState } from "@/lib/storage";

import type { WorkbenchPanelId } from "./panels";
import { resolveWorkbenchPanel } from "./panels";

/** Legacy global keys — still read when a scoped key is missing. */
export const WORKBENCH_DOCKED_KEY = "th:workbench:docked";
export const WORKBENCH_PANEL_KEY = "th:workbench:panel";
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

export function useWorkbenchPanel(): [
  WorkbenchPanelId,
  (next: WorkbenchPanelId) => void,
] {
  const chatId = useWorkbenchChatId();
  const key = workbenchPanelKey(chatId);
  const inherited = parseWorkbenchPanel(
    readWorkbenchPreference(key, WORKBENCH_PANEL_KEY)
  );
  const [raw, setRaw] = useStoredState<unknown>(key, inherited);
  const panel = parseWorkbenchPanel(raw);
  return [
    panel,
    (next: WorkbenchPanelId) => {
      setRaw(next);
    },
  ];
}

export function useWorkbenchWidth(): [number, (next: number) => void] {
  const [raw, setRaw] = useStoredState<unknown>(
    WORKBENCH_WIDTH_KEY,
    WORKBENCH_WIDTH_PX
  );
  const width = clampWorkbenchWidth(raw);
  return [
    width,
    (next: number) => {
      setRaw(clampWorkbenchWidth(next));
    },
  ];
}
