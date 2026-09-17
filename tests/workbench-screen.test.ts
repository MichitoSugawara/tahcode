import { describe, expect, it } from "vitest";

import { BRIDGE_CAPABILITIES } from "../runtime/src/runner.ts";
import {
  SCREEN_INPUT_MIN_CLI_VERSION,
  SCREEN_MIN_CLI_VERSION,
} from "../shared/cliVersion.ts";
import {
  BRIDGE_CAPABILITY_SCREEN,
  BRIDGE_CAPABILITY_SCREEN_INPUT,
  formatScreenAge,
  mapScreenPoint,
  readRasterSize,
  runtimeHasScreen,
  runtimeHasScreenInput,
  sanitizeScreenInput,
  screenControlMode,
  screenFrameDue,
  screenPointFromClient,
  screenRenderMode,
  SCREEN_POLL_MS,
  SCREEN_STALE_MS,
  sniffScreenFrameType,
} from "../shared/workbenchScreen.ts";

const JPEG = Uint8Array.of(0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10);
const PNG = Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);

describe("workbench screen contract", () => {
  it("advertises the screen capability bit used by the bridge heartbeat", () => {
    expect({
      empty: runtimeHasScreen([]),
      input: runtimeHasScreenInput([BRIDGE_CAPABILITY_SCREEN_INPUT]),
      missing: runtimeHasScreen(),
      present: runtimeHasScreen([BRIDGE_CAPABILITY_SCREEN]),
      versions: [SCREEN_MIN_CLI_VERSION, SCREEN_INPUT_MIN_CLI_VERSION],
    }).toStrictEqual({
      empty: false,
      input: true,
      missing: false,
      present: true,
      versions: ["0.1.4", "0.1.5"],
    });
    expect(BRIDGE_CAPABILITIES).toStrictEqual(
      expect.arrayContaining([
        BRIDGE_CAPABILITY_SCREEN,
        BRIDGE_CAPABILITY_SCREEN_INPUT,
      ])
    );
  });

  it("sniffs JPEG and PNG magic and rejects other bytes", () => {
    expect(sniffScreenFrameType(JPEG)).toBe("image/jpeg");
    expect(sniffScreenFrameType(PNG)).toBe("image/png");
    expect(sniffScreenFrameType(Uint8Array.of(0x00, 0x01))).toBeNull();
  });

  it("treats a missing lastBridgeAt as due and waits the poll interval after", () => {
    expect(screenFrameDue(undefined, 1000)).toBeTruthy();
    expect(screenFrameDue(1000, 1000 + SCREEN_POLL_MS - 1)).toBeFalsy();
    expect(screenFrameDue(1000, 1000 + SCREEN_POLL_MS)).toBeTruthy();
  });

  it("never calls a frameless session connected", () => {
    const base = { now: 10, online: true as const };
    expect({
      error: screenRenderMode({
        ...base,
        error: "no display",
        hasScreen: true,
      }),
      frame: screenRenderMode({
        ...base,
        capturedAt: 8,
        frameUrl: "https://example.com/frame.jpg",
        hasScreen: true,
      }),
      offline: screenRenderMode({
        frameUrl: "https://example.com/frame.jpg",
        hasScreen: true,
        now: 10,
        online: false,
      }),
      stale: screenRenderMode({
        capturedAt: 1,
        frameUrl: "https://example.com/frame.jpg",
        hasScreen: true,
        now: 1 + SCREEN_STALE_MS + 1,
        online: true,
      }),
      upgrade: screenRenderMode({ ...base, hasScreen: false }),
      waiting: screenRenderMode({ ...base, hasScreen: true }),
    }).toStrictEqual({
      error: "error",
      frame: "frame",
      offline: "offline",
      stale: "stale",
      upgrade: "upgrade",
      waiting: "waiting",
    });
  });

  it("formats frame age in Japanese", () => {
    expect(formatScreenAge(1000, 1000)).toBe("たった今");
    expect(formatScreenAge(1000, 4000)).toBe("3秒前");
    expect(formatScreenAge(1000, 121_000)).toBe("2分前");
  });

  it("maps contain-box clicks and HID events without inventing a connected flag", () => {
    const png = Uint8Array.of(
      0x89,
      0x50,
      0x4e,
      0x47,
      0x0d,
      0x0a,
      0x1a,
      0x0a,
      0,
      0,
      0,
      13,
      0x49,
      0x48,
      0x44,
      0x52,
      0,
      0,
      0,
      4,
      0,
      0,
      0,
      2
    );
    expect({
      control: screenControlMode({ hasScreenInput: true, mode: "frame" }),
      mapped: mapScreenPoint(0.5, 0.25, 200, 100),
      point: screenPointFromClient({
        clientX: 60,
        clientY: 40,
        height: 100,
        left: 0,
        naturalHeight: 50,
        naturalWidth: 100,
        top: 0,
        width: 200,
      }),
      raster: readRasterSize(png),
      viewOnly: screenControlMode({ hasScreenInput: false, mode: "frame" }),
    }).toStrictEqual({
      control: "control",
      mapped: { x: 100, y: 25 },
      point: { x: 0.3, y: 0.4 },
      raster: { height: 2, width: 4 },
      viewOnly: "view",
    });
    expect(sanitizeScreenInput({ kind: "click", x: 1.4, y: -1 })).toMatchObject(
      {
        button: "left",
        kind: "click",
        x: 1,
        y: 0,
      }
    );
  });
});
