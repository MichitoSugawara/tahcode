import {
  evaluateFolderPick,
  runtimeHasFilesystemBrowse,
  sameDesktopHost,
} from "@shared/filesystemBrowse.ts";
import type {
  FolderPickMode,
  FolderPickReason,
} from "@shared/filesystemBrowse.ts";

import { hasDesktopFolderBrowse, hasDesktopFolderPicker } from "@/lib/desktop";

export type FolderPickRuntime = {
  canUse: boolean;
  capabilities?: readonly string[];
  hostname?: string;
};

export function folderPickForRuntime(input: {
  desktopHost: string | null;
  live: boolean;
  runtime: FolderPickRuntime;
}): { mode: FolderPickMode; reason: FolderPickReason } {
  return evaluateFolderPick({
    canUse: input.runtime.canUse,
    desktopBrowse: hasDesktopFolderBrowse(),
    desktopPick: hasDesktopFolderPicker(),
    isLocalDesktop: sameDesktopHost(input.runtime.hostname, input.desktopHost),
    live: input.live,
    runtimeHasBrowse: runtimeHasFilesystemBrowse(input.runtime.capabilities),
  });
}

export function foldersFromRecord(
  folders: Record<string, string>
): { cwd: string; runtimeId: string }[] {
  return Object.entries(folders)
    .map(([runtimeId, cwd]) => ({ cwd: cwd.trim(), runtimeId }))
    .filter((folder) => folder.cwd.length > 0);
}
