import type {
  DesktopPickFolderRequest,
  DesktopPickFolderResult,
} from "@tahcode/core/desktop";
import { BrowserWindow, dialog } from "electron";
import type { IpcMainInvokeEvent, OpenDialogOptions } from "electron";

import { readFolderGitRemote } from "./folderList";

export { browseFolderAt, readFolderGitRemote } from "./folderList";

export async function pickFolderFromEvent(
  event: IpcMainInvokeEvent,
  request: DesktopPickFolderRequest
): Promise<DesktopPickFolderResult> {
  const owner = BrowserWindow.fromWebContents(event.sender);
  const options: OpenDialogOptions = {
    defaultPath: request.defaultPath,
    properties: ["openDirectory", "createDirectory"],
  };
  const picked = owner
    ? await dialog.showOpenDialog(owner, options)
    : await dialog.showOpenDialog(options);
  const folder = picked.filePaths[0];
  if (picked.canceled || !folder) {
    return { canceled: true };
  }
  return {
    canceled: false,
    gitRemoteUrl: readFolderGitRemote(folder),
    path: folder,
  };
}
