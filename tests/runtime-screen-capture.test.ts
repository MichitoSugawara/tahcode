import { describe, expect, it } from "vitest";

import {
  captureScreenFrame,
  selectScreenCapturePlan,
  uploadStorageBlob,
} from "../runtime/src/screenCapture.ts";

const JPEG = Uint8Array.of(0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46);

describe("screen capture plan", () => {
  it("uses screencapture + sips on darwin", () => {
    const plan = selectScreenCapturePlan("darwin", {}, (bin) =>
      bin === "screencapture" || bin === "sips" ? `/usr/bin/${bin}` : null
    );
    expect(plan).toMatchObject({
      capture: ["/usr/bin/screencapture", "-x", "-t", "jpg"],
      downscale: expect.arrayContaining(["/usr/bin/sips"]),
      kind: "command",
    });
  });

  it("refuses Linux without a display instead of inventing a frame", () => {
    expect(
      selectScreenCapturePlan("linux", {}, () => "/usr/bin/grim")
    ).toStrictEqual({
      kind: "unsupported",
      reason: "ディスプレイがありません。画面フレームを送れません。",
    });
  });

  it("prefers grim on a Wayland Linux box", () => {
    expect(
      selectScreenCapturePlan(
        "linux",
        { WAYLAND_DISPLAY: "wayland-0" },
        (bin) => (bin === "grim" ? "/usr/bin/grim" : null)
      )
    ).toMatchObject({
      capture: ["/usr/bin/grim", "-t", "jpeg", "-q", "55"],
      kind: "command",
    });
  });

  it("is honest on Windows", () => {
    const plan = selectScreenCapturePlan("win32", {}, () => "/bin/true");
    expect(plan.kind).toBe("unsupported");
  });
});

describe("screen capture injection", () => {
  it("accepts an injected JPEG and rejects garbage", async () => {
    const ok = await captureScreenFrame({
      capture: async () => JPEG,
    });
    expect(ok).toMatchObject({ contentType: "image/jpeg", ok: true });
    const bad = await captureScreenFrame({
      capture: async () => Uint8Array.of(1, 2, 3),
    });
    expect(bad).toMatchObject({
      error: "画面フレームが JPEG / PNG ではありません。",
      ok: false,
    });
  });

  it("uploads bytes to the Convex storage URL and reads storageId", async () => {
    const storageId = await uploadStorageBlob(
      "https://example.com/upload",
      JPEG,
      "image/jpeg",
      async (_url, init) => {
        expect(init?.method).toBe("POST");
        expect(init?.headers).toMatchObject({ "Content-Type": "image/jpeg" });
        return new Response(JSON.stringify({ storageId: "kg123" }), {
          status: 200,
        });
      }
    );
    expect(storageId).toBe("kg123");
  });
});
