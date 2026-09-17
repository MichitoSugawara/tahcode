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
  isMiddleClickButton,
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
    expect(sections[1]?.label).toBe("DM");
    expect(sections[0]?.groups[0]?.items.map((item) => item.id)).toStrictEqual([
      "c1",
    ]);
    expect(sections[1]?.groups[0]?.items[0]).toMatchObject({
      id: "dm1",
      label: "Personal DM",
    });
  });

  it("lists no-project threads next to Personal DM, not inside a project", () => {
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
          _id: "t1",
          kind: "thread",
          ownerId: "me",
          title: "こんに血は",
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
    expect(sections[0]?.groups[0]?.items.map((item) => item.id)).toStrictEqual([
      "c1",
    ]);
    expect(sections[1]?.groups[0]?.items.map((item) => item.id)).toStrictEqual([
      "dm1",
      "t1",
    ]);
    expect(sections[1]?.groups[0]?.items[1]).toMatchObject({
      kind: "thread",
      label: "こんに血は",
    });
  });

  it("shows an empty-project hint and section-level create when there are no projects", () => {
    const sections = buildSidebarSections({
      chats: [],
      isAdmin: true,
      meId: "me",
      projects: [],
    });
    expect(sections[0]?.addKind).toBe("createProject");
    expect(sections[0]?.groups[0]).toMatchObject({
      hideHeader: true,
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

  it("treats button 1 as the middle-click close used by Chrome / VS Code", () => {
    expect(isMiddleClickButton(1)).toBeTruthy();
    expect(isMiddleClickButton(0)).toBeFalsy();
    expect(isMiddleClickButton(2)).toBeFalsy();
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

  it("falls back to text/plain when the in-memory drag id is gone", () => {
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
    writeChatDrag(transfer, "chat-plain");
    store[CHAT_DRAG_MIME] = "";
    endChatDrag();
    expect(peekChatDrag()).toBeNull();
    expect(readChatDrag(transfer)).toBe("chat-plain");
    expect(isChatDrag({ ...transfer, types: ["text/plain"] })).toBeFalsy();
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
    const scroller = shell.indexOf("data-shell-tab-scroller");
    const tools = shell.indexOf("data-shell-header-tools");
    expect(scroller).toBeGreaterThan(-1);
    expect(tools).toBeGreaterThan(scroller);
    expect(shell).toContain("overflow-x-auto");
    expect(shell).toContain("flex-none");
    expect(shell).toContain("data-shell-chat-drop");
  });

  it("opens the verification workbench from the header tools", () => {
    const shell = readFileSync("src/harness/Shell.tsx", "utf-8");
    const rail = readFileSync("src/harness/rail/RightRail.tsx", "utf-8");
    expect(shell).toContain("data-shell-workbench-toggle");
    expect(shell).toContain("useWorkbenchDocked");
    expect(shell).toContain("WorkbenchResizeHandle");
    expect(rail).toContain("WorkbenchTabStrip");
    expect(rail).not.toMatch(
      /OpenConnector|OOMOL|workers\.dev|gateway|ContextPane/i
    );
  });

  it("keeps runtime off the left-rail labels in Shell", () => {
    const shell = readFileSync("src/harness/Shell.tsx", "utf-8");
    const palette = readFileSync("src/harness/CommandPalette.tsx", "utf-8");
    expect(shell).not.toContain('label: "ランタイム"');
    expect(shell).not.toContain('groupsLabel="チャット"');
    expect(palette).toContain('goSettings("runtimes")');
  });

  it("closes tabs on middle-click", () => {
    const shell = readFileSync("src/harness/Shell.tsx", "utf-8");
    expect(shell).toContain("isMiddleClickButton");
    expect(shell).toContain("data-shell-tab");
    expect(shell).toContain("onAuxClick");
  });

  it("opens sessions from sidebar DnD onto the tab strip", () => {
    const shell = readFileSync("src/harness/Shell.tsx", "utf-8");
    const sidebar = readFileSync(
      "src/components/primitives/SidebarNav.tsx",
      "utf-8"
    );
    expect(shell).toContain("writeChatDrag");
    expect(shell).toContain("data-shell-chat-drop");
    expect(sidebar).toContain("draggable");
    expect(sidebar).toContain("onItemDragStart");
    expect(shell).not.toMatch(/OpenConnector|OOMOL|workers\.dev|gateway/i);
  });

  it("keeps the chats section heading as a label only", () => {
    const sidebar = readFileSync(
      "src/components/primitives/SidebarNav.tsx",
      "utf-8"
    );
    const chatsHeading = sidebar.match(
      /data-sidebar-section-heading=\{section\.id\}[\s\S]*?<\/div>/
    )?.[0];
    expect(chatsHeading).toBeTruthy();
    expect(chatsHeading).toContain("{section.label}");
    expect(chatsHeading).not.toContain("<button");
    expect(chatsHeading).not.toContain("Plus");
    expect(chatsHeading).not.toContain("Search");
  });

  it("drops leftover chats search chrome", () => {
    const sidebar = readFileSync(
      "src/components/primitives/SidebarNav.tsx",
      "utf-8"
    );
    expect(sidebar).not.toContain("チャットを検索");
    expect(sidebar).not.toContain("onAddGroup");
    expect(sidebar).not.toContain("<Search");
  });

  it("stops generation from the composer only", () => {
    const reply = readFileSync("src/harness/thread/AgentReply.tsx", "utf-8");
    const promptBar = readFileSync(
      "src/components/primitives/PromptBar.tsx",
      "utf-8"
    );
    const replyHeader = reply.match(/<header[\s\S]*?<\/header>/)?.[0];
    expect(replyHeader).toBeTruthy();
    expect(replyHeader).not.toContain("中断");
    expect(reply).not.toContain("生成を中断");
    expect(promptBar).toContain(
      'aria-label={jobRunning ? "生成を中断" : "送信"}'
    );
  });

  it("keeps invite email optional in the dialog", () => {
    const invite = readFileSync(
      "src/harness/dialogs/InviteDialog.tsx",
      "utf-8"
    );
    expect(invite).toContain('type="email"');
    expect(invite).toContain("normalizeOptionalEmail");
  });

  it("does not put a create action on the personal chats group", () => {
    const sections = buildSidebarSections({
      chats: [
        {
          _id: "dm1",
          kind: "dm",
          ownerId: "me",
          title: "ignored",
          visibility: "inherit",
        },
      ],
      isAdmin: true,
      meId: "me",
      projects: [],
    });
    expect(sections[1]).toMatchObject({ id: "chats", label: "DM" });
    expect(sections[1]?.groups[0]?.addKind).toBeUndefined();
  });

  it("mounts the composer context bar instead of a runtime picker", () => {
    const composer = readFileSync("src/harness/Composer.tsx", "utf-8");
    const bar = readFileSync("src/harness/ComposerContextBar.tsx", "utf-8");
    expect(composer).toContain("data-composer-shell");
    expect(composer).toContain("embedded");
    expect(composer).not.toContain('id: "runtime"');
    expect(bar).toContain("data-composer-context-bar");
    expect(bar).toContain("rounded-t-[22px]");
  });

  it("exposes project, machine, and branch on the context bar", () => {
    const bar = readFileSync("src/harness/ComposerContextBar.tsx", "utf-8");
    expect(bar).toContain("プロジェクトを選択");
    expect(bar).toContain("マシンを選択");
    expect(bar).toContain("ブランチを選択");
    expect(bar).toContain("evaluateComposerBranchApply");
    expect(bar).not.toMatch(/OpenConnector|OOMOL|workers\.dev|gateway/i);
  });

  it("does not treat a branch pick as checked out", () => {
    const bar = readFileSync("src/harness/ComposerContextBar.tsx", "utf-8");
    const composer = readFileSync("src/harness/Composer.tsx", "utf-8");
    expect(bar).not.toContain("onChange={org.setComposerBranch}");
    expect(bar).toContain("data-composer-branch-error");
    expect(composer).toContain("disabled: catalogLocked");
    expect(composer).toContain("COMPOSER_CATALOG_OFFLINE_MESSAGE");
    expect(composer).not.toContain("別のモデルも指名できます");
  });

  it("keeps offline catalog copy even when /new hides decorative hints", () => {
    const composer = readFileSync("src/harness/Composer.tsx", "utf-8");
    const catalog = composer.indexOf("} else if (catalogLocked) {");
    const hide = composer.indexOf("} else if (hideHint) {");
    expect(catalog).toBeGreaterThan(-1);
    expect(hide).toBeGreaterThan(catalog);
  });

  it("drops the composer helper footnote near EmptyHero", () => {
    const chat = readFileSync("src/pages/ChatPage.tsx", "utf-8");
    expect(chat).not.toContain("別のモデルも指名できます");
    expect(chat).not.toContain("メンションは不要です");
    expect(chat).not.toContain("modelMentionExample");
  });

  it("lets create-project map a folder per machine", () => {
    const create = readFileSync(
      "src/harness/dialogs/CreateProjectDialog.tsx",
      "utf-8"
    );
    expect(create).toContain("マシン別フォルダ");
    expect(create).toContain("GitHub リポジトリ");
    expect(create).not.toContain("リソース（任意）");
    expect(create).toContain("FolderBrowser");
    expect(create).toContain("initialPath");
  });

  it("uses desktop listing only when the shell can browse folders", () => {
    const browser = readFileSync(
      "src/harness/dialogs/FolderBrowser.tsx",
      "utf-8"
    );
    expect(browser).toContain("hasDesktopFolderBrowse");
    expect(browser).toContain("api.runtimeFs.request");
    expect(browser).toContain("このフォルダを使う");
  });

  it("splits repo and per-machine folders in project settings from TAH-77", () => {
    const settings = readFileSync(
      "src/harness/dialogs/ProjectSettingsDialog.tsx",
      "utf-8"
    );
    const fields = readFileSync(
      "src/harness/dialogs/ProjectResourceFields.tsx",
      "utf-8"
    );
    expect(settings).toContain("GithubRepoField");
    expect(settings).toContain("MachineFolderFields");
    expect(settings).toContain("setRuntimeFolders");
    expect(fields).toContain("data-project-repo-section");
    expect(fields).toContain("フォルダを選ぶ");
  });

  it("lets each machine row clear an optional folder", () => {
    const fields = readFileSync(
      "src/harness/dialogs/ProjectResourceFields.tsx",
      "utf-8"
    );
    expect(fields).toContain("data-project-machine-folders");
    expect(fields).toContain("クリア");
    expect(fields).toContain("未設定");
  });

  it("opens rename and delete from the shared context-menu dialogs", () => {
    const host = readFileSync("src/harness/dialogs/DialogHost.tsx", "utf-8");
    expect(host).toContain("api.chats.rename");
    expect(host).toContain("api.chats.remove");
    expect(host).toContain("api.projects.update");
    expect(host).toContain("api.projects.remove");
  });

  it("confirms destructive deletes in Japanese", () => {
    const confirm = readFileSync(
      "src/harness/dialogs/ConfirmDialog.tsx",
      "utf-8"
    );
    const settings = readFileSync(
      "src/harness/dialogs/ProjectSettingsDialog.tsx",
      "utf-8"
    );
    expect(confirm).toContain("この操作は取り消せません");
    expect(settings).toContain("プロジェクト設定");
    expect(settings).not.toMatch(/OpenConnector|OOMOL|workers\.dev|gateway/i);
  });

  it("builds chat and home paths used by copy-link", () => {
    expect(orgHomePath("acme")).toBe("/o/acme");
    expect(orgChatPath("acme", "chat1")).toBe("/o/acme/c/chat1");
    expect(orgNewChatPath("acme")).toBe("/o/acme/new");
  });
});
