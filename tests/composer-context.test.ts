import { describe, expect, it } from "vitest";

import {
  COMPOSER_BRANCH_INVALID_MESSAGE,
  COMPOSER_BRANCH_MACHINE_OFFLINE_MESSAGE,
  COMPOSER_BRANCH_OFFLINE_MESSAGE,
  DEFAULT_COMPOSER_BRANCH,
  MISSING_PROJECT_FOLDER_MESSAGE,
  composerBranchStorageKey,
  composerProjectStorageKey,
  composerSendBlockedReason,
  evaluateComposerBranchApply,
  isComposerRuntimeSelectable,
  needsProjectFolderMapping,
  normalizeComposerBranch,
  normalizeProjectFolderPath,
  parseComposerBranchInput,
  resolveProjectCwd,
} from "../shared/composerContext.ts";

describe("folder path normalization", () => {
  it("trims and drops empty paths", () => {
    expect(normalizeProjectFolderPath("  ~/code/web  ")).toBe("~/code/web");
    expect(normalizeProjectFolderPath("   ")).toBeUndefined();
    expect(normalizeProjectFolderPath()).toBeUndefined();
  });
});

describe("composer branch names", () => {
  it("defaults blank storage values to main and keeps feature slashes", () => {
    expect(normalizeComposerBranch("")).toBe(DEFAULT_COMPOSER_BRANCH);
    expect(normalizeComposerBranch(" feature/foo ")).toBe("feature/foo");
  });

  it("rejects checkout-unsafe names instead of coercing them", () => {
    expect(parseComposerBranchInput("")).toBeUndefined();
    expect(parseComposerBranchInput(" feature/foo ")).toBe("feature/foo");
    expect(parseComposerBranchInput("bad name")).toBeUndefined();
    expect(parseComposerBranchInput("-hotfix")).toBeUndefined();
    expect(parseComposerBranchInput("oops..")).toBeUndefined();
  });
});

describe("composer branch apply gates", () => {
  const ready = {
    confirmedBranch: "main",
    folderBlocked: false,
    hasUsableOnline: true,
    runtimesReady: true,
    selectedRuntimeUsable: true as boolean | null,
  };

  it("confirms a new branch only when the target machine is online", () => {
    expect(
      evaluateComposerBranchApply({ ...ready, nextBranch: "develop" })
    ).toStrictEqual({ branch: "develop", ok: true, unchanged: false });
    expect(
      evaluateComposerBranchApply({
        ...ready,
        hasUsableOnline: false,
        nextBranch: "develop",
        selectedRuntimeUsable: null,
      })
    ).toMatchObject({
      failure: { code: "offline", message: COMPOSER_BRANCH_OFFLINE_MESSAGE },
      ok: false,
    });
    expect(
      evaluateComposerBranchApply({
        ...ready,
        nextBranch: "develop",
        selectedRuntimeUsable: false,
      })
    ).toMatchObject({
      failure: {
        code: "offline",
        message: COMPOSER_BRANCH_MACHINE_OFFLINE_MESSAGE,
      },
      ok: false,
    });
  });

  it("keeps the confirmed branch when apply cannot proceed", () => {
    expect(
      evaluateComposerBranchApply({ ...ready, nextBranch: "main" })
    ).toStrictEqual({ branch: "main", ok: true, unchanged: true });
    expect(
      evaluateComposerBranchApply({
        ...ready,
        folderBlocked: true,
        nextBranch: "feature/foo",
      })
    ).toMatchObject({
      failure: { code: "folder", message: MISSING_PROJECT_FOLDER_MESSAGE },
      ok: false,
    });
    expect(
      evaluateComposerBranchApply({ ...ready, nextBranch: "bad name" })
    ).toMatchObject({
      failure: { code: "invalid", message: COMPOSER_BRANCH_INVALID_MESSAGE },
      ok: false,
    });
    expect(
      isComposerRuntimeSelectable({ canUse: true, live: false })
    ).toBeFalsy();
    expect(
      isComposerRuntimeSelectable({ canUse: true, live: true })
    ).toBeTruthy();
  });
});

describe("project cwd resolution", () => {
  const folders = [
    { cwd: "/machines/a/repo", runtimeId: "rt-a" },
    { cwd: "/machines/b/repo", runtimeId: "rt-b" },
  ];

  it("prefers the mapping for the selected machine", () => {
    expect(
      resolveProjectCwd({
        folders,
        projectCwd: "~/legacy",
        runtimeId: "rt-b",
      })
    ).toBe("/machines/b/repo");
  });

  it("falls back to the legacy project cwd only when no mappings exist", () => {
    expect(
      resolveProjectCwd({
        folders: [],
        projectCwd: "~/legacy",
        runtimeId: "rt-a",
      })
    ).toBe("~/legacy");
  });

  it("does not reuse a legacy cwd for an unmapped machine", () => {
    expect(
      resolveProjectCwd({
        folders,
        projectCwd: "~/legacy",
        runtimeId: "rt-missing",
      })
    ).toBeUndefined();
  });

  it("returns undefined when neither mapping nor legacy cwd exists", () => {
    expect(
      resolveProjectCwd({ folders: [], runtimeId: "rt-a" })
    ).toBeUndefined();
  });
});

describe("folder mapping gate", () => {
  it("does not block DM / no-project or auto machine", () => {
    expect(
      needsProjectFolderMapping({
        folders: [],
        hasProject: false,
        runtimeId: "rt-a",
      })
    ).toBeFalsy();
    expect(
      needsProjectFolderMapping({
        folders: [],
        hasProject: true,
        runtimeId: null,
      })
    ).toBeFalsy();
  });

  it("requires a folder when another machine is mapped but this one is not", () => {
    expect(
      needsProjectFolderMapping({
        folders: [{ cwd: "/a", runtimeId: "rt-a" }],
        hasProject: true,
        runtimeId: "rt-b",
      })
    ).toBeTruthy();
  });

  it("does not require a folder when this machine is mapped or none are", () => {
    expect(
      needsProjectFolderMapping({
        folders: [{ cwd: "/a", runtimeId: "rt-a" }],
        hasProject: true,
        runtimeId: "rt-a",
      })
    ).toBeFalsy();
    expect(
      needsProjectFolderMapping({
        folders: [],
        hasProject: true,
        runtimeId: "rt-a",
      })
    ).toBeFalsy();
  });
});

describe("composer send gate", () => {
  it("blocks project chats on an unmapped machine", () => {
    expect(
      composerSendBlockedReason({
        folders: [{ cwd: "/a", runtimeId: "rt-a" }],
        isProjectChat: true,
        runtimeId: "rt-b",
      })
    ).toBe(MISSING_PROJECT_FOLDER_MESSAGE);
  });

  it("does not block DMs", () => {
    expect(
      composerSendBlockedReason({
        folders: [{ cwd: "/a", runtimeId: "rt-a" }],
        isProjectChat: false,
        runtimeId: "rt-b",
      })
    ).toBeNull();
  });
});

describe("composer storage keys", () => {
  it("scopes project and branch picks per org", () => {
    expect(composerProjectStorageKey("org1")).toBe("th:org1:composerProject");
    expect(composerBranchStorageKey("org1", "p1")).toBe("th:org1:branch:p1");
    expect(composerBranchStorageKey("org1")).toBe("th:org1:branch");
  });
});
