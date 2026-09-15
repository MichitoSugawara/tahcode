/** Composer workspace context (TAH-71): project + machine folder + branch. */

export const DEFAULT_COMPOSER_BRANCH = "main";
export const MAX_PROJECT_FOLDER_LEN = 500;
export const MAX_COMPOSER_BRANCH_LEN = 200;

export const SUGGESTED_COMPOSER_BRANCHES = [
  "main",
  "master",
  "develop",
] as const;

export const MISSING_PROJECT_FOLDER_MESSAGE =
  "このマシンのフォルダが未設定です。作業ディレクトリを指定してください。";

export const COMPOSER_BRANCH_OFFLINE_MESSAGE =
  "オンラインのマシンがないため、ブランチを切り替えられません。マシンを起動するか、別のマシンを選んでください。";

export const COMPOSER_BRANCH_MACHINE_OFFLINE_MESSAGE =
  "指定中のマシンがオフラインのため、ブランチを切り替えられません。別のマシンを選ぶか、このマシンを起動してください。";

export const COMPOSER_BRANCH_INVALID_MESSAGE =
  "ブランチ名が無効です。空や空白、Git で使えない文字は使えません。";

export const COMPOSER_BRANCH_RUNTIME_LOADING_MESSAGE =
  "マシンの状態を確認しています。しばらくして再試行してください。";

export const COMPOSER_CATALOG_OFFLINE_MESSAGE =
  "オンラインのマシンがないため、プロバイダとモデルは選べません。";

export type ComposerBranchApplyCta = "retry" | "mapFolder" | "pickMachine";

export type ComposerBranchApplyFailure = {
  code: "offline" | "folder" | "invalid";
  ctas: readonly ComposerBranchApplyCta[];
  message: string;
};

export type ComposerBranchApplyResult =
  | { branch: string; ok: true; unchanged: boolean }
  | { failure: ComposerBranchApplyFailure; ok: false };

const UNSAFE_BRANCH_CHARS = /[\s~^:?*\\[]/;

export type ComposerProjectFolder = {
  cwd: string;
  runtimeId: string;
};

export function normalizeProjectFolderPath(raw?: string): string | undefined {
  const trimmed = raw?.trim() ?? "";
  if (trimmed.length < 1) {
    return undefined;
  }
  return trimmed.slice(0, MAX_PROJECT_FOLDER_LEN);
}

export function normalizeComposerBranch(raw: string | undefined): string {
  const trimmed = raw?.trim() ?? "";
  if (trimmed.length < 1) {
    return DEFAULT_COMPOSER_BRANCH;
  }
  return trimmed.slice(0, MAX_COMPOSER_BRANCH_LEN);
}

/** Reject names that cannot be a git checkout target. Empty is not `main`. */
export function parseComposerBranchInput(raw: string): string | undefined {
  const trimmed = raw.trim();
  if (trimmed.length < 1 || trimmed.length > MAX_COMPOSER_BRANCH_LEN) {
    return undefined;
  }
  if (
    trimmed.includes("..") ||
    trimmed.includes("@{") ||
    trimmed.startsWith("-") ||
    trimmed.startsWith(".") ||
    trimmed.endsWith("/") ||
    trimmed.endsWith(".lock") ||
    UNSAFE_BRANCH_CHARS.test(trimmed)
  ) {
    return undefined;
  }
  return trimmed;
}

export function isComposerRuntimeSelectable(input: {
  canUse?: boolean;
  live: boolean;
}): boolean {
  return input.canUse === true && input.live;
}

/**
 * Confirm a branch only when the target machine can actually work on it.
 * Does not invent a git checkout — callers persist only after `ok: true`.
 */
export function evaluateComposerBranchApply(input: {
  confirmedBranch: string;
  folderBlocked: boolean;
  hasUsableOnline: boolean;
  nextBranch: string;
  runtimesReady: boolean;
  /** `null` = auto. A designated machine must itself be live + usable. */
  selectedRuntimeUsable: boolean | null;
}): ComposerBranchApplyResult {
  const parsed = parseComposerBranchInput(input.nextBranch);
  if (!parsed) {
    return {
      failure: {
        code: "invalid",
        ctas: ["retry"],
        message: COMPOSER_BRANCH_INVALID_MESSAGE,
      },
      ok: false,
    };
  }
  const confirmed = normalizeComposerBranch(input.confirmedBranch);
  if (parsed === confirmed) {
    return { branch: parsed, ok: true, unchanged: true };
  }
  if (!input.runtimesReady) {
    return {
      failure: {
        code: "offline",
        ctas: ["retry"],
        message: COMPOSER_BRANCH_RUNTIME_LOADING_MESSAGE,
      },
      ok: false,
    };
  }
  const targetOnline =
    input.selectedRuntimeUsable === null
      ? input.hasUsableOnline
      : input.selectedRuntimeUsable;
  if (!targetOnline) {
    return {
      failure: {
        code: "offline",
        ctas: ["retry", "pickMachine"],
        message: input.hasUsableOnline
          ? COMPOSER_BRANCH_MACHINE_OFFLINE_MESSAGE
          : COMPOSER_BRANCH_OFFLINE_MESSAGE,
      },
      ok: false,
    };
  }
  if (input.folderBlocked) {
    return {
      failure: {
        code: "folder",
        ctas: ["retry", "mapFolder", "pickMachine"],
        message: MISSING_PROJECT_FOLDER_MESSAGE,
      },
      ok: false,
    };
  }
  return { branch: parsed, ok: true, unchanged: false };
}

/**
 * Mapping for this machine wins. Legacy `projects.cwd` is only a fallback
 * when the project has no per-machine rows yet. Once any machine is mapped,
 * an unmapped machine does not silently reuse another path.
 */
export function resolveProjectCwd(input: {
  folders: ComposerProjectFolder[];
  projectCwd?: string;
  runtimeId?: string | null;
}): string | undefined {
  if (input.runtimeId) {
    const mapped = input.folders.find(
      (folder) => folder.runtimeId === input.runtimeId
    );
    if (mapped) {
      return mapped.cwd;
    }
    if (input.folders.length > 0) {
      return undefined;
    }
  }
  return normalizeProjectFolderPath(input.projectCwd);
}

/**
 * Require a folder when the project already has at least one machine
 * mapping and the chosen machine is not one of them.
 */
export function needsProjectFolderMapping(input: {
  folders: ComposerProjectFolder[];
  hasProject: boolean;
  projectCwd?: string;
  runtimeId?: string | null;
}): boolean {
  if (!input.hasProject || !input.runtimeId) {
    return false;
  }
  if (input.folders.length === 0) {
    return false;
  }
  return resolveProjectCwd(input) === undefined;
}

export function composerProjectStorageKey(orgId: string): string {
  return `th:${orgId}:composerProject`;
}

export function composerBranchStorageKey(
  orgId: string,
  projectId?: string | null
): string {
  return projectId ? `th:${orgId}:branch:${projectId}` : `th:${orgId}:branch`;
}

export function composerSendBlockedReason(input: {
  folders: ComposerProjectFolder[];
  isProjectChat: boolean;
  projectCwd?: string;
  runtimeId?: string | null;
}): string | null {
  if (!input.isProjectChat) {
    return null;
  }
  if (
    !needsProjectFolderMapping({
      folders: input.folders,
      hasProject: true,
      projectCwd: input.projectCwd,
      runtimeId: input.runtimeId,
    })
  ) {
    return null;
  }
  return MISSING_PROJECT_FOLDER_MESSAGE;
}
