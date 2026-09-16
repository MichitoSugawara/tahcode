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
  DEFAULT_WORKBENCH_DOCKED,
  parseWorkbenchDocked,
  parseWorkbenchPanel,
  WORKBENCH_DOCKED_KEY,
  WORKBENCH_PANEL_KEY,
  WORKBENCH_WIDTH_PX,
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

  it("parses the active panel and keeps a fixed rail width", () => {
    expect(parseWorkbenchPanel("browser")).toBe("browser");
    expect(parseWorkbenchPanel("Remote")).toBe("chat");
    expect(WORKBENCH_PANEL_KEY).toBe("th:workbench:panel");
    expect(WORKBENCH_WIDTH_PX).toBe(360);
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
    expect(rail).toContain("data-workbench-tab");
    expect(rail).not.toContain("ContextPane");
    expect(rail).not.toContain("RuntimePane");
    expect(rail).not.toContain("TeamPane");
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
    const rail = readFileSync("src/harness/rail/RightRail.tsx", "utf-8");
    expect(shell).toContain("data-shell-workbench-toggle");
    expect(shell).toContain("useWorkbenchDocked");
    expect(shell).not.toContain("isRightRailVisible");
    expect(shell).not.toContain("railDefaultTab");
    expect(rail).not.toMatch(/OpenConnector|OOMOL|workers\.dev|gateway/i);
  });
});
