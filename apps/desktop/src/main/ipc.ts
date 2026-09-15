import {
  DESKTOP_IPC,
  parseBrowseFolderRequest,
  parsePickFolderRequest,
} from "@tahcode/core/desktop";
import type {
  DesktopBrowseFolderResult,
  DesktopCliStatus,
  DesktopPickFolderResult,
  DesktopUpdateState,
  RegisterLocalRuntimeResult,
  RegisterProgressStep,
} from "@tahcode/core/desktop";
import { ipcMain } from "electron";
import type { IpcMainInvokeEvent } from "electron";

import { isAppOrigin } from "./config";
import type { ShellConfig } from "./config";
import { browseFolderAt, pickFolderFromEvent } from "./folder";
import {
  desktopHostname,
  getCliStatus,
  registerLocalRuntime,
} from "./localRuntime";
import type { DesktopUpdateService } from "./updateService";

const UNAVAILABLE_CLI: DesktopCliStatus = {
  available: false,
  npmAvailable: false,
  path: null,
  version: null,
};

/**
 * Allow-listed IPC for the web app. The renderer cannot run an arbitrary
 * command — only hostname, CLI status, the fixed register sequence
 * (plus progress events), desktop folder pick/browse, and
 * desktop update invoke/events.
 */
export function installLocalRuntimeIpc(getConfig: () => ShellConfig): void {
  ipcMain.handle(DESKTOP_IPC.getHostname, (event) => {
    if (!isTrustedSender(event, getConfig())) {
      return "";
    }
    return desktopHostname();
  });

  ipcMain.handle(
    DESKTOP_IPC.getCliStatus,
    async (event): Promise<DesktopCliStatus> => {
      if (!isTrustedSender(event, getConfig())) {
        return UNAVAILABLE_CLI;
      }
      return await getCliStatus();
    }
  );

  ipcMain.handle(
    DESKTOP_IPC.registerLocalRuntime,
    async (event, request: unknown): Promise<RegisterLocalRuntimeResult> => {
      if (!isTrustedSender(event, getConfig())) {
        return {
          code: "invalid-args",
          message: "このページからはこの Mac を登録できません。",
          ok: false,
        };
      }
      return await registerLocalRuntime(request, (step) => {
        sendRegisterProgress(event, step);
      });
    }
  );

  ipcMain.handle(
    DESKTOP_IPC.pickFolder,
    async (event, request: unknown): Promise<DesktopPickFolderResult> => {
      if (!isTrustedSender(event, getConfig())) {
        return { canceled: true };
      }
      return await pickFolderFromEvent(event, parsePickFolderRequest(request));
    }
  );

  ipcMain.handle(
    DESKTOP_IPC.browseFolder,
    (event, request: unknown): DesktopBrowseFolderResult => {
      if (!isTrustedSender(event, getConfig())) {
        return { error: "unavailable", ok: false };
      }
      return browseFolderAt(parseBrowseFolderRequest(request).path);
    }
  );
}

export function installUpdaterIpc(
  getConfig: () => ShellConfig,
  updater: DesktopUpdateService
): void {
  ipcMain.handle(
    DESKTOP_IPC.getUpdateState,
    (event): DesktopUpdateState | null => {
      if (!isTrustedSender(event, getConfig())) {
        return null;
      }
      return updater.getState();
    }
  );

  ipcMain.handle(
    DESKTOP_IPC.checkForUpdates,
    async (event): Promise<DesktopUpdateState | null> => {
      if (!isTrustedSender(event, getConfig())) {
        return null;
      }
      return await updater.check("user");
    }
  );

  ipcMain.handle(
    DESKTOP_IPC.downloadUpdate,
    async (event): Promise<DesktopUpdateState | null> => {
      if (!isTrustedSender(event, getConfig())) {
        return null;
      }
      return await updater.download();
    }
  );

  ipcMain.handle(
    DESKTOP_IPC.applyUpdate,
    async (event): Promise<DesktopUpdateState | null> => {
      if (!isTrustedSender(event, getConfig())) {
        return null;
      }
      return await updater.apply();
    }
  );

  ipcMain.handle(
    DESKTOP_IPC.setAutoUpdate,
    (event, enabled: unknown): DesktopUpdateState | null => {
      if (
        !isTrustedSender(event, getConfig()) ||
        typeof enabled !== "boolean"
      ) {
        return null;
      }
      return updater.setAutoUpdate(enabled);
    }
  );

  ipcMain.handle(DESKTOP_IPC.openLatestRelease, async (event) => {
    if (!isTrustedSender(event, getConfig())) {
      return;
    }
    await updater.openLatestRelease();
  });

  ipcMain.handle(DESKTOP_IPC.updateUiReady, (event) => {
    if (!isTrustedSender(event, getConfig())) {
      return;
    }
    updater.markRendererUiReady(true);
  });
}

function sendRegisterProgress(
  event: IpcMainInvokeEvent,
  step: RegisterProgressStep
): void {
  if (event.sender.isDestroyed()) {
    return;
  }
  event.sender.send(DESKTOP_IPC.registerProgress, step);
}

function isTrustedSender(
  event: IpcMainInvokeEvent,
  config: ShellConfig
): boolean {
  const url = event.senderFrame?.url ?? event.sender.getURL();
  return typeof url === "string" && isAppOrigin(config, url);
}
