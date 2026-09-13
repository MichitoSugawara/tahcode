import {
  AUTO_UPDATE_FIRST_CHECK_MS,
  AUTO_UPDATE_INTERVAL_MS,
  DESKTOP_IPC,
  UPDATE_UI,
} from "@tahcode/core/desktop";
import type { DesktopUpdateState } from "@tahcode/core/desktop";
import { app, dialog, shell } from "electron";
import type { BrowserWindow } from "electron";

import {
  isAppOrigin,
  readAutoUpdateEnabled,
  writeAutoUpdateEnabled,
} from "./config";
import type { ShellConfig } from "./config";
import { createUpdateService } from "./updateService";
import type { DesktopUpdateService } from "./updateService";

export function isDesktopBuildSigned(): boolean {
  return process.env.TAHCODE_DESKTOP_SIGNED === "1";
}

export function desktopShellVersion(): string {
  return process.env.TAHCODE_DESKTOP_VERSION ?? app.getVersion();
}

export function createDesktopUpdater(
  userData: string,
  getConfig: () => ShellConfig,
  getWindow: () => BrowserWindow | null
): DesktopUpdateService {
  const updater = createUpdateService({
    downloadsDir: () => app.getPath("downloads"),
    fetch,
    getArch: () => process.arch,
    getPlatform: () => process.platform,
    getVersion: desktopShellVersion,
    isPackaged: () => app.isPackaged,
    isSigned: isDesktopBuildSigned,
    openExternal: (url) => shell.openExternal(url),
    openPath: (filePath) => shell.openPath(filePath),
    readAutoUpdateEnabled: () => readAutoUpdateEnabled(userData),
    writeAutoUpdateEnabled: (enabled) =>
      writeAutoUpdateEnabled(userData, enabled),
  });

  updater.onState((state) => {
    sendToAppRenderer(getConfig, getWindow, DESKTOP_IPC.updateState, state);
  });

  return updater;
}

export function startAutoUpdateChecks(
  updater: DesktopUpdateService,
  smoke: boolean
): () => void {
  if (smoke) {
    return () => {
      /* smoke mode never phones home */
    };
  }
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const schedule = (delay: number) => {
    timer = setTimeout(() => {
      void (async () => {
        if (stopped || !updater.getState().autoUpdateEnabled) {
          schedule(AUTO_UPDATE_INTERVAL_MS);
          return;
        }
        await updater.check("auto");
        if (!stopped) {
          schedule(AUTO_UPDATE_INTERVAL_MS);
        }
      })();
    }, delay);
  };

  schedule(AUTO_UPDATE_FIRST_CHECK_MS);
  return () => {
    stopped = true;
    if (timer) {
      clearTimeout(timer);
    }
  };
}

export function requestUpdateUi(
  getConfig: () => ShellConfig,
  getWindow: () => BrowserWindow | null
): boolean {
  return sendToAppRenderer(getConfig, getWindow, DESKTOP_IPC.openUpdateUi);
}

export async function presentNativeUpdateResult(
  state: DesktopUpdateState,
  updater: DesktopUpdateService
): Promise<void> {
  if (state.phase === "available") {
    const buttons = state.canDownload
      ? [UPDATE_UI.updateNow, UPDATE_UI.openReleases, "後で"]
      : [UPDATE_UI.openReleases, "後で"];
    const { response } = await dialog.showMessageBox({
      buttons,
      cancelId: buttons.length - 1,
      detail: state.canInstallInApp ? undefined : UPDATE_UI.unsignedNotice,
      message: state.message,
      type: "info",
    });
    const chosen = buttons[response];
    if (chosen === UPDATE_UI.updateNow) {
      const downloaded = await updater.download();
      await presentNativeUpdateResult(downloaded, updater);
      return;
    }
    if (chosen === UPDATE_UI.openReleases) {
      await updater.openLatestRelease();
    }
    return;
  }
  if (state.phase === "ready") {
    const applyLabel = state.canInstallInApp
      ? UPDATE_UI.applySigned
      : UPDATE_UI.applyUnsigned;
    const { response } = await dialog.showMessageBox({
      buttons: [applyLabel, UPDATE_UI.openReleases, "閉じる"],
      cancelId: 2,
      message: state.message,
      type: "info",
    });
    if (response === 0) {
      await updater.apply();
    } else if (response === 1) {
      await updater.openLatestRelease();
    }
    return;
  }
  if (state.phase === "error") {
    const { response } = await dialog.showMessageBox({
      buttons: [UPDATE_UI.openReleases, "閉じる"],
      cancelId: 1,
      message: state.message,
      type: "warning",
    });
    if (response === 0) {
      await updater.openLatestRelease();
    }
    return;
  }
  if (state.phase === "upToDate") {
    await dialog.showMessageBox({
      buttons: ["OK"],
      message: state.message,
      type: "info",
    });
  }
}

export async function runMenuUpdateCheck(
  updater: DesktopUpdateService,
  getConfig: () => ShellConfig,
  getWindow: () => BrowserWindow | null
): Promise<void> {
  /* Production web may still be an older deploy. Only skip the native
   * dialog when this page actually mounted the update host. */
  const useWebUi = updater.isRendererUiReady();
  if (useWebUi) {
    requestUpdateUi(getConfig, getWindow);
  }
  const state = await updater.check("user");
  if (!useWebUi) {
    await presentNativeUpdateResult(state, updater);
  }
}

function sendToAppRenderer(
  getConfig: () => ShellConfig,
  getWindow: () => BrowserWindow | null,
  channel: string,
  payload?: DesktopUpdateState
): boolean {
  const win = getWindow();
  if (!win || win.isDestroyed()) {
    return false;
  }
  const url = win.webContents.getURL();
  if (!isAppOrigin(getConfig(), url)) {
    return false;
  }
  if (payload) {
    win.webContents.send(channel, payload);
  } else {
    win.webContents.send(channel);
  }
  return true;
}
