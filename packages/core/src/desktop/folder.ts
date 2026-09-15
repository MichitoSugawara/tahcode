/* ─────────────────────────────────────────────────────────
 * Native folder pick + local directory listing (TAH-67).
 * Pure checks only — Electron `dialog` / `fs` stay in apps/desktop.
 * ───────────────────────────────────────────────────────── */

export type DesktopPickFolderRequest = {
  defaultPath?: string;
};

export type DesktopPickFolderResult =
  | { canceled: true }
  | { canceled: false; gitRemoteUrl?: string; path: string };

export type DesktopBrowseFolderRequest = {
  path?: string;
};

export type DesktopBrowseFolderOk = {
  entries: { kind: "dir"; name: string; path: string }[];
  gitRemoteUrl?: string;
  homePath: string;
  ok: true;
  parentPath: string | null;
  path: string;
};

export type DesktopBrowseFolderResult =
  | DesktopBrowseFolderOk
  | { error: string; ok: false };

const PATH_MAX = 500;

export function isAllowedFolderPath(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= PATH_MAX &&
    !value.includes("\0")
  );
}

export function parsePickFolderRequest(
  value: unknown
): DesktopPickFolderRequest {
  if (value === undefined || value === null) {
    return {};
  }
  if (typeof value !== "object") {
    return {};
  }
  const record = value as { defaultPath?: unknown };
  if (!isAllowedFolderPath(record.defaultPath)) {
    return {};
  }
  return { defaultPath: record.defaultPath };
}

export function parseBrowseFolderRequest(
  value: unknown
): DesktopBrowseFolderRequest {
  if (value === undefined || value === null) {
    return {};
  }
  if (typeof value !== "object") {
    return {};
  }
  const record = value as { path?: unknown };
  if (record.path === undefined || record.path === "") {
    return {};
  }
  if (!isAllowedFolderPath(record.path)) {
    return {};
  }
  return { path: record.path };
}

export function isDesktopPickFolderResult(
  value: unknown
): value is DesktopPickFolderResult {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const record = value as {
    canceled?: unknown;
    gitRemoteUrl?: unknown;
    path?: unknown;
  };
  if (record.canceled === true) {
    return true;
  }
  return record.canceled === false && isAllowedFolderPath(record.path);
}

export function isDesktopBrowseFolderResult(
  value: unknown
): value is DesktopBrowseFolderResult {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const record = value as { ok?: unknown; error?: unknown; path?: unknown };
  if (record.ok === false) {
    return typeof record.error === "string";
  }
  return record.ok === true && typeof record.path === "string";
}

export function supportsDesktopFolderPicker(
  bridge: { pickFolder?: unknown } | null
): boolean {
  return bridge !== null && typeof bridge.pickFolder === "function";
}

export function supportsDesktopFolderBrowse(
  bridge: { browseFolder?: unknown } | null
): boolean {
  return bridge !== null && typeof bridge.browseFolder === "function";
}
