/**
 * Workbench remote screen contract (TAH-81).
 *
 * Not RDP / VNC. The Mac/Linux bridge captures a JPEG/PNG of the
 * machine display and Convex stores the latest frame in `_storage`.
 * The Remote tab renders that file URL — same “one honest frame”
 * model as Computer Use screenshots and t3code's `capturePage` loop,
 * not a desktop protocol.
 *
 * Evidence:
 * - t3code PR #4397 `capturePage` frame loop (preview frames, ~12 FPS)
 *   https://github.com/pingdotgg/t3code/pull/4397
 * - t3code `device_screenshot` / preview_snapshot
 *   https://deepwiki.com/pingdotgg/t3code/5.9-mcp-and-preview-automation
 * - Anthropic Computer Use `screenshot` tool (PNG of the display)
 *   https://docs.anthropic.com/en/docs/agents-and-tools/computer-use
 */

export const BRIDGE_CAPABILITY_SCREEN = "screen";

export const DEFAULT_SCREEN_TAB_ID = "screen-1";

export const SCREEN_POLL_MS = 1500;
export const SCREEN_STALE_MS = 20_000;
export const SCREEN_WATCH_TIMEOUT_MS = 45_000;
export const SCREEN_FRAME_MAX_BYTES = 1_500_000;
export const SCREEN_MAX_EDGE = 1280;
export const SCREEN_JPEG_QUALITY = 55;
export const SCREEN_CAPTURE_TIMEOUT_MS = 8000;
export const SCREEN_ERROR_MAX = 2000;
export const SCREEN_HISTORY_CAP = 20;

export const SCREEN_SESSION_STATUSES = ["watching", "error", "closed"] as const;

export type ScreenSessionStatus = (typeof SCREEN_SESSION_STATUSES)[number];

export const SCREEN_FRAME_TYPES = ["image/jpeg", "image/png"] as const;

export type ScreenFrameType = (typeof SCREEN_FRAME_TYPES)[number];

export type ScreenRenderMode =
  | "offline"
  | "upgrade"
  | "waiting"
  | "frame"
  | "stale"
  | "error";

export function runtimeHasScreen(
  capabilities: readonly string[] | undefined
): boolean {
  return (capabilities ?? []).includes(BRIDGE_CAPABILITY_SCREEN);
}

export function isScreenFrameType(value: string): value is ScreenFrameType {
  return (SCREEN_FRAME_TYPES as readonly string[]).includes(value);
}

export function sniffScreenFrameType(
  bytes: Uint8Array
): ScreenFrameType | null {
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return "image/jpeg";
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return "image/png";
  }
  return null;
}

export function clipScreenError(message: string): string {
  const trimmed = message.replaceAll(/[\r\n]+/g, " ").trim();
  if (trimmed.length <= SCREEN_ERROR_MAX) {
    return trimmed;
  }
  return trimmed.slice(0, SCREEN_ERROR_MAX);
}

export function screenFrameDue(
  lastBridgeAt: number | undefined,
  now: number,
  pollMs = SCREEN_POLL_MS
): boolean {
  if (lastBridgeAt === undefined) {
    return true;
  }
  return now - lastBridgeAt >= pollMs;
}

/**
 * Client-side renderer. `now` must come from the browser — queries
 * never call Date.now(). A session without a file URL is never
 * treated as a connected desktop.
 */
export function screenRenderMode(input: {
  capturedAt?: number;
  error?: string;
  frameUrl?: string | null;
  hasScreen: boolean;
  now: number;
  online: boolean;
}): ScreenRenderMode {
  if (!input.online) {
    return "offline";
  }
  if (!input.hasScreen) {
    return "upgrade";
  }
  const hasFrame = (input.frameUrl ?? "").length > 0;
  if (hasFrame) {
    if (
      input.capturedAt !== undefined &&
      input.now - input.capturedAt > SCREEN_STALE_MS
    ) {
      return "stale";
    }
    return "frame";
  }
  if ((input.error ?? "").length > 0) {
    return "error";
  }
  return "waiting";
}

export function formatScreenAge(capturedAt: number, now: number): string {
  const delta = Math.max(0, now - capturedAt);
  if (delta < 1000) {
    return "たった今";
  }
  if (delta < 60_000) {
    return `${Math.floor(delta / 1000)}秒前`;
  }
  if (delta < 3_600_000) {
    return `${Math.floor(delta / 60_000)}分前`;
  }
  return `${Math.floor(delta / 3_600_000)}時間前`;
}

export function screenUpgradeMessage(): string {
  return "このマシンの tahcode は画面フレーム能力をまだ報告していません。`npm i -g tahcode@latest && tahcode restart`";
}
