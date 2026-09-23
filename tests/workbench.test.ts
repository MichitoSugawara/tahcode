import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

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
  WORKBENCH_RATIO_DEFAULT,
  WORKBENCH_RATIO_MAX,
  WORKBENCH_RATIO_MIN,
  WORKBENCH_RATIO_REFERENCE_PX,
  WORKBENCH_WIDTH_KEY,
  WORKBENCH_WIDTH_MIN_PX,
  parseWorkbenchRatio,
  serializeWorkbenchRatio,
  workbenchWidthFromRatio,
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

  it("persists rail width as a ratio so both panes grow with the window", () => {
    expect({
      defaultRatio: WORKBENCH_RATIO_DEFAULT,
      high: parseWorkbenchRatio(0.9),
      invalid: parseWorkbenchRatio("nope"),
      key: WORKBENCH_WIDTH_KEY,
      legacyPx: parseWorkbenchRatio(360),
      low: parseWorkbenchRatio(0.01),
      stored: serializeWorkbenchRatio(0.4),
      storedObject: parseWorkbenchRatio({ ratio: 0.4 }),
    }).toStrictEqual({
      defaultRatio: 0.36,
      high: WORKBENCH_RATIO_MAX,
      invalid: WORKBENCH_RATIO_DEFAULT,
      key: "th:workbench:width",
      legacyPx: 360 / WORKBENCH_RATIO_REFERENCE_PX,
      low: WORKBENCH_RATIO_MIN,
      stored: { ratio: 0.4 },
      storedObject: 0.4,
    });
    expect(workbenchWidthFromRatio(0.36, 2000)).toBe(720);
    expect(workbenchWidthFromRatio(0.36, 1000)).toBe(360);
    expect(clampWorkbenchWidth(200, 1000)).toBe(WORKBENCH_WIDTH_MIN_PX);
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
    expect({
      close: strip.includes("data-workbench-tab-close"),
      list: strip.includes("data-workbench-tablist"),
      open: strip.includes("data-workbench-open-panel"),
      picker: rail.includes("data-workbench-panel-picker"),
      pointer: strip.includes("pointer-events-auto"),
    }).toStrictEqual({
      close: true,
      list: true,
      open: true,
      picker: true,
      pointer: true,
    });
    expect(rail).toContain("workbenchPickerIds");
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

  it("requires an honest WorkbenchEmpty badge instead of a future-phase default", () => {
    const empty = readFileSync(
      "src/harness/workbench/WorkbenchEmpty.tsx",
      "utf-8"
    );
    const workbenchDir = "src/harness/workbench";
    const callers: {
      badgeCount: number;
      file: string;
      futurePhase: boolean;
      hasFutureBadge: boolean;
      opens: number;
    }[] = [];
    const allBadges: string[] = [];
    for (const name of readdirSync(workbenchDir)) {
      if (!name.endsWith(".tsx") || name === "WorkbenchEmpty.tsx") {
        continue;
      }
      const text = readFileSync(join(workbenchDir, name), "utf-8");
      if (!text.includes("<WorkbenchEmpty")) {
        continue;
      }
      const badges = [...text.matchAll(/\bbadge="([^"]+)"/g)].flatMap(
        (match) => (match[1] ? [match[1]] : [])
      );
      allBadges.push(...badges);
      callers.push({
        badgeCount: badges.length,
        file: name,
        futurePhase: text.includes("次のフェーズで接続"),
        hasFutureBadge: badges.includes("次のフェーズで接続"),
        opens: (text.match(/<WorkbenchEmpty\b/g) ?? []).length,
      });
    }
    callers.sort((left, right) => left.file.localeCompare(right.file));
    expect({
      callers,
      default: {
        futurePhase: empty.includes("次のフェーズで接続"),
        optional: empty.includes("badge?: string"),
        required: empty.includes("badge: string"),
      },
      hasCapabilityGap: allBadges.some((badge) => badge.includes("未対応")),
      hasMachineNeeded: allBadges.includes("マシンが必要"),
    }).toStrictEqual({
      callers: [
        {
          badgeCount: 3,
          file: "BrowserPane.tsx",
          futurePhase: false,
          hasFutureBadge: false,
          opens: 3,
        },
        {
          badgeCount: 3,
          file: "RemotePane.tsx",
          futurePhase: false,
          hasFutureBadge: false,
          opens: 3,
        },
        {
          badgeCount: 3,
          file: "SideChatPane.tsx",
          futurePhase: false,
          hasFutureBadge: false,
          opens: 3,
        },
        {
          badgeCount: 2,
          file: "TerminalPane.tsx",
          futurePhase: false,
          hasFutureBadge: false,
          opens: 2,
        },
      ],
      default: {
        futurePhase: false,
        optional: false,
        required: true,
      },
      hasCapabilityGap: true,
      hasMachineNeeded: true,
    });
  });

  it("wires Remote to a screen session instead of a lying connected desktop", () => {
    const remote = readFileSync(
      "src/harness/workbench/RemotePane.tsx",
      "utf-8"
    );
    expect({
      agent: remote.includes("data-workbench-agent-screen"),
      cancel: remote.includes("useCancelJob"),
      frame: remote.includes("ScreenFrame"),
      input: remote.includes("enqueueInput"),
      leak: /OpenConnector|OOMOL|workers\.dev|gateway/i.test(remote),
      mode: remote.includes("screenRenderMode"),
      open: remote.includes("api.workbenchScreen.open"),
      stub: remote.includes("画面共有は未接続"),
    }).toStrictEqual({
      agent: true,
      cancel: true,
      frame: true,
      input: true,
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
    expect({
      demo: pane.includes("data-hitl-demo") || pane.includes("requestDemo"),
      messages: pane.includes("api.messages.send"),
      stored: pane.includes("useStoredState"),
      tools: pane.includes("api.toolApprovals"),
      turns: pane.includes("api.workbenchSideChat"),
    }).toStrictEqual({
      demo: false,
      messages: false,
      stored: false,
      tools: true,
      turns: true,
    });
    expect(pane).toContain("ジョブは始まらない");
    expect(pane).not.toMatch(/OpenConnector|OOMOL|workers\.dev|gateway/i);
  });

  it("ships a first-party HITL card without CopilotKit runtime wrap", () => {
    const card = readFileSync(
      "src/harness/workbench/HitlApprovalCard.tsx",
      "utf-8"
    );
    expect(card).toContain("data-hitl-status");
    expect(card).toContain("承認して実行");
    expect(card).toContain("拒否する");
    expect(card).toContain("実行していません");
    expect(card).not.toMatch(/CopilotKit|OpenConnector|workers\.dev|gateway/i);
  });

  it("puts the write-tool HITL demo on the main composer", () => {
    const composer = readFileSync("src/harness/Composer.tsx", "utf-8");
    const strip = readFileSync(
      "src/harness/workbench/HitlApprovalStrip.tsx",
      "utf-8"
    );
    const reply = readFileSync("src/harness/thread/AgentReply.tsx", "utf-8");
    const pane = readFileSync(
      "src/harness/workbench/SideChatPane.tsx",
      "utf-8"
    );
    expect({
      composerStrip: composer.includes("HitlApprovalStrip"),
      demo: strip.includes("書き込みの確認を試す（実行しない）"),
      demoAttr: strip.includes("data-hitl-demo"),
      jobCards:
        reply.includes("HitlApprovalList") && reply.includes("listForJob"),
      sideDemo:
        pane.includes("requestDemo") ||
        pane.includes("data-hitl-demo") ||
        pane.includes("危険な操作"),
    }).toStrictEqual({
      composerStrip: true,
      demo: true,
      demoAttr: true,
      jobCards: true,
      sideDemo: false,
    });
    expect(`${composer}\n${strip}\n${reply}`).not.toMatch(
      /CopilotKit|OpenConnector|workers\.dev|gateway/i
    );
  });

  it("keeps the side chat backend off the main message and job path", () => {
    const backend = readFileSync("convex/workbenchSideChat.ts", "utf-8");
    expect({
      jobs: backend.includes('insert("jobs"'),
      mention: backend.includes("shouldDispatchAgent"),
      messages: backend.includes("sendUserMessage"),
      nextHasHitl: WORKBENCH_PANELS.chat.next.includes("承認カード"),
      nextHasJob: WORKBENCH_PANELS.chat.next.includes("ジョブは始まりません"),
    }).toStrictEqual({
      jobs: false,
      mention: false,
      messages: false,
      nextHasHitl: false,
      nextHasJob: true,
    });
    expect(backend).not.toContain('insert("messages"');
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
    expect({
      handle: handle.includes("data-workbench-resize"),
      leak: /OpenConnector|OOMOL|workers\.dev|gateway/i.test(rail),
      percentWidth: shell.includes("railRatio * 100"),
      ratio: shell.includes("useWorkbenchRatio"),
      row: shell.includes("data-shell-chat-row"),
      tabsClear: handle.includes("top-7"),
      wired: shell.includes("WorkbenchResizeHandle"),
      workbenchRatio: shell.includes("data-shell-workbench-ratio"),
    }).toStrictEqual({
      handle: true,
      leak: false,
      percentWidth: true,
      ratio: true,
      row: true,
      tabsClear: true,
      wired: true,
      workbenchRatio: true,
    });
  });
});
