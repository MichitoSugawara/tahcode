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
