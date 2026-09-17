import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  RIGHT_RAIL_SECTION_ENABLED,
  resolveRailTab,
  visibleRightRailTabs,
} from "../src/harness/rail/flags.ts";
import {
  DEFAULT_WORKBENCH_PANEL,
  isWorkbenchPanelId,
  resolveWorkbenchPanel,
  WORKBENCH_PANEL_IDS,
  WORKBENCH_PANELS,
} from "../src/harness/workbench/panels.ts";
import {
  extractLocalSideChatUserTexts,
  sideChatStorageKey,
} from "../src/harness/workbench/sideChatLocal.ts";
import {
  clampWorkbenchWidth,
  DEFAULT_WORKBENCH_DOCKED,
  parseWorkbenchDocked,
  parseWorkbenchPanel,
  parseWorkbenchStoredRaw,
  WORKBENCH_DOCKED_KEY,
  WORKBENCH_HOME_SCOPE,
  WORKBENCH_WIDTH_KEY,
  WORKBENCH_WIDTH_MAX_PX,
  WORKBENCH_WIDTH_MIN_PX,
  WORKBENCH_WIDTH_PX,
  WORKBENCH_TABS_KEY,
  workbenchDockedKey,
  workbenchPanelKey,
  workbenchScope,
  workbenchTabsKey,
  workbenchWidthKey,
} from "../src/harness/workbench/state.ts";
import {
  closeWorkbenchTab,
  cycleWorkbenchTab,
  DEFAULT_WORKBENCH_TABS,
  ensureWorkbenchTabs,
  openWorkbenchTab,
  parseWorkbenchTabs,
  shouldCollapseWorkbench,
} from "../src/harness/workbench/tabs.ts";

describe("workbench panel catalog", () => {
  it("lists the four verification surfaces", () => {
    expect(WORKBENCH_PANEL_IDS).toStrictEqual([
      "chat",
      "terminal",
      "browser",
      "remote",
    ]);
    expect(WORKBENCH_PANELS.chat.title).toBe("サイドチャット");
    expect(WORKBENCH_PANELS.terminal.title).toBe("ターミナル");
    expect(WORKBENCH_PANELS.browser.title).toBe("ブラウザ");
    expect(WORKBENCH_PANELS.remote.title).toBe("リモートデスクトップ");
  });

  it("defaults to side chat and rejects old settings tab ids", () => {
    expect(DEFAULT_WORKBENCH_PANEL).toBe("chat");
    expect(isWorkbenchPanelId("Context")).toBeFalsy();
    expect(isWorkbenchPanelId("Runtime")).toBeFalsy();
    expect(isWorkbenchPanelId("Team")).toBeFalsy();
    expect(resolveWorkbenchPanel("terminal")).toBe("terminal");
  });

  it("falls back to side chat for unknown panel ids", () => {
    expect(resolveWorkbenchPanel("Context")).toBe("chat");
    expect(resolveWorkbenchPanel()).toBe("chat");
    expect(resolveWorkbenchPanel(null)).toBe("chat");
  });
});

describe("legacy settings rail stays off", () => {
  it("keeps Context / Runtime / Team hidden so they are not the workbench", () => {
    expect(RIGHT_RAIL_SECTION_ENABLED).toStrictEqual({
      Context: false,
      Runtime: false,
      Team: false,
    });
    expect(visibleRightRailTabs()).toStrictEqual([]);
    expect(resolveRailTab("Context")).toBeNull();
  });
});

describe("workbench chrome persistence", () => {
  it("parses docked open/close flags", () => {
    expect(parseWorkbenchDocked(true)).toBeTruthy();
    expect(parseWorkbenchDocked(false)).toBeFalsy();
    expect(parseWorkbenchDocked("yes")).toBe(DEFAULT_WORKBENCH_DOCKED);
    expect(WORKBENCH_DOCKED_KEY).toBe("th:workbench:docked");
  });

  it("scopes docked and panel keys by chatId with a home fallback", () => {
    expect({
      blank: workbenchScope("  "),
      chat: workbenchScope("c1"),
      dockedChat: workbenchDockedKey("c1"),
      missing: workbenchScope(),
      nullable: workbenchScope(null),
    }).toStrictEqual({
      blank: WORKBENCH_HOME_SCOPE,
      chat: "c1",
      dockedChat: "th:workbench:docked:c1",
      missing: WORKBENCH_HOME_SCOPE,
      nullable: WORKBENCH_HOME_SCOPE,
    });
  });

  it("uses home keys when no chat is open", () => {
    expect({
      docked: workbenchDockedKey(),
      panelHome: workbenchPanelKey(),
      tabsHome: workbenchTabsKey(),
      widthHome: workbenchWidthKey(),
    }).toStrictEqual({
      docked: "th:workbench:docked:home",
      panelHome: "th:workbench:panel:home",
      tabsHome: "th:workbench:tabs:home",
      widthHome: "th:workbench:width:home",
    });
  });

  it("scopes open-tab and width keys by chatId", () => {
    expect({
      tabs: workbenchTabsKey("c1"),
      tabsPrefix: WORKBENCH_TABS_KEY,
      width: workbenchWidthKey("c1"),
    }).toStrictEqual({
      tabs: "th:workbench:tabs:c1",
      tabsPrefix: "th:workbench:tabs",
      width: "th:workbench:width:c1",
    });
    expect(workbenchPanelKey("c1")).toBe("th:workbench:panel:c1");
  });

  it("prefers scoped storage and falls back to the legacy global key", () => {
    expect({
      corruptScoped: parseWorkbenchStoredRaw("{", '"browser"'),
      none: parseWorkbenchStoredRaw(null, null),
      scoped: parseWorkbenchStoredRaw("true", "false"),
    }).toStrictEqual({
      corruptScoped: "browser",
      none: undefined,
      scoped: true,
    });
    expect(parseWorkbenchStoredRaw(null, "false")).toBeFalsy();
    expect(parseWorkbenchPanel("browser")).toBe("browser");
    expect(parseWorkbenchPanel("Remote")).toBe("chat");
  });

  it("clamps persisted rail width between min and max", () => {
    expect({
      defaultPx: WORKBENCH_WIDTH_PX,
      high: clampWorkbenchWidth(2000),
      invalid: clampWorkbenchWidth("nope"),
      key: WORKBENCH_WIDTH_KEY,
      low: clampWorkbenchWidth(200),
    }).toStrictEqual({
      defaultPx: 360,
      high: WORKBENCH_WIDTH_MAX_PX,
      invalid: WORKBENCH_WIDTH_PX,
      key: "th:workbench:width",
      low: WORKBENCH_WIDTH_MIN_PX,
    });
    expect(clampWorkbenchWidth(400)).toBe(400);
    expect(clampWorkbenchWidth(Number.NaN)).toBe(WORKBENCH_WIDTH_PX);
  });
});

describe("workbench open-tab set", () => {
  it("parses ordered open tabs and the active surface", () => {
    expect(
      parseWorkbenchTabs({
        active: "browser",
        open: ["chat", "terminal", "browser"],
      })
    ).toStrictEqual({
      active: "browser",
      open: ["chat", "terminal", "browser"],
    });
    expect(parseWorkbenchTabs("terminal")).toStrictEqual({
      active: "terminal",
      open: ["terminal"],
    });
    expect(parseWorkbenchTabs(["Context", "browser", "browser"])).toStrictEqual(
      {
        active: "browser",
        open: ["browser"],
      }
    );
  });

  it("opens a new tab at the end and only focuses an already-open one", () => {
    const started = DEFAULT_WORKBENCH_TABS;
    const opened = openWorkbenchTab(started, "terminal");
    expect(opened).toStrictEqual({
      active: "terminal",
      open: ["chat", "terminal"],
    });
    expect(openWorkbenchTab(opened, "chat")).toStrictEqual({
      active: "chat",
      open: ["chat", "terminal"],
    });
  });

  it("closes a tab and collapses when the last surface is gone", () => {
    const two = { active: "terminal" as const, open: ["chat", "terminal"] };
    expect(closeWorkbenchTab(two, "terminal")).toStrictEqual({
      active: "chat",
      open: ["chat"],
    });
    const last = closeWorkbenchTab({ active: "chat", open: ["chat"] }, "chat");
    expect(last).toStrictEqual({ active: null, open: [] });
    expect(shouldCollapseWorkbench(last)).toBeTruthy();
    expect(ensureWorkbenchTabs(last)).toStrictEqual(DEFAULT_WORKBENCH_TABS);
  });

  it("cycles keyboard focus across the open set only", () => {
    expect(cycleWorkbenchTab(["chat", "terminal"], "chat", 1)).toBe("terminal");
    expect(cycleWorkbenchTab(["chat", "terminal"], "terminal", 1)).toBe("chat");
    expect(cycleWorkbenchTab(["chat", "browser"], "chat", -1)).toBe("browser");
    expect(cycleWorkbenchTab([], null, 1)).toBeNull();
  });
});

describe("side chat local draft migration", () => {
  it("scopes leftover storage per chat", () => {
    expect(sideChatStorageKey("c1")).toBe("th:workbench:sidechat:c1");
    expect(sideChatStorageKey()).toBe("th:workbench:sidechat:home");
  });

  it("extracts user texts and skips seed or assistant acks", () => {
    expect(extractLocalSideChatUserTexts([{ id: 1 }])).toStrictEqual([]);
    expect(
      extractLocalSideChatUserTexts([
        {
          id: "seed",
          role: "assistant",
          text: "本線チャットとは別の副スレッドです。",
        },
        { id: "u-1", role: "user", text: "  メモ  " },
        { id: "a-1", role: "assistant", text: "（ローカル）" },
        { id: "u-2", role: "user", text: "   " },
      ])
    ).toStrictEqual(["メモ"]);
  });
});

describe("workbench source contracts", () => {
  it("rebuilds the right rail as a workbench, not settings panes", () => {
    const rail = readFileSync("src/harness/rail/RightRail.tsx", "utf-8");
    expect(rail).toContain("data-workbench");
    expect(rail).toContain("WorkbenchTabStrip");
    expect(rail).not.toContain("ContextPane");
    expect(rail).not.toContain("RuntimePane");
    expect(rail).not.toContain("TeamPane");
  });

  it("uses a real open-tab strip plus a panel picker", () => {
    const rail = readFileSync("src/harness/rail/RightRail.tsx", "utf-8");
    const strip = readFileSync(
      "src/harness/workbench/WorkbenchTabStrip.tsx",
      "utf-8"
    );
    expect(strip).toContain("data-workbench-tablist");
    expect(strip).toContain("data-workbench-tab-close");
    expect(strip).toContain("data-workbench-open-panel");
    expect(rail).toContain("workbenchPickerIds");
    expect(rail).toContain("data-workbench-panel-picker");
  });

  it("does not keep a four-way segmented nav of every panel", () => {
    const rail = readFileSync("src/harness/rail/RightRail.tsx", "utf-8");
    const strip = readFileSync(
      "src/harness/workbench/WorkbenchTabStrip.tsx",
      "utf-8"
    );
    expect(rail).not.toContain("WORKBENCH_PANEL_IDS.map");
    expect(strip).not.toContain("flex-1 items-center justify-center");
    expect(strip).toContain("group-hover/workbench-tab:opacity-100");
    expect(strip).toContain("overflow-x-auto");
  });

  it("keeps the four live panel IDs on the workbench", () => {
    const rail = readFileSync("src/harness/rail/RightRail.tsx", "utf-8");
    expect(rail).toContain("TerminalPane");
    expect(rail).toContain("BrowserPane");
    expect(rail).toContain("RemotePane");
    expect(rail).toContain("SideChatPane");
  });

  it("wires Terminal to a Ghostty session instead of stub copy", () => {
    const terminal = readFileSync(
      "src/harness/workbench/TerminalPane.tsx",
      "utf-8"
    );
    expect(terminal).toContain("api.workbenchPty.open");
    expect(terminal).toContain("GhosttySurface");
    expect(terminal).not.toContain("PTY 待ち");
  });

  it("wires Browser to a preview session instead of stub chrome", () => {
    const browser = readFileSync(
      "src/harness/workbench/BrowserPane.tsx",
      "utf-8"
    );
    expect(browser).toContain("api.workbenchPreview.navigate");
    expect(browser).toContain("PreviewFrame");
    expect(browser).toContain('placeholder="http://localhost:3000"');
  });

  it("wires Remote to a screen session instead of a lying connected desktop", () => {
    const remote = readFileSync(
      "src/harness/workbench/RemotePane.tsx",
      "utf-8"
    );
    expect({
      cancel: remote.includes("useCancelJob"),
      frame: remote.includes("ScreenFrame"),
      leak: /OpenConnector|OOMOL|workers\.dev|gateway/i.test(remote),
      mode: remote.includes("screenRenderMode"),
      open: remote.includes("api.workbenchScreen.open"),
      stub: remote.includes("画面共有は未接続"),
    }).toStrictEqual({
      cancel: true,
      frame: true,
      leak: false,
      mode: true,
      open: true,
      stub: false,
    });
  });

  it("vendors the same Ghostty wasm magic t3code ships", () => {
    const wasm = readFileSync(
      "src/harness/workbench/terminal/ghostty/vendor/ghostty-vt.wasm"
    );
    expect(wasm.subarray(0, 4)).toStrictEqual(
      Buffer.from([0, 0x61, 0x73, 0x6d])
    );
    expect(wasm).toHaveLength(630_932);
  });

  it("vendors t3code's write-pty trampoline wasm", () => {
    const trampoline = readFileSync(
      "src/harness/workbench/terminal/ghostty/vendor/ghostty-write-pty.wasm"
    );
    expect(trampoline.subarray(0, 4)).toStrictEqual(
      Buffer.from([0, 0x61, 0x73, 0x6d])
    );
    expect(trampoline).toHaveLength(112);
  });

  it("wires side chat UI to Convex instead of localStorage", () => {
    const pane = readFileSync(
      "src/harness/workbench/SideChatPane.tsx",
      "utf-8"
    );
    expect(pane).toContain("api.workbenchSideChat");
    expect(pane).toContain("ジョブは始まらない");
    expect(pane).not.toContain("api.messages.send");
    expect(pane).not.toContain("useStoredState");
    expect(pane).not.toMatch(/OpenConnector|OOMOL|workers\.dev|gateway/i);
  });

  it("keeps the side chat backend off the main message and job path", () => {
    const backend = readFileSync("convex/workbenchSideChat.ts", "utf-8");
    expect(backend).not.toContain("sendUserMessage");
    expect(backend).not.toContain("shouldDispatchAgent");
    expect(backend).not.toContain('insert("messages"');
    expect(backend).not.toContain('insert("jobs"');
    expect(WORKBENCH_PANELS.chat.next).toContain("ジョブは始まりません");
  });

  it("wires the header toggle and drops the old visibility gate", () => {
    const shell = readFileSync("src/harness/Shell.tsx", "utf-8");
    expect(shell).toContain("data-shell-workbench-toggle");
    expect(shell).toContain("WorkbenchTabsProvider");
    expect(shell).toContain("railVisible");
    expect(shell).toContain("右サイドバー");
    expect(shell).not.toMatch(/isRightRailVisible|railDefaultTab/);
  });

  it("exposes a rail resize handle without leaking internal product names", () => {
    const shell = readFileSync("src/harness/Shell.tsx", "utf-8");
    const handle = readFileSync(
      "src/harness/workbench/WorkbenchResizeHandle.tsx",
      "utf-8"
    );
    const rail = readFileSync("src/harness/rail/RightRail.tsx", "utf-8");
    expect(shell).toContain("WorkbenchResizeHandle");
    expect(handle).toContain("data-workbench-resize");
    expect(rail).not.toMatch(/OpenConnector|OOMOL|workers\.dev|gateway/i);
  });
});
