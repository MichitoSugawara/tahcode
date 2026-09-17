import { describe, expect, it } from "vitest";

import { BRIDGE_CAPABILITIES } from "../runtime/src/runner.ts";
import { BRIDGE_CAPABILITY_PREVIEW } from "../shared/workbenchPreview.ts";
import {
  BRIDGE_CAPABILITY_PTY,
  DEFAULT_TERMINAL_ID,
  clampTerminalCols,
  clampTerminalRows,
  encodeTerminalKey,
  historyWritePlan,
  nextTerminalHistory,
  runtimeHasPty,
  TERMINAL_HISTORY_MAX,
} from "../shared/workbenchTerminal.ts";
import { GHOSTTY_CELL_WIDE } from "../src/harness/workbench/terminal/ghostty/core.ts";
import type { GhosttyCell } from "../src/harness/workbench/terminal/ghostty/core.ts";
import { ghosttyKeyForCode } from "../src/harness/workbench/terminal/ghostty/keyCodes.ts";
import {
  ghosttyTextRunEnd,
  measureGhosttyCell,
  terminalGridSize,
} from "../src/harness/workbench/terminal/ghostty/renderer.ts";

describe("workbench terminal contract", () => {
  it("advertises the pty capability bit used by the bridge heartbeat", () => {
    expect(DEFAULT_TERMINAL_ID).toBe("term-1");
    expect(runtimeHasPty(["maintenance", BRIDGE_CAPABILITY_PTY])).toBeTruthy();
    expect(runtimeHasPty(["filesystemBrowse"])).toBeFalsy();
    expect(BRIDGE_CAPABILITIES).toStrictEqual(
      expect.arrayContaining([
        BRIDGE_CAPABILITY_PTY,
        BRIDGE_CAPABILITY_PREVIEW,
        "screen",
        "screenInput",
      ])
    );
  });

  it("clamps cols/rows to t3code's TerminalCols/Rows bounds", () => {
    expect(clampTerminalCols(80)).toBe(80);
    expect(clampTerminalCols(0)).toBe(1);
    expect(clampTerminalCols(4000)).toBe(1000);
    expect(clampTerminalRows(0)).toBe(1);
    expect(clampTerminalRows(900)).toBe(500);
  });

  it("truncates history from the oldest side like t3code's ring", () => {
    const chunk = "x".repeat(TERMINAL_HISTORY_MAX);
    expect(nextTerminalHistory(chunk, "yz").endsWith("yz")).toBeTruthy();
    expect(nextTerminalHistory(chunk, "yz")).toHaveLength(TERMINAL_HISTORY_MAX);
  });

  it("replays a truncated history instead of appending a stale prefix", () => {
    expect(historyWritePlan("abc", "abcdef")).toStrictEqual({
      data: "def",
      kind: "append",
    });
    expect(historyWritePlan("abcdef", "xyz")).toStrictEqual({
      data: "xyz",
      kind: "reset",
    });
  });

  it("encodes everyday keys as VT when Ghostty WASM is not loaded", () => {
    const base = {
      altKey: false,
      code: "KeyA",
      ctrlKey: false,
      metaKey: false,
    };
    expect(encodeTerminalKey({ ...base, key: "Enter" })).toBe("\r");
    expect(encodeTerminalKey({ ...base, key: "ArrowUp" })).toBe("\u001B[A");
    expect(encodeTerminalKey({ ...base, ctrlKey: true, key: "c" })).toBe(
      "\u0003"
    );
    expect(encodeTerminalKey({ ...base, key: "ls" })).toBeNull();
    expect(encodeTerminalKey({ ...base, key: "a" })).toBe("a");
  });
});

describe("ghostty keyCodes (t3code)", () => {
  it("keeps the tail of the pinned Ghostty key enum in order", () => {
    expect(ghosttyKeyForCode("F25")).toBe(ghosttyKeyForCode("F24") + 1);
    expect(ghosttyKeyForCode("PrintScreen")).toBe(
      ghosttyKeyForCode("FnLock") + 1
    );
    expect(ghosttyKeyForCode("Paste")).toBe(ghosttyKeyForCode("Cut") + 1);
  });
});

describe("ghostty renderer (t3code)", () => {
  it("matches the mobile renderer's cell-and-padding sizing model", () => {
    expect(
      terminalGridSize(808, 408, { baseline: 15, height: 20, width: 10 }, 4)
    ).toStrictEqual({ cols: 80, rows: 20 });
    expect(
      terminalGridSize(0, 0, { baseline: 15, height: 20, width: 10 }, 4)
    ).toStrictEqual({ cols: 1, rows: 1 });
  });

  it("uses descender-aware metrics", () => {
    const measureText = (text: string) =>
      text === "M"
        ? {
            actualBoundingBoxAscent: 9,
            actualBoundingBoxDescent: 0,
            width: 7.2,
          }
        : {
            actualBoundingBoxAscent: 9,
            actualBoundingBoxDescent: 3,
            width: 14.4,
          };
    const context = {
      font: "",
      measureText,
    };
    expect(measureGhosttyCell(context, 12, "monospace")).toStrictEqual({
      baseline: 11,
      height: 16,
      width: 7.2,
    });
  });

  it("includes wide spacer tails in the visual clip", () => {
    const cell = (text: string, wide = 0): GhosttyCell => ({
      background: { b: 0, g: 0, r: 0 },
      bold: false,
      foreground: { b: 255, g: 255, r: 255 },
      invisible: false,
      italic: false,
      overline: false,
      selected: false,
      strikethrough: false,
      text,
      underline: false,
      wide,
    });
    const cells = [
      cell("界", GHOSTTY_CELL_WIDE.wide),
      cell("", GHOSTTY_CELL_WIDE.spacerTail),
      cell("🙂", GHOSTTY_CELL_WIDE.wide),
      cell("", GHOSTTY_CELL_WIDE.spacerTail),
      cell(""),
    ];
    expect(ghosttyTextRunEnd(cells, 0, () => true)).toBe(4);
  });
});
