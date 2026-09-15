import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  beginChatDrag,
  CHAT_DRAG_MIME,
  endChatDrag,
  isChatDrag,
  peekChatDrag,
  readChatDrag,
  writeChatDrag,
} from "../src/harness/sessionDrag.ts";
import {
  buildSidebarSections,
  SIDEBAR_RAIL_KEYS,
} from "../src/harness/sidebarModel.ts";
import {
  closeOtherTabs,
  closeTabsToTheRight,
  isCloseTabShortcut,
  isEditableKeyboardTarget,
  tabStillOpen,
} from "../src/harness/tabActions.ts";
import {
  inviteAcceptErrorMessage,
  normalizeOptionalEmail,
  optionalInviteEmailError,
} from "../src/lib/inviteEmail.ts";
import {
  orgChatPath,
  orgHomePath,
  orgNewChatPath,
} from "../src/lib/orgPaths.ts";

describe("sidebar IA", () => {
  it("puts Projects above Chats and keeps Personal DM outside projects", () => {
    const sections = buildSidebarSections({
      chats: [
        {
          _id: "dm1",
          kind: "dm",
          ownerId: "me",
          title: "ignored",
          visibility: "inherit",
        },
        {
          _id: "c1",
          kind: "project",
          projectId: "p1",
          title: "General",
          visibility: "inherit",
        },
      ],
      isAdmin: true,
      meId: "me",
      projects: [{ _id: "p1", name: "Alpha", visibility: "org" }],
    });
    expect(sections.map((section) => section.id)).toStrictEqual([
      "projects",
      "chats",
    ]);
    expect(sections[0]?.label).toBe("プロジェクト");
    expect(sections[0]?.groups[0]?.items.map((item) => item.id)).toStrictEqual([
      "c1",
    ]);
    expect(sections[1]?.groups[0]?.items[0]).toMatchObject({
      id: "dm1",
      label: "Personal DM",
    });
  });

  it("shows an empty-project create row when there are no projects", () => {
    const sections = buildSidebarSections({
      chats: [],
      isAdmin: true,
      meId: "me",
      projects: [],
    });
    expect(sections[0]?.groups[0]).toMatchObject({
      addKind: "createProject",
      kind: "empty-projects",
    });
  });

  it("does not put Runtime on the left rail", () => {
    expect(SIDEBAR_RAIL_KEYS).toStrictEqual([
      "new",
      "home",
      "invite",
      "connectors",
    ]);
    expect(SIDEBAR_RAIL_KEYS).not.toContain("runtimes");
  });
});

describe("tab actions", () => {
  it("closes others and to the right like a browser/IDE tab strip", () => {
    const tabs = ["a", "b", "c", "d"];
    expect(closeOtherTabs(tabs, "b")).toStrictEqual(["b"]);
    expect(closeTabsToTheRight(tabs, "b")).toStrictEqual(["a", "b"]);
    expect(closeTabsToTheRight(tabs, "missing")).toStrictEqual(tabs);
    expect(tabStillOpen(["a", "b"], "c")).toBeFalsy();
    expect(tabStillOpen(["a", "b"], "b")).toBeTruthy();
  });

  it("treats ⌘W / Ctrl+W as close-tab only outside fields", () => {
    const close = {
      altKey: false,
      ctrlKey: true,
      key: "w",
      metaKey: false,
      shiftKey: false,
    };
    expect(isCloseTabShortcut(close)).toBeTruthy();
    expect(isCloseTabShortcut({ ...close, shiftKey: true })).toBeFalsy();
    expect(isEditableKeyboardTarget(null)).toBeFalsy();
  });
});

describe("session drag", () => {
  it("round-trips a chat id through the custom mime", () => {
    const store: Record<string, string> = {};
    const types: string[] = [];
    const transfer = {
      effectAllowed: "none",
      getData: (type: string) => store[type] ?? "",
      setData: (type: string, value: string) => {
        store[type] = value;
        if (!types.includes(type)) {
          types.push(type);
        }
      },
      types,
    };
    beginChatDrag("chat-1");
    writeChatDrag(transfer, "chat-1");
    expect(transfer.getData(CHAT_DRAG_MIME)).toBe("chat-1");
    expect(isChatDrag(transfer)).toBeTruthy();
    expect(readChatDrag(transfer)).toBe("chat-1");
    expect(peekChatDrag()).toBe("chat-1");
    endChatDrag();
    expect(peekChatDrag()).toBeNull();
  });
});

describe("invite email", () => {
  it("keeps email optional and rejects bad shapes", () => {
    expect(normalizeOptionalEmail("  ")).toBeUndefined();
    expect(normalizeOptionalEmail("Ada@Example.com")).toBe("ada@example.com");
    expect(optionalInviteEmailError("")).toBeNull();
    expect(optionalInviteEmailError("not-an-email")).toBe(
      "メールアドレスの形式が正しくありません"
    );
  });

  it("maps accept-invite failures to Japanese copy", () => {
    expect(
      inviteAcceptErrorMessage(
        new Error("This invite is for a different email")
      )
    ).toBe("この招待は別のメールアドレス宛です。");
    expect(inviteAcceptErrorMessage(new Error("Invite expired"))).toBe(
      "この招待は期限切れです。発行者に再発行を依頼してください。"
    );
  });
});

describe("shell source contracts", () => {
  it("keeps header tools out of the scrolling tab row", () => {
    const shell = readFileSync("src/harness/Shell.tsx", "utf-8");
    expect(shell).toContain("data-shell-tab-scroller");
    expect(shell).toContain("data-shell-header-tools");
    expect(shell).not.toContain('label: "ランタイム"');
    expect(shell).not.toContain('groupsLabel="チャット"');
    const palette = readFileSync("src/harness/CommandPalette.tsx", "utf-8");
    expect(palette).toContain('goSettings("runtimes")');
  });

  it("drops heading search/plus and the agent-row interrupt", () => {
    const sidebar = readFileSync(
      "src/components/primitives/SidebarNav.tsx",
      "utf-8"
    );
    const reply = readFileSync("src/harness/thread/AgentReply.tsx", "utf-8");
    const invite = readFileSync(
      "src/harness/dialogs/InviteDialog.tsx",
      "utf-8"
    );
    expect(sidebar).not.toContain("チャットを検索");
    expect(sidebar).not.toContain("onAddGroup");
    expect(reply).not.toContain("生成を中断");
    expect(invite).toContain('type="email"');
    expect(invite).toContain("normalizeOptionalEmail");
  });

  it("builds chat and home paths used by copy-link", () => {
    expect(orgHomePath("acme")).toBe("/o/acme");
    expect(orgChatPath("acme", "chat1")).toBe("/o/acme/c/chat1");
    expect(orgNewChatPath("acme")).toBe("/o/acme/new");
  });
});
