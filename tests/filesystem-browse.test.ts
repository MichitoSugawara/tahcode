import { describe, expect, it } from "vitest";

import {
  BRIDGE_CAPABILITY_FILESYSTEM_BROWSE,
  evaluateFolderPick,
  filterBrowseEntries,
  folderPickHint,
  homeAliasPath,
  normalizeOptionalRepoUrl,
  parentBrowsePath,
  parseGitRemoteFromConfig,
  runtimeHasFilesystemBrowse,
  sameDesktopHost,
  suggestGithubRepoUrl,
  toBrowseResult,
} from "../shared/filesystemBrowse.ts";

const GIT_CONFIG = `[core]
	repositoryformatversion = 0
[remote "origin"]
	url = git@github.com:acme/web.git
	fetch = +refs/heads/*:refs/remotes/origin/*
[remote "upstream"]
	url = https://github.com/other/web.git
`;

describe("git remote parsing", () => {
  it("prefers origin and turns SSH into a GitHub https URL", () => {
    expect(parseGitRemoteFromConfig(GIT_CONFIG)).toBe(
      "git@github.com:acme/web.git"
    );
    expect(suggestGithubRepoUrl("git@github.com:acme/web.git")).toBe(
      "https://github.com/acme/web"
    );
    expect(suggestGithubRepoUrl("ssh://git@github.com/acme/web.git")).toBe(
      "https://github.com/acme/web"
    );
    expect(suggestGithubRepoUrl("https://github.com/acme/web.git")).toBe(
      "https://github.com/acme/web"
    );
    expect(suggestGithubRepoUrl("acme/web")).toBe(
      "https://github.com/acme/web"
    );
  });

  it("leaves empty remotes unset and never invents a GitHub host", () => {
    expect(parseGitRemoteFromConfig("[core]\n")).toBeUndefined();
    expect(suggestGithubRepoUrl("")).toBeUndefined();
    expect(suggestGithubRepoUrl("  ")).toBeUndefined();
    expect(normalizeOptionalRepoUrl("  ")).toBeUndefined();
    expect(normalizeOptionalRepoUrl("acme/web")).toBe(
      "https://github.com/acme/web"
    );
  });
});

describe("browse path helpers", () => {
  it("expands ~ and walks to the parent", () => {
    expect(homeAliasPath("~", "/Users/ada")).toBe("/Users/ada");
    expect(homeAliasPath("~/code", "/Users/ada")).toBe("/Users/ada/code");
    expect(parentBrowsePath("/Users/ada/code", "/Users/ada")).toBe(
      "/Users/ada"
    );
    expect(parentBrowsePath("/Users/ada", "/Users/ada")).toBe("/Users");
    expect(parentBrowsePath("/", "/Users/ada")).toBeNull();
  });

  it("builds a sorted directory listing and attaches a git hint", () => {
    const result = toBrowseResult({
      dirNames: ["web", "docs", "app"],
      gitConfigText: GIT_CONFIG,
      homePath: "/Users/ada",
      path: "/Users/ada/code",
    });
    expect(result.entries.map((entry) => entry.name)).toStrictEqual([
      "app",
      "docs",
      "web",
    ]);
    expect(result.entries[0]?.path).toBe("/Users/ada/code/app");
    expect(result.gitRemoteUrl).toBe("https://github.com/acme/web");
    expect(result.parentPath).toBe("/Users/ada");
  });

  it("filters directory names without changing the source list", () => {
    const entries = [
      { kind: "dir" as const, name: "web", path: "/web" },
      { kind: "dir" as const, name: "docs", path: "/docs" },
    ];
    expect(
      filterBrowseEntries(entries, "WE").map((entry) => entry.name)
    ).toStrictEqual(["web"]);
    expect(entries).toHaveLength(2);
  });
});

describe("folder pick mode", () => {
  it("prefers the native picker on this desktop machine", () => {
    expect(
      evaluateFolderPick({
        canUse: true,
        desktopBrowse: true,
        desktopPick: true,
        isLocalDesktop: true,
        live: true,
        runtimeHasBrowse: true,
      })
    ).toMatchObject({ mode: "native", reason: "readyNative" });
  });

  it("uses browse for remote or when native pick is missing", () => {
    expect(
      evaluateFolderPick({
        canUse: true,
        desktopBrowse: false,
        desktopPick: false,
        isLocalDesktop: false,
        live: true,
        runtimeHasBrowse: true,
      }).mode
    ).toBe("browse");
    expect(
      evaluateFolderPick({
        canUse: true,
        desktopBrowse: false,
        desktopPick: false,
        isLocalDesktop: false,
        live: false,
        runtimeHasBrowse: true,
      })
    ).toMatchObject({ mode: "unavailable", reason: "offline" });
    expect(
      evaluateFolderPick({
        canUse: true,
        desktopBrowse: false,
        desktopPick: false,
        isLocalDesktop: false,
        live: true,
        runtimeHasBrowse: false,
      })
    ).toMatchObject({ mode: "unavailable", reason: "oldBridge" });
  });

  it("matches desktop hostnames and the browse capability bit", () => {
    expect(sameDesktopHost("MacBook-Pro.local", "MacBook-Pro")).toBeTruthy();
    expect(sameDesktopHost("studio", "office")).toBeFalsy();
    expect(
      runtimeHasFilesystemBrowse([BRIDGE_CAPABILITY_FILESYSTEM_BROWSE])
    ).toBeTruthy();
    expect(folderPickHint("offline")).toContain("オフライン");
  });
});
