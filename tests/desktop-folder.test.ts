import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  DESKTOP_IPC,
  isAllowedFolderPath,
  parseBrowseFolderRequest,
  parsePickFolderRequest,
  supportsDesktopFolderBrowse,
  supportsDesktopFolderPicker,
} from "@tahcode/core/desktop";
import { describe, expect, it } from "vitest";

import {
  browseFolderAt,
  readFolderGitRemote,
} from "../apps/desktop/src/main/folderList";

describe("desktop folder IPC contract", () => {
  it("allow-lists pick and browse channels", () => {
    expect(DESKTOP_IPC.pickFolder).toBe("tahcode:desktop:pickFolder");
    expect(DESKTOP_IPC.browseFolder).toBe("tahcode:desktop:browseFolder");
  });

  it("parses optional paths and rejects NUL", () => {
    expect(parsePickFolderRequest(null)).toStrictEqual({});
    expect(
      parsePickFolderRequest({ defaultPath: "/Users/ada/code" })
    ).toStrictEqual({ defaultPath: "/Users/ada/code" });
    expect(parseBrowseFolderRequest({ path: "/tmp" })).toStrictEqual({
      path: "/tmp",
    });
    expect(isAllowedFolderPath("/tmp/\0x")).toBeFalsy();
    expect(parseBrowseFolderRequest({ path: "/tmp/\0x" })).toStrictEqual({});
  });

  it("feature-detects older shells without folder APIs", () => {
    expect(supportsDesktopFolderPicker(null)).toBeFalsy();
    expect(
      supportsDesktopFolderBrowse({ browseFolder: () => {} })
    ).toBeTruthy();
    expect(supportsDesktopFolderPicker({ pickFolder: () => {} })).toBeTruthy();
  });
});

describe("desktop folder listing", () => {
  it("lists directories and reads an origin remote", () => {
    const root = mkdtempSync(join(tmpdir(), "tah-folder-"));
    mkdirSync(join(root, "src"));
    mkdirSync(join(root, ".git"));
    writeFileSync(
      join(root, ".git", "config"),
      `[remote "origin"]\n\turl = git@github.com:acme/web.git\n`
    );
    const listed = browseFolderAt(root);
    expect(listed.ok).toBeTruthy();
    if (!listed.ok) {
      return;
    }
    expect(listed.entries.some((entry) => entry.name === "src")).toBeTruthy();
    expect(listed.gitRemoteUrl).toBe("https://github.com/acme/web");
    expect(readFolderGitRemote(root)).toBe("https://github.com/acme/web");
  });
});
