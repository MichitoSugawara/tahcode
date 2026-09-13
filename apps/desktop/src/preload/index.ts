import {
  DESKTOP_BRIDGE_KEY,
  DESKTOP_IPC,
  desktopOAuthRedirectTo,
  isDesktopUpdateState,
  isRegisterProgressStep,
} from "@tahcode/core/desktop";
import type {
  DesktopCliStatus,
  DesktopUpdateState,
  OAuthStrategy,
  RegisterLocalRuntimeRequest,
  RegisterLocalRuntimeResult,
  RegisterProgressStep,
  TahcodeDesktopBridge,
} from "@tahcode/core/desktop";
import { contextBridge, ipcRenderer } from "electron";

/* ─────────────────────────────────────────────────────────
 * window.tahcodeDesktop — the only surface the web app sees.
 *
 * Runs sandboxed with contextIsolation; nothing here touches Node APIs.
 * The web app (src/lib/desktop.ts) treats the whole object as optional so
 * the same bundle keeps working in a plain browser. The shape is
 * TahcodeDesktopBridge from @tahcode/core/desktop.
 *
 * IPC is allow-listed: hostname, CLI status, the fixed
 * registerLocalRuntime sequence, progress events for that
 * sequence, and desktop update invoke/events. No arbitrary shell.
 * ───────────────────────────────────────────────────────── */

function argValue(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv
    .find((arg) => arg.startsWith(prefix))
    ?.slice(prefix.length);
}

const oauthStrategy: OAuthStrategy =
  argValue("tahcode-oauth") === "in-app" ? "in-app" : "system-browser";

const bridge: TahcodeDesktopBridge = {
  getCliStatus: () =>
    ipcRenderer.invoke(DESKTOP_IPC.getCliStatus) as Promise<DesktopCliStatus>,
  getHostname: () =>
    ipcRenderer.invoke(DESKTOP_IPC.getHostname) as Promise<string>,
  oauthRedirectTo: (next) =>
    oauthStrategy === "system-browser" ? desktopOAuthRedirectTo(next) : null,
  oauthStrategy,
  platform: process.platform,
  registerLocalRuntime: (
    request: RegisterLocalRuntimeRequest,
    onProgress?: (step: RegisterProgressStep) => void
  ) => {
    const listener = (_event: unknown, step: unknown) => {
      if (isRegisterProgressStep(step)) {
        onProgress?.(step);
      }
    };
    ipcRenderer.on(DESKTOP_IPC.registerProgress, listener);
    return (
      ipcRenderer.invoke(
        DESKTOP_IPC.registerLocalRuntime,
        request
      ) as Promise<RegisterLocalRuntimeResult>
    ).finally(() => {
      ipcRenderer.off(DESKTOP_IPC.registerProgress, listener);
    });
  },
  applyUpdate: () =>
    ipcRenderer.invoke(DESKTOP_IPC.applyUpdate) as Promise<DesktopUpdateState>,
  checkForUpdates: () =>
    ipcRenderer.invoke(
      DESKTOP_IPC.checkForUpdates
    ) as Promise<DesktopUpdateState>,
  downloadUpdate: () =>
    ipcRenderer.invoke(
      DESKTOP_IPC.downloadUpdate
    ) as Promise<DesktopUpdateState>,
  getUpdateState: () =>
    ipcRenderer.invoke(
      DESKTOP_IPC.getUpdateState
    ) as Promise<DesktopUpdateState>,
  onOpenUpdateUi: (listener) => {
    const wrapped = () => {
      listener();
    };
    ipcRenderer.on(DESKTOP_IPC.openUpdateUi, wrapped);
    return () => {
      ipcRenderer.off(DESKTOP_IPC.openUpdateUi, wrapped);
    };
  },
  onUpdateState: (listener) => {
    const wrapped = (_event: unknown, state: unknown) => {
      if (isDesktopUpdateState(state)) {
        listener(state);
      }
    };
    ipcRenderer.on(DESKTOP_IPC.updateState, wrapped);
    return () => {
      ipcRenderer.off(DESKTOP_IPC.updateState, wrapped);
    };
  },
  openLatestRelease: () =>
    ipcRenderer.invoke(DESKTOP_IPC.openLatestRelease) as Promise<void>,
  setAutoUpdate: (enabled) =>
    ipcRenderer.invoke(
      DESKTOP_IPC.setAutoUpdate,
      enabled
    ) as Promise<DesktopUpdateState>,
  version: process.env.TAHCODE_DESKTOP_VERSION ?? "0.0.0",
};

contextBridge.exposeInMainWorld(DESKTOP_BRIDGE_KEY, bridge);
