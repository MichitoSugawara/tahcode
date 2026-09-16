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
  appendSideChatTurn,
  parseSideChatMessages,
  sideChatStorageKey,
} from "../src/harness/workbench/SideChatPane.tsx";
import {
  clampWorkbenchWidth,
  DEFAULT_WORKBENCH_DOCKED,
  parseWorkbenchDocked,
  parseWorkbenchPanel,
  parseWorkbenchStoredRaw,
  WORKBENCH_DOCKED_KEY,
  WORKBENCH_HOME_SCOPE,
  WORKBENCH_PANEL_KEY,
  WORKBENCH_WIDTH_KEY,
  WORKBENCH_WIDTH_MAX_PX,
  WORKBENCH_WIDTH_MIN_PX,
  WORKBENCH_WIDTH_PX,
  workbenchDockedKey,
  workbenchPanelKey,
  workbenchScope,
} from "../src/harness/workbench/state.ts";

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
      panelChat: workbenchPanelKey("c1"),
      panelHome: workbenchPanelKey(),
      prefix: WORKBENCH_PANEL_KEY,
    }).toStrictEqual({
      docked: "th:workbench:docked:home",
      panelChat: "th:workbench:panel:c1",
      panelHome: "th:workbench:panel:home",
      prefix: "th:workbench:panel",
    });
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

describe("side chat local thread", () => {
  it("scopes storage per chat", () => {
    expect(sideChatStorageKey("c1")).toBe("th:workbench:sidechat:c1");
    expect(sideChatStorageKey()).toBe("th:workbench:sidechat:home");
    expect(parseSideChatMessages([{ id: 1 }])).toStrictEqual([]);
  });

  it("appends a local-only turn and ignores blank drafts", () => {
    const next = appendSideChatTurn([], "  メモ  ", 42);
    expect(next).toHaveLength(3);
    expect(next[1]).toMatchObject({ role: "user", text: "メモ" });
    expect(next[2]?.text).toContain("ローカル");
    expect(appendSideChatTurn([], "   ")).toStrictEqual([]);
  });
});

describe("workbench source contracts", () => {
  it("rebuilds the right rail as a workbench, not settings panes", () => {
    const rail = readFileSync("src/harness/rail/RightRail.tsx", "utf-8");
    expect(rail).toContain("data-workbench");
    expect(rail).toContain("data-workbench-tab");
    expect(rail).not.toContain("ContextPane");
    expect(rail).not.toContain("RuntimePane");
    expect(rail).not.toContain("TeamPane");
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

  it("wires the header toggle and drops the old visibility gate", () => {
    const shell = readFileSync("src/harness/Shell.tsx", "utf-8");
    expect(shell).toContain("data-shell-workbench-toggle");
    expect(shell).toContain("useWorkbenchDocked");
    expect(shell).toContain("useWorkbenchWidth");
    expect(shell).not.toContain("isRightRailVisible");
    expect(shell).not.toContain("railDefaultTab");
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
