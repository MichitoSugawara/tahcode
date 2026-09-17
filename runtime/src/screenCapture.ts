import { execFile as execFileCb } from "node:child_process";
import { existsSync } from "node:fs";
import { access, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import {
  clipScreenError,
  SCREEN_CAPTURE_TIMEOUT_MS,
  SCREEN_FRAME_MAX_BYTES,
  SCREEN_JPEG_QUALITY,
  SCREEN_MAX_EDGE,
  sniffScreenFrameType,
} from "../../shared/workbenchScreen.ts";
import type { ScreenFrameType } from "../../shared/workbenchScreen.ts";

const execFile = promisify(execFileCb);

export type ScreenCapturePlan =
  | {
      capture: string[];
      downscale?: string[];
      kind: "command";
    }
  | { kind: "unsupported"; reason: string };

export type ScreenCaptureResult =
  | {
      bytes: Uint8Array;
      contentType: ScreenFrameType;
      ok: true;
    }
  | { error: string; fatal: boolean; ok: false };

function pathEntries(pathEnv = process.env.PATH ?? ""): string[] {
  return pathEnv.split(path.delimiter).filter((entry) => entry.length > 0);
}

export function resolveOnPath(
  name: string,
  pathEnv = process.env.PATH ?? ""
): string | null {
  if (name.includes(path.sep) || name.includes("/")) {
    return name;
  }
  for (const dir of pathEntries(pathEnv)) {
    const candidate = path.join(dir, name);
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

export function selectScreenCapturePlan(
  platform: NodeJS.Platform,
  env: {
    DISPLAY?: string;
    WAYLAND_DISPLAY?: string;
  },
  which: (bin: string) => string | null = resolveOnPath
): ScreenCapturePlan {
  if (platform === "darwin") {
    const capture = which("screencapture");
    if (!capture) {
      return {
        kind: "unsupported",
        reason: "screencapture が見つかりません。画面フレームを送れません。",
      };
    }
    const sips = which("sips");
    return {
      capture: [capture, "-x", "-t", "jpg"],
      downscale: sips
        ? [
            sips,
            "-Z",
            String(SCREEN_MAX_EDGE),
            "-s",
            "format",
            "jpeg",
            "-s",
            "formatOptions",
            String(SCREEN_JPEG_QUALITY),
          ]
        : undefined,
      kind: "command",
    };
  }
  if (platform === "linux") {
    const hasDisplay = Boolean(env.DISPLAY || env.WAYLAND_DISPLAY);
    if (!hasDisplay) {
      return {
        kind: "unsupported",
        reason: "ディスプレイがありません。画面フレームを送れません。",
      };
    }
    const grim = which("grim");
    if (grim) {
      return {
        capture: [grim, "-t", "jpeg", "-q", String(SCREEN_JPEG_QUALITY)],
        kind: "command",
      };
    }
    const scrot = which("scrot");
    if (scrot) {
      return { capture: [scrot, "--overwrite"], kind: "command" };
    }
    const gnome = which("gnome-screenshot");
    if (gnome) {
      return { capture: [gnome, "-f"], kind: "command" };
    }
    const magick = which("import");
    if (magick) {
      return { capture: [magick, "-window", "root"], kind: "command" };
    }
    return {
      kind: "unsupported",
      reason:
        "画面キャプチャ用の grim / scrot / gnome-screenshot / import がありません。",
    };
  }
  return {
    kind: "unsupported",
    reason: "この OS の画面キャプチャはまだありません。",
  };
}

async function runCapture(
  argv: string[],
  outFile: string
): Promise<{ stderr: string; stdout: string }> {
  const [bin, ...rest] = argv;
  if (!bin) {
    throw new Error("capture command is empty");
  }
  return await execFile(bin, [...rest, outFile], {
    timeout: SCREEN_CAPTURE_TIMEOUT_MS,
  });
}

export async function readScreenFrameFile(
  filePath: string
): Promise<ScreenCaptureResult> {
  const bytes = await readFile(filePath);
  if (bytes.byteLength === 0) {
    return {
      error: "画面フレームが空でした。画面収録の許可を確認してください。",
      fatal: true,
      ok: false,
    };
  }
  if (bytes.byteLength > SCREEN_FRAME_MAX_BYTES) {
    return {
      error: "画面フレームが大きすぎます（1.5MB 超）。",
      fatal: false,
      ok: false,
    };
  }
  const contentType = sniffScreenFrameType(bytes);
  if (!contentType) {
    return {
      error: "画面フレームが JPEG / PNG ではありません。",
      fatal: false,
      ok: false,
    };
  }
  return { bytes, contentType, ok: true };
}

export async function captureScreenFrame(input?: {
  capture?: () => Promise<Uint8Array>;
  env?: { DISPLAY?: string; WAYLAND_DISPLAY?: string };
  platform?: NodeJS.Platform;
  which?: (bin: string) => string | null;
}): Promise<ScreenCaptureResult> {
  if (input?.capture) {
    try {
      const bytes = await input.capture();
      const contentType = sniffScreenFrameType(bytes);
      if (!contentType) {
        return {
          error: "画面フレームが JPEG / PNG ではありません。",
          fatal: false,
          ok: false,
        };
      }
      if (bytes.byteLength > SCREEN_FRAME_MAX_BYTES) {
        return {
          error: "画面フレームが大きすぎます（1.5MB 超）。",
          fatal: false,
          ok: false,
        };
      }
      return { bytes, contentType, ok: true };
    } catch (error) {
      return {
        error: clipScreenError(
          error instanceof Error ? error.message : String(error)
        ),
        fatal: false,
        ok: false,
      };
    }
  }

  const plan = selectScreenCapturePlan(
    input?.platform ?? process.platform,
    input?.env ?? {
      DISPLAY: process.env.DISPLAY,
      WAYLAND_DISPLAY: process.env.WAYLAND_DISPLAY,
    },
    input?.which ?? resolveOnPath
  );
  if (plan.kind === "unsupported") {
    return { error: plan.reason, fatal: true, ok: false };
  }

  const stamp = `${process.pid}-${Date.now()}`;
  const outFile = path.join(tmpdir(), `tahcode-screen-${stamp}.jpg`);
  try {
    await runCapture(plan.capture, outFile);
    if (plan.downscale) {
      const [bin, ...rest] = plan.downscale;
      if (bin) {
        await execFile(bin, [...rest, outFile], {
          timeout: SCREEN_CAPTURE_TIMEOUT_MS,
        });
      }
    }
    await access(outFile);
    return await readScreenFrameFile(outFile);
  } catch (error) {
    const message =
      error instanceof Error && error.message.includes("ETIMEDOUT")
        ? "画面キャプチャがタイムアウトしました。"
        : error instanceof Error
          ? error.message
          : String(error);
    return { error: clipScreenError(message), fatal: false, ok: false };
  } finally {
    await rm(outFile, { force: true });
  }
}

export async function uploadStorageBlob(
  uploadUrl: string,
  bytes: Uint8Array,
  contentType: string,
  fetchImpl: typeof fetch = fetch
): Promise<string> {
  const body = new Uint8Array(bytes);
  const response = await fetchImpl(uploadUrl, {
    body,
    headers: { "Content-Type": contentType },
    method: "POST",
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(text || `Screen frame upload failed (${response.status})`);
  }
  const payload = (await response.json()) as { storageId?: unknown };
  if (typeof payload.storageId !== "string" || payload.storageId.length === 0) {
    throw new TypeError("Screen frame upload returned no storageId");
  }
  return payload.storageId;
}
