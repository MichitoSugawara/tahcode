/**
 * Workbench PTY contract — adapted from pingdotgg/t3code
 * `packages/contracts/src/terminal.ts`.
 *
 * t3code talks to a local TerminalManager over WebSocket
 * (`open` / `write` / `resize` / `output`). tahcode keeps the same
 * session verbs and limits, and carries them on the existing Mac
 * bridge + Convex capability channel instead of a second daemon.
 */

export const BRIDGE_CAPABILITY_PTY = "pty";

export const DEFAULT_TERMINAL_ID = "term-1";

export const TERMINAL_WRITE_MAX = 65_536;
export const TERMINAL_HISTORY_MAX = 96_000;
export const TERMINAL_ID_MAX = 128;
export const TERMINAL_COLS_MIN = 1;
export const TERMINAL_COLS_MAX = 1000;
export const TERMINAL_ROWS_MIN = 1;
export const TERMINAL_ROWS_MAX = 500;
export const DEFAULT_TERMINAL_COLS = 80;
export const DEFAULT_TERMINAL_ROWS = 24;
export const PTY_POLL_MS = 80;
export const PTY_STALE_STARTING_MS = 20_000;
export const PTY_STALE_RUNNING_MS = 90_000;

export const PTY_SESSION_STATUSES = [
  "starting",
  "running",
  "exited",
  "error",
  "closed",
] as const;

export type PtySessionStatus = (typeof PTY_SESSION_STATUSES)[number];

export function runtimeHasPty(
  capabilities: readonly string[] | undefined
): boolean {
  return (capabilities ?? []).includes(BRIDGE_CAPABILITY_PTY);
}

export function clampTerminalCols(value: number): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_TERMINAL_COLS;
  }
  return Math.min(
    TERMINAL_COLS_MAX,
    Math.max(TERMINAL_COLS_MIN, Math.floor(value))
  );
}

export function clampTerminalRows(value: number): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_TERMINAL_ROWS;
  }
  return Math.min(
    TERMINAL_ROWS_MAX,
    Math.max(TERMINAL_ROWS_MIN, Math.floor(value))
  );
}

export function isTerminalId(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= TERMINAL_ID_MAX;
}

export function truncateTerminalHistory(history: string): string {
  if (history.length <= TERMINAL_HISTORY_MAX) {
    return history;
  }
  return history.slice(history.length - TERMINAL_HISTORY_MAX);
}

export function nextTerminalHistory(history: string, chunk: string): string {
  return truncateTerminalHistory(`${history}${chunk}`);
}

export function clipTerminalWrite(data: string): string {
  if (data.length <= TERMINAL_WRITE_MAX) {
    return data;
  }
  return data.slice(0, TERMINAL_WRITE_MAX);
}

/**
 * Fallback VT encoding used when Ghostty WASM is not loaded.
 * Ghostty's `GhosttyTerminalCore.encodeKey` is the primary path
 * (t3code `core.ts`); this covers the same everyday keys so the
 * Convex write channel still has a smoke path.
 */
export function encodeTerminalKey(event: {
  altKey: boolean;
  code: string;
  ctrlKey: boolean;
  key: string;
  metaKey: boolean;
}): string | null {
  if (event.metaKey) {
    return null;
  }
  if (event.ctrlKey && event.key.length === 1) {
    const code = event.key.toLowerCase().charCodeAt(0);
    if (code >= 97 && code <= 122) {
      return String.fromCharCode(code - 96);
    }
  }
  switch (event.key) {
    case "Enter":
      return "\r";
    case "Tab":
      return "\t";
    case "Backspace":
      return "\u007F";
    case "Escape":
      return "\u001B";
    case "ArrowUp":
      return "\u001B[A";
    case "ArrowDown":
      return "\u001B[B";
    case "ArrowRight":
      return "\u001B[C";
    case "ArrowLeft":
      return "\u001B[D";
    case "Home":
      return "\u001B[H";
    case "End":
      return "\u001B[F";
    case "Delete":
      return "\u001B[3~";
    case "PageUp":
      return "\u001B[5~";
    case "PageDown":
      return "\u001B[6~";
    default:
      break;
  }
  if (event.key.length === 1 && !event.ctrlKey && !event.altKey) {
    return event.key;
  }
  return null;
}

export function historyWritePlan(
  previous: string,
  next: string
): { kind: "reset" | "append"; data: string } {
  if (
    next.length < previous.length ||
    (previous.length > 0 && !next.startsWith(previous))
  ) {
    return { data: next, kind: "reset" };
  }
  return { data: next.slice(previous.length), kind: "append" };
}
