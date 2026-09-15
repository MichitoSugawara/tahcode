import { existsSync, readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  checkoutPathLabel,
  newChatHeroName,
  NO_PROJECT_LABEL,
  readNewChatProjectParam,
  resolveNewChatProjectId,
  titleFromFirstMessage,
} from "../src/lib/newChat.ts";
import {
  isNewChatPath,
  orgHomePath,
  orgNewChatPath,
} from "../src/lib/orgPaths.ts";

describe("new chat defaults", () => {
  it("reads ?project= and ignores empty values", () => {
    expect(readNewChatProjectParam("")).toBeNull();
    expect(readNewChatProjectParam("?project=")).toBeNull();
    expect(readNewChatProjectParam("?project=p1")).toBe("p1");
  });

  it("defaults to no project and keeps an unknown id unselected", () => {
    expect(resolveNewChatProjectId("p1", new Set(["p1", "p2"]))).toBe("p1");
    expect(resolveNewChatProjectId("missing", new Set(["p1"]))).toBeNull();
    expect(resolveNewChatProjectId(null, new Set(["p1"]))).toBeNull();
    expect(newChatHeroName(null)).toBe(NO_PROJECT_LABEL);
    expect(newChatHeroName("Alpha")).toBe("Alpha");
  });

  it("titles a project chat from the first line, else 新しいチャット", () => {
    expect(titleFromFirstMessage("  認証を直して\n続き")).toBe("認証を直して");
    expect(titleFromFirstMessage("   ")).toBe("新しいチャット");
    expect(titleFromFirstMessage("x".repeat(90))).toHaveLength(80);
  });

  it("shows checkout as display-only path, not a fake branch", () => {
    expect(checkoutPathLabel(undefined, false)).toBe("プロジェクト未選択");
    expect(checkoutPathLabel("  ", true)).toBe("未設定");
    expect(checkoutPathLabel("~/code/web", true)).toBe("~/code/web");
  });

  it("builds /new as a page path, not a dialog", () => {
    expect(orgNewChatPath("acme")).toBe("/o/acme/new");
    expect(orgNewChatPath("acme", "p1")).toBe("/o/acme/new?project=p1");
    expect(isNewChatPath("/o/acme/new", "acme")).toBeTruthy();
    expect(isNewChatPath(orgHomePath("acme"), "acme")).toBeFalsy();
  });
});

describe("new chat source contracts", () => {
  it("routes /new and drops the modal", () => {
    const app = readFileSync("src/App.tsx", "utf-8");
    const shell = readFileSync("src/harness/Shell.tsx", "utf-8");
    const host = readFileSync("src/harness/dialogs/DialogHost.tsx", "utf-8");
    expect(app).toContain('path="new"');
    expect(shell).toContain("goNewChat");
    expect(shell).not.toContain('kind: "newChat"');
    expect(host).not.toContain("NewChatDialog");
    expect(existsSync("src/harness/dialogs/NewChatDialog.tsx")).toBeFalsy();
  });
});
