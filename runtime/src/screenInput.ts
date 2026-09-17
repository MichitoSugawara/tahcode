import { execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";

import {
  clipScreenError,
  mapScreenPoint,
  SCREEN_CAPTURE_TIMEOUT_MS,
} from "../../shared/workbenchScreen.ts";
import type { ScreenInputEvent } from "../../shared/workbenchScreen.ts";
import { resolveOnPath } from "./screenCapture.ts";

const execFile = promisify(execFileCb);

export type ScreenInputPlan =
  | { argv: string[]; kind: "command" }
  | { kind: "unsupported"; reason: string };

const MAC_KEY_CODES: Record<string, number> = {
  ArrowDown: 125,
  ArrowLeft: 123,
  ArrowRight: 124,
  ArrowUp: 126,
  Backspace: 51,
  Delete: 117,
  Enter: 36,
  Escape: 53,
  Tab: 48,
  " ": 49,
};

const XDOTOOL_KEYS: Record<string, string> = {
  ArrowDown: "Down",
  ArrowLeft: "Left",
  ArrowRight: "Right",
  ArrowUp: "Up",
  Backspace: "BackSpace",
  Delete: "Delete",
  Enter: "Return",
  Escape: "Escape",
  Tab: "Tab",
  " ": "space",
};

function quoteApple(value: string): string {
  return `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}

function macModifiers(modifiers: string[] | undefined): string {
  const names: string[] = [];
  for (const item of modifiers ?? []) {
    if (item === "meta") {
      names.push("command down");
    }
    if (item === "alt") {
      names.push("option down");
    }
    if (item === "ctrl") {
      names.push("control down");
    }
    if (item === "shift") {
      names.push("shift down");
    }
  }
  if (names.length === 0) {
    return "";
  }
  return ` using {${names.join(", ")}}`;
}

function xdotoolModifiers(modifiers: string[] | undefined): string {
  const names: string[] = [];
  for (const item of modifiers ?? []) {
    if (item === "meta") {
      names.push("super");
    }
    if (item === "alt") {
      names.push("alt");
    }
    if (item === "ctrl") {
      names.push("ctrl");
    }
    if (item === "shift") {
      names.push("shift");
    }
  }
  return names.join("+");
}

export function selectScreenInputPlan(
  platform: NodeJS.Platform,
  env: { DISPLAY?: string; WAYLAND_DISPLAY?: string },
  which: (bin: string) => string | null = resolveOnPath
): ScreenInputPlan {
  if (platform === "darwin") {
    const cliclick = which("cliclick");
    if (cliclick) {
      return { argv: [cliclick], kind: "command" };
    }
    const osascript = which("osascript");
    if (osascript) {
      return { argv: [osascript, "-e"], kind: "command" };
    }
    return {
      kind: "unsupported",
      reason: "画面操作に cliclick / osascript がありません。",
    };
  }
  if (platform === "linux") {
    if (!env.DISPLAY && !env.WAYLAND_DISPLAY) {
      return {
        kind: "unsupported",
        reason: "ディスプレイがありません。画面操作を送れません。",
      };
    }
    const xdotool = which("xdotool");
    if (xdotool && env.DISPLAY) {
      return { argv: [xdotool], kind: "command" };
    }
    const ydotool = which("ydotool");
    if (ydotool) {
      return { argv: [ydotool], kind: "command" };
    }
    return {
      kind: "unsupported",
      reason: "画面操作に xdotool / ydotool がありません。",
    };
  }
  return {
    kind: "unsupported",
    reason: "この OS の画面操作はまだありません。",
  };
}

function cliclickArgs(
  bin: string,
  event: ScreenInputEvent,
  point: { x: number; y: number }
): string[] {
  const at = `${point.x},${point.y}`;
  if (event.kind === "move") {
    return [bin, `m:${at}`];
  }
  if (event.kind === "down") {
    return [bin, `dd:${at}`];
  }
  if (event.kind === "up") {
    return [bin, `du:${at}`];
  }
  if (event.kind === "click") {
    if (event.button === "right") {
      return [bin, `rc:${at}`];
    }
    if ((event.count ?? 1) >= 2) {
      return [bin, `dc:${at}`];
    }
    return [bin, `c:${at}`];
  }
  if (event.kind === "scroll") {
    const steps = event.dy ?? 0;
    if (steps === 0) {
      return [bin, `m:${at}`];
    }
    return [bin, `m:${at}`, steps > 0 ? `w:-${steps}` : `w:${Math.abs(steps)}`];
  }
  if (event.kind === "text" && event.text) {
    return [bin, `t:${event.text}`];
  }
  if (event.kind === "key" && event.key && event.key.length === 1) {
    return [bin, `t:${event.key}`];
  }
  return [bin, `m:${at}`];
}

function osascriptSource(
  event: ScreenInputEvent,
  point: { x: number; y: number }
): string {
  const clickAt = `tell application "System Events" to click at {${point.x}, ${point.y}}`;
  if (event.kind === "move" || event.kind === "down" || event.kind === "up") {
    return clickAt;
  }
  if (event.kind === "click") {
    return event.button === "right"
      ? `tell application "System Events" to click at {${point.x}, ${point.y}}`
      : clickAt;
  }
  if (event.kind === "text" && event.text) {
    return `tell application "System Events" to keystroke ${quoteApple(event.text)}`;
  }
  if (event.kind === "key") {
    const mods = macModifiers(event.modifiers);
    const code =
      MAC_KEY_CODES[event.key ?? ""] ?? MAC_KEY_CODES[event.code ?? ""];
    if (code !== undefined) {
      return `tell application "System Events" to key code ${code}${mods}`;
    }
    const key = event.key ?? "";
    if (key.length === 1) {
      return `tell application "System Events" to keystroke ${quoteApple(key)}${mods}`;
    }
  }
  if (event.kind === "scroll") {
    return clickAt;
  }
  return clickAt;
}

function xdotoolArgs(
  bin: string,
  event: ScreenInputEvent,
  point: { x: number; y: number }
): string[] {
  if (event.kind === "move") {
    return [bin, "mousemove", String(point.x), String(point.y)];
  }
  if (event.kind === "down") {
    const button =
      event.button === "right" ? "3" : event.button === "middle" ? "2" : "1";
    return [
      bin,
      "mousemove",
      String(point.x),
      String(point.y),
      "mousedown",
      button,
    ];
  }
  if (event.kind === "up") {
    const button =
      event.button === "right" ? "3" : event.button === "middle" ? "2" : "1";
    return [bin, "mouseup", button];
  }
  if (event.kind === "click") {
    const button =
      event.button === "right" ? "3" : event.button === "middle" ? "2" : "1";
    return [
      bin,
      "mousemove",
      String(point.x),
      String(point.y),
      "click",
      "--repeat",
      String(event.count ?? 1),
      button,
    ];
  }
  if (event.kind === "scroll") {
    const dy = event.dy ?? 0;
    const button = dy > 0 ? "5" : "4";
    return [
      bin,
      "mousemove",
      String(point.x),
      String(point.y),
      "click",
      "--repeat",
      String(Math.min(8, Math.abs(dy) || 1)),
      button,
    ];
  }
  if (event.kind === "text" && event.text) {
    return [bin, "type", "--", event.text];
  }
  if (event.kind === "key") {
    const mapped =
      XDOTOOL_KEYS[event.key ?? ""] ?? event.key ?? event.code ?? "";
    const mods = xdotoolModifiers(event.modifiers);
    const chord = mods.length > 0 ? `${mods}+${mapped}` : mapped;
    return [bin, "key", chord];
  }
  return [bin, "mousemove", String(point.x), String(point.y)];
}

export function buildScreenInputArgv(
  plan: Extract<ScreenInputPlan, { kind: "command" }>,
  event: ScreenInputEvent,
  displayWidth: number,
  displayHeight: number
): string[] {
  const point = mapScreenPoint(
    event.x ?? 0,
    event.y ?? 0,
    displayWidth,
    displayHeight
  );
  const bin = plan.argv[0] ?? "";
  if (bin.endsWith("cliclick") || bin === "cliclick") {
    return cliclickArgs(bin, event, point);
  }
  if (bin.endsWith("osascript") || bin === "osascript") {
    return [...plan.argv, osascriptSource(event, point)];
  }
  if (bin.endsWith("xdotool") || bin === "xdotool") {
    return xdotoolArgs(bin, event, point);
  }
  if (event.kind === "click") {
    return [bin, "click", String(point.x), String(point.y)];
  }
  return [bin, "mousemove", String(point.x), String(point.y)];
}

export async function injectScreenInput(
  event: ScreenInputEvent,
  displayWidth: number,
  displayHeight: number,
  input?: {
    env?: { DISPLAY?: string; WAYLAND_DISPLAY?: string };
    platform?: NodeJS.Platform;
    run?: (argv: string[]) => Promise<void>;
    which?: (bin: string) => string | null;
  }
): Promise<{ error?: string; ok: boolean }> {
  const plan = selectScreenInputPlan(
    input?.platform ?? process.platform,
    input?.env ?? {
      DISPLAY: process.env.DISPLAY,
      WAYLAND_DISPLAY: process.env.WAYLAND_DISPLAY,
    },
    input?.which ?? resolveOnPath
  );
  if (plan.kind === "unsupported") {
    return { error: plan.reason, ok: false };
  }
  const argv = buildScreenInputArgv(plan, event, displayWidth, displayHeight);
  try {
    if (input?.run) {
      await input.run(argv);
    } else {
      const [bin, ...rest] = argv;
      if (!bin) {
        throw new Error("input command is empty");
      }
      await execFile(bin, rest, { timeout: SCREEN_CAPTURE_TIMEOUT_MS });
    }
    return { ok: true };
  } catch (error) {
    return {
      error: clipScreenError(
        error instanceof Error ? error.message : String(error)
      ),
      ok: false,
    };
  }
}
