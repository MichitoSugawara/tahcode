import { DESKTOP_IPC } from "@tahcode/core/desktop";
import type {
  DesktopCliStatus,
  RegisterLocalRuntimeResult,
} from "@tahcode/core/desktop";
import { ipcMain } from "electron";
import type { IpcMainInvokeEvent } from "electron";

import { isAppOrigin } from "./config";
import type { ShellConfig } from "./config";
import {
  desktopHostname,
  getCliStatus,
  registerLocalRuntime,
} from "./localRuntime";

const UNAVAILABLE_CLI: DesktopCliStatus = {
  available: false,
  npmAvailable: false,
  path: null,
  version: null,
};

/**
 * Allow-listed IPC for the web app. The renderer cannot run an arbitrary
 * command — only hostname, CLI status, and the fixed register sequence.
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
      return await registerLocalRuntime(request);
    }
  );
}

function isTrustedSender(
  event: IpcMainInvokeEvent,
  config: ShellConfig
): boolean {
  const url = event.senderFrame?.url ?? event.sender.getURL();
  return typeof url === "string" && isAppOrigin(config, url);
}
