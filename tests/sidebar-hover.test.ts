import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  buildSectionMenuItems,
  shouldDismissContextMenu,
} from "../src/harness/contextMenus.ts";
import {
  isSidebarSectionId,
  menuAnchorPosition,
  projectChatCountLabel,
  projectPeekPath,
  sidebarHoverActionsVisible,
} from "../src/harness/sidebarHover.ts";
import {
  buildSidebarSections,
  sidebarSectionAddLabel,
} from "../src/harness/sidebarModel.ts";

function moreTriggerTarget() {
  return {
    closest: (selector: string) =>
      selector === "[data-sidebar-more]" ? {} : null,
    getBoundingClientRect: () => ({
      bottom: 40,
      left: 10,
      right: 80,
      top: 20,
    }),
  };
}

function cursorTarget() {
  return {
    closest: () => null,
  };
}

describe("sidebar hover visibility", () => {
  it("hides actions unless hovered, focused, or a menu is open", () => {
    expect(
      sidebarHoverActionsVisible({
        focusWithin: false,
        hovered: false,
        menuOpen: false,
      })
    ).toBeFalsy();
    expect(
      sidebarHoverActionsVisible({
        focusWithin: false,
        hovered: true,
        menuOpen: false,
      })
    ).toBeTruthy();
    expect(
      sidebarHoverActionsVisible({
        focusWithin: true,
        hovered: false,
        menuOpen: false,
      })
    ).toBeTruthy();
    expect(
      sidebarHoverActionsVisible({
        focusWithin: false,
        hovered: false,
        menuOpen: true,
      })
    ).toBeTruthy();
    expect(
      sidebarHoverActionsVisible({
        collapsed: true,
        focusWithin: true,
        hovered: true,
        menuOpen: true,
      })
    ).toBeFalsy();
  });
});

describe("sidebar section create", () => {
  it("labels プロジェクト / DM and attaches section create kinds", () => {
    const sections = buildSidebarSections({
      chats: [],
      isAdmin: true,
      meId: "me",
      projects: [{ _id: "p1", name: "Alpha", visibility: "org" }],
    });
    expect(
      sections.map((section) => [section.label, section.addKind])
    ).toStrictEqual([
      ["プロジェクト", "createProject"],
      ["DM", "newChat"],
    ]);
    expect(sidebarSectionAddLabel(sections[0] ?? {})).toBe(
      "新しいプロジェクト"
    );
    expect(sidebarSectionAddLabel(sections[1] ?? {})).toBe("新しいチャット");
    expect(sections[0]?.groups[0]?.addKind).toBe("newChat");
    expect(sections[1]?.groups[0]?.hideHeader).toBeTruthy();
  });

  it("lists section overflow create actions", () => {
    expect(buildSectionMenuItems("projects")[0]?.label).toBe(
      "新しいプロジェクト"
    );
    expect(buildSectionMenuItems("chats")[0]?.label).toBe("新しいチャット");
    expect(isSidebarSectionId("chats")).toBeTruthy();
    expect(isSidebarSectionId("rail")).toBeFalsy();
  });

  it("keeps empty-project create on the section, not a fake group +", () => {
    const sections = buildSidebarSections({
      chats: [],
      isAdmin: true,
      meId: "me",
      projects: [],
    });
    expect(sections[0]).toMatchObject({
      addKind: "createProject",
      label: "プロジェクト",
    });
    expect(sections[0]?.groups[0]).toMatchObject({
      hideHeader: true,
      kind: "empty-projects",
    });
    expect(sections[0]?.groups[0]?.addKind).toBeUndefined();
  });
});

describe("project peek", () => {
  it("prefers the current machine folder, then the first mapped path", () => {
    expect(
      projectPeekPath(
        {
          cwd: "~/fallback",
          folders: [
            { cwd: "~/works/me/alpha", runtimeId: "r1" },
            { cwd: "/other", runtimeId: "r2" },
          ],
        },
        "r2"
      )
    ).toBe("/other");
    expect(
      projectPeekPath({
        folders: [{ cwd: "  ~/works/me/adhd-stackk  ", runtimeId: "r1" }],
      })
    ).toBe("~/works/me/adhd-stackk");
    expect(projectPeekPath({ cwd: "  " })).toBeUndefined();
    expect(projectChatCountLabel(1)).toBe("1件のチャット");
  });

  it("anchors … menus to the trigger, and right-click to the cursor", () => {
    expect(
      menuAnchorPosition({
        clientX: 12,
        clientY: 34,
        currentTarget: moreTriggerTarget(),
      })
    ).toStrictEqual({ x: 84, y: 20 });
    expect(
      menuAnchorPosition({
        clientX: 12,
        clientY: 34,
        currentTarget: cursorTarget(),
      })
    ).toStrictEqual({ x: 12, y: 34 });
  });
});

describe("sidebar hover source contracts", () => {
  it("reveals section and project create actions only via hover CSS", () => {
    const sidebar = readFileSync(
      "src/components/primitives/SidebarNav.tsx",
      "utf-8"
    );
    const css = readFileSync("src/app/beautifui/sidebar-nav.css", "utf-8");
    expect(sidebar).toContain("data-sidebar-hover-actions");
    expect(sidebar).toContain("data-sidebar-more");
    expect(sidebar).toContain("SquarePen");
    expect(sidebar).toContain("MoreHorizontal");
    expect(css).toContain(".sidebar-hover-target:hover .sidebar-hover-actions");
  });

  it("wires section create and the Linear-style project peek", () => {
    const css = readFileSync("src/app/beautifui/sidebar-nav.css", "utf-8");
    const shell = readFileSync("src/harness/Shell.tsx", "utf-8");
    expect(css).toContain(
      ".sidebar-hover-target:focus-within .sidebar-hover-actions"
    );
    expect(shell).toContain("buildSectionMenuItems");
    expect(shell).toContain("ProjectPeekHeader");
    expect(shell).toContain('goNewChat(group.projectId as Id<"projects">)');
    expect(shell).not.toMatch(/OpenConnector|OOMOL|workers\.dev|gateway/i);
  });

  it("keeps the more trigger in the TAH-70 dismiss keep-open set", () => {
    const more = {
      closest: (selector: string) =>
        selector === "[data-sidebar-more]" ? {} : null,
    };
    const sidebar = readFileSync(
      "src/components/primitives/SidebarNav.tsx",
      "utf-8"
    );
    expect(shouldDismissContextMenu(more)).toBeFalsy();
    expect(sidebar).not.toMatch(/OpenConnector|OOMOL|workers\.dev|gateway/i);
  });
});
