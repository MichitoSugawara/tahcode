/** Directory browse + optional Git remote hint (TAH-67). */

import { MAX_PROJECT_FOLDER_LEN } from "./composerContext.ts";

export const BRIDGE_CAPABILITY_FILESYSTEM_BROWSE = "filesystemBrowse";

export const FS_BROWSE_MAX_ENTRIES = 200;
export const FS_BROWSE_STALE_MS = 20_000;
export const FS_BROWSE_POLL_MS = 400;

export const GITHUB_HOST = "github.com";

export type FsBrowseEntry = {
  kind: "dir";
  name: string;
  path: string;
};

export type FsBrowseResult = {
  entries: FsBrowseEntry[];
  gitRemoteUrl?: string;
  homePath: string;
  parentPath: string | null;
  path: string;
};

export type FolderPickMode = "browse" | "native" | "unavailable";

export type FolderPickReason =
  | "cannotUse"
  | "offline"
  | "oldBridge"
  | "readyBrowse"
  | "readyNative";

const GITHUB_SSH = /^git@github\.com:([^/]+)\/(.+?)(?:\.git)?$/i;
const GITHUB_SSH_URL = /^ssh:\/\/git@github\.com\/([^/]+)\/(.+?)(?:\.git)?$/i;
const GITHUB_HTTPS =
  /^https:\/\/(?:www\.)?github\.com\/([^/]+)\/([^/?#]+?)(?:\.git)?\/?$/i;
const GITHUB_SHORT = /^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/;
const REMOTE_BLOCK = /\[remote "([^"]+)"\]([\s\S]*?)(?=\n\[|$)/g;
const REMOTE_URL = /^\s*url\s*=\s*(.+?)\s*$/im;

export function isSafeBrowsePath(raw: string): boolean {
  if (raw.includes("\0")) {
    return false;
  }
  return raw.length <= MAX_PROJECT_FOLDER_LEN;
}

export function homeAliasPath(
  raw: string | undefined,
  homePath: string
): string {
  const trimmed = raw?.trim() ?? "";
  if (trimmed.length < 1 || trimmed === "~") {
    return homePath;
  }
  if (trimmed.startsWith("~/")) {
    const rest = trimmed.slice(2);
    const sep = homePath.includes("\\") ? "\\" : "/";
    return `${homePath.replace(/[/\\]$/, "")}${sep}${rest}`;
  }
  return trimmed;
}

export function parentBrowsePath(
  current: string,
  homePath: string
): string | null {
  const normalized = current.replace(/[/\\]+$/, "");
  if (normalized.length < 1) {
    return null;
  }
  const sep = current.includes("\\") ? "\\" : "/";
  const last = normalized.lastIndexOf(sep);
  if (last <= 0) {
    if (normalized === homePath.replace(/[/\\]+$/, "")) {
      return null;
    }
    return last === 0 ? sep : null;
  }
  const parent = normalized.slice(0, last);
  if (parent.length < 1) {
    return null;
  }
  return parent;
}

export function toBrowseResult(input: {
  dirNames: readonly string[];
  gitConfigText?: string;
  homePath: string;
  path: string;
}): FsBrowseResult {
  const names = [...input.dirNames].sort((left, right) =>
    left.localeCompare(right, undefined, { sensitivity: "base" })
  );
  const limited = names.slice(0, FS_BROWSE_MAX_ENTRIES);
  const sep = input.path.includes("\\") ? "\\" : "/";
  const base = input.path.replace(/[/\\]+$/, "") || input.path;
  const gitRemoteUrl = input.gitConfigText
    ? suggestGithubRepoUrl(parseGitRemoteFromConfig(input.gitConfigText))
    : undefined;
  return {
    entries: limited.map((name) => ({
      kind: "dir",
      name,
      path: `${base}${base.endsWith(sep) ? "" : sep}${name}`,
    })),
    gitRemoteUrl,
    homePath: input.homePath,
    parentPath: parentBrowsePath(input.path, input.homePath),
    path: input.path,
  };
}

export function parseGitRemoteFromConfig(
  configText: string
): string | undefined {
  let origin: string | undefined;
  let first: string | undefined;
  for (const match of configText.matchAll(REMOTE_BLOCK)) {
    const name = match[1];
    const body = match[2] ?? "";
    const url = body.match(REMOTE_URL)?.[1]?.trim();
    if (!url) {
      continue;
    }
    first ??= url;
    if (name === "origin") {
      origin = url;
    }
  }
  return origin ?? first;
}

export function suggestGithubRepoUrl(remote?: string): string | undefined {
  const trimmed = remote?.trim() ?? "";
  if (trimmed.length < 1) {
    return undefined;
  }
  const ssh = trimmed.match(GITHUB_SSH);
  if (ssh?.[1] && ssh[2]) {
    return `https://${GITHUB_HOST}/${ssh[1]}/${ssh[2].replace(/\.git$/i, "")}`;
  }
  const sshUrl = trimmed.match(GITHUB_SSH_URL);
  if (sshUrl?.[1] && sshUrl[2]) {
    return `https://${GITHUB_HOST}/${sshUrl[1]}/${sshUrl[2].replace(/\.git$/i, "")}`;
  }
  const https = trimmed.match(GITHUB_HTTPS);
  if (https?.[1] && https[2]) {
    return `https://${GITHUB_HOST}/${https[1]}/${https[2].replace(/\.git$/i, "")}`;
  }
  const short = trimmed.match(GITHUB_SHORT);
  if (short?.[1] && short[2] && !trimmed.includes("://")) {
    return `https://${GITHUB_HOST}/${short[1]}/${short[2]}`;
  }
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed.replace(/\.git$/i, "");
  }
  return undefined;
}

export function normalizeOptionalRepoUrl(
  raw?: string | null
): string | undefined {
  const trimmed = raw?.trim() ?? "";
  if (trimmed.length < 1) {
    return undefined;
  }
  return (
    suggestGithubRepoUrl(trimmed) ?? trimmed.slice(0, MAX_PROJECT_FOLDER_LEN)
  );
}

export function sameDesktopHost(
  runtimeHost: string | undefined,
  desktopHost: string | null | undefined
): boolean {
  const left = normalizeHost(runtimeHost);
  const right = normalizeHost(desktopHost);
  return left.length > 0 && left === right;
}

export function normalizeHost(hostname?: string | null): string {
  return (hostname ?? "")
    .trim()
    .replace(/\.local$/i, "")
    .toLowerCase();
}

export function runtimeHasFilesystemBrowse(
  capabilities: readonly string[] | undefined
): boolean {
  return (capabilities ?? []).includes(BRIDGE_CAPABILITY_FILESYSTEM_BROWSE);
}

export function evaluateFolderPick(input: {
  canUse: boolean;
  desktopBrowse: boolean;
  desktopPick: boolean;
  isLocalDesktop: boolean;
  live: boolean;
  runtimeHasBrowse: boolean;
}): { mode: FolderPickMode; reason: FolderPickReason } {
  if (!input.canUse) {
    return { mode: "unavailable", reason: "cannotUse" };
  }
  if (input.isLocalDesktop && input.desktopPick) {
    return { mode: "native", reason: "readyNative" };
  }
  if (input.isLocalDesktop && input.desktopBrowse) {
    return { mode: "browse", reason: "readyBrowse" };
  }
  if (!input.live) {
    return { mode: "unavailable", reason: "offline" };
  }
  if (input.runtimeHasBrowse) {
    return { mode: "browse", reason: "readyBrowse" };
  }
  return { mode: "unavailable", reason: "oldBridge" };
}

export function folderPickHint(reason: FolderPickReason): string {
  if (reason === "cannotUse") {
    return "このマシンを使う権限がありません";
  }
  if (reason === "offline") {
    return "オフライン — 起動後に選べます";
  }
  if (reason === "oldBridge") {
    return "このマシンの CLI を更新するとフォルダを選べます";
  }
  if (reason === "readyNative") {
    return "この Mac のフォルダを選びます";
  }
  return "マシン上のフォルダを辿って選びます";
}

export function filterBrowseEntries(
  entries: readonly FsBrowseEntry[],
  query: string
): FsBrowseEntry[] {
  const needle = query.trim().toLowerCase();
  if (needle.length < 1) {
    return [...entries];
  }
  return entries.filter((entry) => entry.name.toLowerCase().includes(needle));
}
