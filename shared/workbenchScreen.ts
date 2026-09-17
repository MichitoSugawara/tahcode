/**
 * Workbench remote screen contract (TAH-81).
 *
 * Interactive Agent Screen: periodic JPEG/PNG of the machine display plus
 * keyboard / mouse events applied on the bridge. Not Microsoft RDP / VNC
 * and not a second daemon — same “honest frame + HID” model as Computer
 * Use screenshots and t3code's `capturePage` loop.
 *
 * Evidence:
 * - Beautiful UI Agent Screen (look / density / canvas / cursor)
 *   https://www.beautifului.dev/  (page-end demo, `AgentScreen.tsx`)
 * - t3code PR #4397 `capturePage` frame loop
 *   https://github.com/pingdotgg/t3code/pull/4397
 * - Anthropic Computer Use `screenshot` + coordinate actions
 *   https://docs.anthropic.com/en/docs/agents-and-tools/computer-use
 */

export const BRIDGE_CAPABILITY_SCREEN = "screen";
export const BRIDGE_CAPABILITY_SCREEN_INPUT = "screenInput";

export const DEFAULT_SCREEN_TAB_ID = "screen-1";

export const SCREEN_POLL_MS = 500;
export const SCREEN_STALE_MS = 20_000;
export const SCREEN_WATCH_TIMEOUT_MS = 45_000;
export const SCREEN_FRAME_MAX_BYTES = 1_500_000;
export const SCREEN_MAX_EDGE = 1280;
export const SCREEN_JPEG_QUALITY = 55;
export const SCREEN_CAPTURE_TIMEOUT_MS = 8000;
export const SCREEN_ERROR_MAX = 2000;
export const SCREEN_HISTORY_CAP = 20;
export const SCREEN_INPUT_PENDING_CAP = 40;
export const SCREEN_INPUT_CLAIM_MAX = 16;
export const SCREEN_INPUT_BATCH_MAX = 8;
export const SCREEN_KEY_MAX = 32;
export const SCREEN_TEXT_MAX = 200;

export const SCREEN_SESSION_STATUSES = ["watching", "error", "closed"] as const;

export type ScreenSessionStatus = (typeof SCREEN_SESSION_STATUSES)[number];

export const SCREEN_FRAME_TYPES = ["image/jpeg", "image/png"] as const;

export type ScreenFrameType = (typeof SCREEN_FRAME_TYPES)[number];

export const SCREEN_INPUT_KINDS = [
  "move",
  "down",
  "up",
  "click",
  "scroll",
  "key",
  "text",
] as const;

export type ScreenInputKind = (typeof SCREEN_INPUT_KINDS)[number];

export const SCREEN_POINTER_BUTTONS = ["left", "right", "middle"] as const;

export type ScreenPointerButton = (typeof SCREEN_POINTER_BUTTONS)[number];

export const SCREEN_MODIFIERS = ["alt", "ctrl", "meta", "shift"] as const;

export type ScreenModifier = (typeof SCREEN_MODIFIERS)[number];

export type ScreenRenderMode =
  | "offline"
  | "upgrade"
  | "waiting"
  | "frame"
  | "stale"
  | "error";

export type ScreenControlMode = "none" | "view" | "control";

export type ScreenInputEvent = {
  button?: ScreenPointerButton;
  code?: string;
  count?: number;
  dx?: number;
  dy?: number;
  key?: string;
  kind: ScreenInputKind;
  modifiers?: ScreenModifier[];
  text?: string;
  x?: number;
  y?: number;
};

export function runtimeHasScreen(
  capabilities: readonly string[] | undefined
): boolean {
  return (capabilities ?? []).includes(BRIDGE_CAPABILITY_SCREEN);
}

export function runtimeHasScreenInput(
  capabilities: readonly string[] | undefined
): boolean {
  return (capabilities ?? []).includes(BRIDGE_CAPABILITY_SCREEN_INPUT);
}

export function isScreenFrameType(value: string): value is ScreenFrameType {
  return (SCREEN_FRAME_TYPES as readonly string[]).includes(value);
}

export function isScreenInputKind(value: string): value is ScreenInputKind {
  return (SCREEN_INPUT_KINDS as readonly string[]).includes(value);
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

export function readRasterSize(
  bytes: Uint8Array
): { height: number; width: number } | null {
  const kind = sniffScreenFrameType(bytes);
  if (kind === "image/png" && bytes.length >= 24) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const width = view.getUint32(16);
    const height = view.getUint32(20);
    if (width > 0 && height > 0) {
      return { height, width };
    }
    return null;
  }
  if (kind !== "image/jpeg") {
    return null;
  }
  let offset = 2;
  while (offset + 8 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = bytes[offset + 1];
    if (marker === undefined) {
      break;
    }
    if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {
      const height = (bytes[offset + 5]! << 8) | bytes[offset + 6]!;
      const width = (bytes[offset + 7]! << 8) | bytes[offset + 8]!;
      if (width > 0 && height > 0) {
        return { height, width };
      }
      return null;
    }
    const length = (bytes[offset + 2]! << 8) | bytes[offset + 3]!;
    if (length < 2) {
      break;
    }
    offset += 2 + length;
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

export function screenControlMode(input: {
  hasScreenInput: boolean;
  mode: ScreenRenderMode;
}): ScreenControlMode {
  if (input.mode !== "frame" && input.mode !== "stale") {
    return "none";
  }
  return input.hasScreenInput ? "control" : "view";
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

export function screenInputUpgradeMessage(): string {
  return "このマシンの tahcode は画面操作（キー / マウス）に未対応です。`npm i -g tahcode@latest && tahcode restart`";
}

export function clampUnit(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(1, Math.max(0, value));
}

export function mapScreenPoint(
  x: number,
  y: number,
  displayWidth: number,
  displayHeight: number
): { x: number; y: number } {
  const width = Math.max(1, Math.round(displayWidth));
  const height = Math.max(1, Math.round(displayHeight));
  return {
    x: Math.min(width - 1, Math.max(0, Math.round(clampUnit(x) * width))),
    y: Math.min(height - 1, Math.max(0, Math.round(clampUnit(y) * height))),
  };
}

/** Map a pointer onto an object-contain frame. Outside the image is null. */
export function screenPointFromClient(input: {
  clientX: number;
  clientY: number;
  height: number;
  left: number;
  naturalHeight: number;
  naturalWidth: number;
  top: number;
  width: number;
}): { x: number; y: number } | null {
  if (input.naturalWidth < 1 || input.naturalHeight < 1) {
    return null;
  }
  const scale = Math.min(
    input.width / input.naturalWidth,
    input.height / input.naturalHeight
  );
  const drawnWidth = input.naturalWidth * scale;
  const drawnHeight = input.naturalHeight * scale;
  const originX = input.left + (input.width - drawnWidth) / 2;
  const originY = input.top + (input.height - drawnHeight) / 2;
  if (drawnWidth < 1 || drawnHeight < 1) {
    return null;
  }
  const x = (input.clientX - originX) / drawnWidth;
  const y = (input.clientY - originY) / drawnHeight;
  if (x < 0 || x > 1 || y < 0 || y > 1) {
    return null;
  }
  return { x, y };
}

const POINTER_KIND = new Set<ScreenInputKind>([
  "move",
  "down",
  "up",
  "click",
  "scroll",
]);

export function sanitizeScreenInput(
  event: ScreenInputEvent
): ScreenInputEvent | null {
  if (!isScreenInputKind(event.kind)) {
    return null;
  }
  const modifiers = (event.modifiers ?? []).filter(
    (item): item is ScreenModifier =>
      (SCREEN_MODIFIERS as readonly string[]).includes(item)
  );
  const next: ScreenInputEvent = { kind: event.kind };
  if (modifiers.length > 0) {
    next.modifiers = modifiers;
  }
  if (POINTER_KIND.has(event.kind)) {
    if (typeof event.x !== "number" || typeof event.y !== "number") {
      return null;
    }
    next.x = clampUnit(event.x);
    next.y = clampUnit(event.y);
  }
  if (event.kind === "down" || event.kind === "up" || event.kind === "click") {
    const button = event.button ?? "left";
    if (!(SCREEN_POINTER_BUTTONS as readonly string[]).includes(button)) {
      return null;
    }
    next.button = button;
  }
  if (event.kind === "click") {
    const count = event.count ?? 1;
    if (!Number.isFinite(count) || count < 1 || count > 3) {
      return null;
    }
    next.count = Math.round(count);
  }
  if (event.kind === "scroll") {
    const dx = event.dx ?? 0;
    const dy = event.dy ?? 0;
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) {
      return null;
    }
    next.dx = Math.max(-40, Math.min(40, Math.round(dx)));
    next.dy = Math.max(-40, Math.min(40, Math.round(dy)));
  }
  if (event.kind === "key") {
    const key = (event.key ?? "").trim();
    const code = (event.code ?? "").trim();
    if (key.length === 0 && code.length === 0) {
      return null;
    }
    if (key.length > SCREEN_KEY_MAX || code.length > SCREEN_KEY_MAX) {
      return null;
    }
    if (key.length > 0) {
      next.key = key;
    }
    if (code.length > 0) {
      next.code = code;
    }
  }
  if (event.kind === "text") {
    const text = event.text ?? "";
    if (text.length === 0 || text.length > SCREEN_TEXT_MAX) {
      return null;
    }
    next.text = text;
  }
  return next;
}
