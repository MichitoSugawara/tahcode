import { describe, expect, it } from "vitest";

import { BRIDGE_CAPABILITIES } from "../runtime/src/runner.ts";
import { SCREEN_MIN_CLI_VERSION } from "../shared/cliVersion.ts";
import {
  BRIDGE_CAPABILITY_SCREEN,
  formatScreenAge,
  runtimeHasScreen,
  screenFrameDue,
  screenRenderMode,
  SCREEN_POLL_MS,
  SCREEN_STALE_MS,
  sniffScreenFrameType,
} from "../shared/workbenchScreen.ts";

const JPEG = Uint8Array.of(0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10);
const PNG = Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);

describe("workbench screen contract", () => {
  it("advertises the screen capability bit used by the bridge heartbeat", () => {
    expect(runtimeHasScreen([BRIDGE_CAPABILITY_SCREEN])).toBeTruthy();
    expect(runtimeHasScreen([])).toBeFalsy();
    expect(runtimeHasScreen()).toBeFalsy();
    expect(BRIDGE_CAPABILITIES).toContain(BRIDGE_CAPABILITY_SCREEN);
    expect(SCREEN_MIN_CLI_VERSION).toBe("0.1.4");
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
});
