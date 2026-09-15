import { describe, expect, it } from "vitest";

import {
  DEFAULT_COMPOSER_BRANCH,
  MISSING_PROJECT_FOLDER_MESSAGE,
  composerBranchStorageKey,
  composerProjectStorageKey,
  composerSendBlockedReason,
  needsProjectFolderMapping,
  normalizeComposerBranch,
  normalizeProjectFolderPath,
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
  it("defaults blank input to main", () => {
    expect(normalizeComposerBranch("")).toBe(DEFAULT_COMPOSER_BRANCH);
    expect(normalizeComposerBranch(" feature/foo ")).toBe("feature/foo");
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
