import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  buildProjectMenuItems,
  buildSessionMenuItems,
  buildTabMenuItems,
  firstEnabledMenuIndex,
  nextEnabledMenuIndex,
  shouldDismissContextMenu,
} from "../src/harness/contextMenus.ts";

describe("context menu specs", () => {
  it("lists Linear-style project actions", () => {
    expect(buildProjectMenuItems().map((item) => item.key)).toStrictEqual([
      "settings",
      "rename",
      "delete",
    ]);
    expect(buildProjectMenuItems().at(-1)).toMatchObject({
      danger: true,
      key: "delete",
    });
  });

  it("disables rename and delete on Personal DM with a reason", () => {
    const items = buildSessionMenuItems("dm");
    expect(items.map((item) => item.key)).toStrictEqual([
      "open",
      "background",
      "copy",
      "rename",
      "delete",
    ]);
    expect(items.find((item) => item.key === "rename")).toMatchObject({
      disabled: true,
      disabledReason: "Personal DM の名前は変更できません",
    });
    expect(items.find((item) => item.key === "delete")).toMatchObject({
      danger: true,
      disabled: true,
      disabledReason: "Personal DM は削除できません",
    });
  });

  it("lets threads and project chats be renamed or deleted", () => {
    expect(
      buildSessionMenuItems("thread").find((item) => item.key === "rename")
        ?.disabled
    ).toBeFalsy();
    expect(
      buildSessionMenuItems("project").find((item) => item.key === "delete")
        ?.disabled
    ).toBeFalsy();
  });

  it("adds VS Code / Chrome tab close actions plus rename", () => {
    const items = buildTabMenuItems({
      canCloseOthers: false,
      canCloseRight: true,
      kind: "thread",
    });
    expect(items.map((item) => item.key)).toStrictEqual([
      "close",
      "close-others",
      "close-right",
      "rename",
    ]);
    expect(
      items.find((item) => item.key === "close-others")?.disabled
    ).toBeTruthy();
    expect(items.find((item) => item.key === "rename")?.disabled).toBeFalsy();
  });
});

describe("context menu keyboard", () => {
  it("skips disabled rows when moving with arrows", () => {
    const items = [
      { disabled: false },
      { disabled: true },
      { disabled: false },
    ];
    expect(firstEnabledMenuIndex(items)).toBe(0);
    expect(nextEnabledMenuIndex(items, 0, 1)).toBe(2);
    expect(nextEnabledMenuIndex(items, 2, 1)).toBe(0);
    expect(nextEnabledMenuIndex(items, 0, -1)).toBe(2);
  });
});

describe("context menu dismiss", () => {
  it("stays open for clicks inside the portal, like TAH-70", () => {
    const inside = {
      closest: (selector: string) =>
        selector === "[data-context-menu]" ? {} : null,
    };
    const outside = { closest: () => null };
    expect(shouldDismissContextMenu(inside)).toBeFalsy();
    expect(shouldDismissContextMenu(outside)).toBeTruthy();
  });
});

describe("context menu wiring", () => {
  it("mounts the shared portal menu on projects, sessions, and tabs", () => {
    const shell = readFileSync("src/harness/Shell.tsx", "utf-8");
    const sidebar = readFileSync(
      "src/components/primitives/SidebarNav.tsx",
      "utf-8"
    );
    expect(sidebar).toContain("onGroupContextMenu");
    expect(sidebar).toContain("event.preventDefault()");
    expect(shell).toContain("buildProjectMenuItems");
    expect(shell).toContain("buildSessionMenuItems");
    expect(shell).toContain("buildTabMenuItems");
  });

  it("wires settings, rename, and delete through the shared menu", () => {
    const shell = readFileSync("src/harness/Shell.tsx", "utf-8");
    const menu = readFileSync("src/harness/ui/ContextMenu.tsx", "utf-8");
    expect(shell).toContain('kind: "projectSettings"');
    expect(shell).toContain('kind: "renameChat"');
    expect(shell).toContain('kind: "deleteProject"');
    expect(menu).toContain("shouldDismissContextMenu");
    expect(menu).toContain("ArrowDown");
  });

  it("keeps banned vendor copy out of the menu primitive", () => {
    const menu = readFileSync("src/harness/ui/ContextMenu.tsx", "utf-8");
    expect(menu).toContain("createPortal");
    expect(menu).not.toMatch(/OpenConnector|OOMOL|workers\.dev|gateway/i);
  });
});
