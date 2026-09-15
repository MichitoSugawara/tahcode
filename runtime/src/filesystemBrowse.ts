import { readdir, readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

import {
  homeAliasPath,
  isSafeBrowsePath,
  toBrowseResult,
} from "../../shared/filesystemBrowse.ts";
import type { FsBrowseResult } from "../../shared/filesystemBrowse.ts";

export async function browseRuntimeFolder(
  requestPath: string
): Promise<FsBrowseResult> {
  const homePath = homedir();
  const raw = homeAliasPath(requestPath, homePath);
  if (!isSafeBrowsePath(raw)) {
    throw new Error("Folder path is invalid");
  }
  const resolved = path.resolve(raw);
  const info = await stat(resolved);
  if (!info.isDirectory()) {
    throw new Error("Not a directory");
  }
  return toBrowseResult({
    dirNames: await listDirectoryNames(resolved),
    gitConfigText: await readGitConfig(resolved),
    homePath,
    path: resolved,
  });
}

async function readGitConfig(folderPath: string): Promise<string | undefined> {
  try {
    return await readFile(path.join(folderPath, ".git", "config"), "utf-8");
  } catch {
    return undefined;
  }
}

async function listDirectoryNames(folderPath: string): Promise<string[]> {
  const names: string[] = [];
  const entries = await readdir(folderPath, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === "." || entry.name === "..") {
      continue;
    }
    try {
      const target = path.join(folderPath, entry.name);
      if ((await stat(target)).isDirectory()) {
        names.push(entry.name);
      }
    } catch {
      /* unreadable */
    }
  }
  return names;
}
