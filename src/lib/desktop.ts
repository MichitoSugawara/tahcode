import {
  DESKTOP_BRIDGE_KEY,
  DESKTOP_RELEASES_URL,
  supportsDesktopFolderBrowse,
  supportsDesktopFolderPicker,
  supportsDesktopUpdater,
} from "@tahcode/core/desktop";
import type {
  DesktopBrowseFolderResult,
  DesktopCliStatus,
  DesktopPickFolderResult,
  TahcodeDesktopBridge,
} from "@tahcode/core/desktop";
import { useEffect, useState } from "react";

/* ─────────────────────────────────────────────────────────
 * Bridge to the desktop shell (apps/desktop, Electron).
 *
 * The shell's preload installs `window.tahcodeDesktop`; in a plain browser
 * it is undefined and every helper here falls back to browser behaviour.
 * The contract (type + URL rules) is @tahcode/core/desktop.
 * ───────────────────────────────────────────────────────── */

declare global {
  interface Window {
    tahcodeDesktop?: TahcodeDesktopBridge;
  }
}

export function getDesktopBridge(): TahcodeDesktopBridge | null {
  if (typeof window === "undefined") {
    return null;
  }
  return window[DESKTOP_BRIDGE_KEY] ?? null;
}

export function isDesktopShell(): boolean {
  return getDesktopBridge() !== null;
}

/**
 * Where Convex Auth should send the user after Google. In the browser this
 * is our own /login (keeps `next` for invite links). In the shell, Google
 * runs in the system browser, so the callback is the app's tahcode:// deep
 * link (allow-listed in convex/auth.ts); the shell turns it back into /login.
 */
export function oauthRedirectTo(safeNext: string): string {
  const fromShell = getDesktopBridge()?.oauthRedirectTo(safeNext) ?? null;
  if (fromShell) {
    return fromShell;
  }
  return safeNext === "/"
    ? "/login"
    : `/login?next=${encodeURIComponent(safeNext)}`;
}

/** True when the shell hands Google off to the system browser. */
export function oauthLeavesApp(): boolean {
  return getDesktopBridge()?.oauthStrategy === "system-browser";
}

/** Primary CTA for Register Runtime / empty states. */
export function registerRuntimeCtaLabel(): string {
  return isDesktopShell() ? "この Mac を登録" : "このマシンを登録";
}

export function registerRuntimeHint(): string {
  return isDesktopShell() ? "ワンクリック" : "npm i -g tahcode";
}

export function useDesktopHostname(): string | null {
  const [hostname, setHostname] = useState<string | null>(null);
  useEffect(() => {
    void desktopHostnameOrNull().then(setHostname);
  }, []);
  return hostname;
}

export async function desktopHostnameOrNull(): Promise<string | null> {
  const bridge = getDesktopBridge();
  if (!bridge) {
    return null;
  }
  try {
    const hostname = await bridge.getHostname();
    return hostname.trim().length > 0 ? hostname : null;
  } catch {
    return null;
  }
}

export async function desktopCliStatusOrNull(): Promise<DesktopCliStatus | null> {
  const bridge = getDesktopBridge();
  if (!bridge) {
    return null;
  }
  try {
    return await bridge.getCliStatus();
  } catch {
    return null;
  }
}

export function hasDesktopUpdater(): boolean {
  return supportsDesktopUpdater(getDesktopBridge());
}

export function hasDesktopFolderPicker(): boolean {
  return supportsDesktopFolderPicker(getDesktopBridge());
}

export function hasDesktopFolderBrowse(): boolean {
  return supportsDesktopFolderBrowse(getDesktopBridge());
}

export async function pickDesktopFolder(
  defaultPath?: string
): Promise<DesktopPickFolderResult | null> {
  const pick = getDesktopBridge()?.pickFolder;
  if (!pick) {
    return null;
  }
  try {
    return await pick(defaultPath ? { defaultPath } : undefined);
  } catch {
    return { canceled: true };
  }
}

export async function browseDesktopFolder(
  path?: string
): Promise<DesktopBrowseFolderResult | null> {
  const browse = getDesktopBridge()?.browseFolder;
  if (!browse) {
    return null;
  }
  try {
    return await browse(path ? { path } : undefined);
  } catch {
    return { error: "フォルダを読めませんでした", ok: false };
  }
}

export {
  DESKTOP_RELEASES_URL,
  supportsDesktopFolderBrowse,
  supportsDesktopFolderPicker,
  supportsDesktopUpdater,
};
