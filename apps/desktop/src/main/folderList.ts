import { readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

import type { DesktopBrowseFolderResult } from "@tahcode/core/desktop";

import {
  homeAliasPath,
  isSafeBrowsePath,
  parseGitRemoteFromConfig,
  suggestGithubRepoUrl,
  toBrowseResult,
} from "../../../../shared/filesystemBrowse.ts";

export function browseFolderAt(
  requestPath?: string
): DesktopBrowseFolderResult {
  try {
    const homePath = homedir();
    const raw = homeAliasPath(requestPath, homePath);
    if (!isSafeBrowsePath(raw)) {
      return { error: "パスが不正です", ok: false };
    }
    const resolved = path.resolve(raw);
    const info = statSync(resolved);
    if (!info.isDirectory()) {
      return { error: "ディレクトリではありません", ok: false };
    }
    const built = toBrowseResult({
      dirNames: listDirectoryNames(resolved),
      gitConfigText: readGitConfig(resolved),
      homePath,
      path: resolved,
    });
    return { ...built, ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "読めませんでした";
    return { error: message.slice(0, 200), ok: false };
  }
}

export function readFolderGitRemote(folderPath: string): string | undefined {
  return suggestGithubRepoUrl(
    parseGitRemoteFromConfig(readGitConfig(folderPath) ?? "")
  );
}

function readGitConfig(folderPath: string): string | undefined {
  try {
    return readFileSync(path.join(folderPath, ".git", "config"), "utf-8");
  } catch {
    return undefined;
  }
}

function listDirectoryNames(folderPath: string): string[] {
  const names: string[] = [];
  for (const entry of readdirSync(folderPath, { withFileTypes: true })) {
    if (entry.name === "." || entry.name === "..") {
      continue;
    }
    try {
      if (statSync(path.join(folderPath, entry.name)).isDirectory()) {
        names.push(entry.name);
      }
    } catch {
      /* unreadable */
    }
  }
  return names;
}
