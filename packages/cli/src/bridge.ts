import { spawn, spawnSync } from "node:child_process";
import {
  chmodSync,
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  readSync,
  renameSync,
  rmSync,
  statSync,
  unwatchFile,
  watchFile,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";

import { CONFIG_DIR } from "./config.ts";
import {
  BRIDGE_ENV_PATH,
  persistBridgeEnvSecrets,
  readPlistEnvironmentVariables,
  resolveLaunchdEnvironment,
} from "./launchdEnv.ts";
import type { LaunchdEnvSources } from "./launchdEnv.ts";

/* ─────────────────────────────────────────────────────────
 * tahcode bridge process management.
 *
 * The bridge (runtime/src/runner.ts runLoop) is a long-running
 * poller. It can run
 *   - foreground   `tahcode start --foreground` (Ctrl+C to stop)
 *   - detached     `tahcode start` — re-spawns this CLI with
 *                  --foreground, stdio → ~/.tahcode/bridge.log
 *   - launchd      macOS user agent (`tahcode service install`)
 * Whatever the mode, the bridge process itself owns
 * ~/.tahcode/bridge.json (pid + how it was started) so that
 * status / stop / restart / logs can find it.
 * ───────────────────────────────────────────────────────── */

export type BridgeMode = "foreground" | "detached" | "launchd";

export interface BridgeState {
  pid: number;
  mode: BridgeMode;
  startedAt: string;
  cwd: string;
  provider?: string;
  log?: string;
}

export interface BridgeLaunchOptions {
  cwd: string;
  provider?: string;
  /** Skip `multica daemon start` inside the bridge process (`--no-daemon`). */
  noDaemon?: boolean;
}

export const BRIDGE_STATE_PATH = path.join(CONFIG_DIR, "bridge.json");
export const BRIDGE_LOG_PATH = path.join(CONFIG_DIR, "bridge.log");
export { BRIDGE_ENV_PATH };
export const LAUNCHD_LABEL = "com.tahcode.bridge";
export const LAUNCHD_PLIST_PATH = path.join(
  os.homedir(),
  "Library",
  "LaunchAgents",
  `${LAUNCHD_LABEL}.plist`
);

const LOG_ROTATE_BYTES = 5 * 1024 * 1024;
const STOP_TIMEOUT_MS = 5000;

/* ── state file ─────────────────────────────────────────── */

export function readBridgeState(): BridgeState | null {
  try {
    if (!existsSync(BRIDGE_STATE_PATH)) {
      return null;
    }
    const parsed = JSON.parse(
      readFileSync(BRIDGE_STATE_PATH, "utf-8")
    ) as Partial<BridgeState>;
    if (typeof parsed.pid !== "number" || !parsed.mode || !parsed.cwd) {
      return null;
    }
    return parsed as BridgeState;
  } catch {
    return null;
  }
}

export function writeBridgeState(state: BridgeState): void {
  mkdirSync(CONFIG_DIR, { mode: 0o700, recursive: true });
  writeFileSync(BRIDGE_STATE_PATH, `${JSON.stringify(state, null, 2)}\n`, {
    mode: 0o600,
  });
}

/** Remove the state file, but only if it still belongs to `pid` (avoid clobbering a newer bridge). */
export function clearBridgeState(pid?: number): void {
  const current = readBridgeState();
  if (pid !== undefined && current && current.pid !== pid) {
    return;
  }
  try {
    rmSync(BRIDGE_STATE_PATH, { force: true });
  } catch {
    /* ignore */
  }
}

export function processAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

/** Live bridge state, or null (a stale file left by a crash / reboot is removed). */
export function runningBridge(): BridgeState | null {
  const state = readBridgeState();
  if (!state) {
    return null;
  }
  if (processAlive(state.pid)) {
    return state;
  }
  clearBridgeState(state.pid);
  return null;
}

export function uptime(startedAt: string): string {
  const ms = Date.now() - new Date(startedAt).getTime();
  if (!Number.isFinite(ms) || ms < 0) {
    return "";
  }
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) {
    return `${Math.floor(ms / 1000)}s`;
  }
  if (minutes < 60) {
    return `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 48) {
    return `${hours}h${minutes % 60}m`;
  }
  return `${Math.floor(hours / 24)}d`;
}

/* ── in-process registration (called by the bridge itself) ── */

/**
 * Register the current process as the bridge and clean up on exit.
 * Also prefixes log lines with a timestamp when stdout is not a TTY
 * (detached / launchd → log file).
 */
export function registerBridgeProcess(
  options: BridgeLaunchOptions,
  mode: BridgeMode
): void {
  writeBridgeState({
    cwd: options.cwd,
    log: mode === "foreground" ? undefined : BRIDGE_LOG_PATH,
    mode,
    pid: process.pid,
    provider: options.provider,
    startedAt: new Date().toISOString(),
  });
  if (!process.stdout.isTTY) {
    timestampConsole();
  }

  const shutdown = (signal: NodeJS.Signals) => {
    console.log(`[bridge] ${signal} を受信、停止します`);
    clearBridgeState(process.pid);
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
  process.on("SIGHUP", shutdown);
  process.on("exit", () => clearBridgeState(process.pid));
}

function timestampConsole(): void {
  const stamp = () => new Date().toISOString();
  const wrapConsole = (method: "log" | "error" | "warn") => {
    const original = console[method].bind(console);
    console[method] = (...args: unknown[]) => {
      // heading() opens with a blank line; keep the log one-line-per-entry.
      if (typeof args[0] === "string" && args[0].startsWith("\n")) {
        args[0] = args[0].slice(1);
      }
      original(stamp(), ...args);
    };
  };
  wrapConsole("log");
  wrapConsole("error");
  wrapConsole("warn");
}

/* ── detached spawn ─────────────────────────────────────── */

/** argv (node + loader flags + CLI script) that re-invokes this CLI. */
export function selfCommand(): string[] {
  return [
    process.execPath,
    ...process.execArgv,
    path.resolve(process.argv[1] ?? ""),
  ];
}

export function bridgeArgs(options: BridgeLaunchOptions): string[] {
  return [
    "start",
    "--foreground",
    ...(options.noDaemon ? ["--no-daemon"] : []),
    "--cwd",
    options.cwd,
    ...(options.provider ? ["--provider", options.provider] : []),
  ];
}

export function rotateLogIfLarge(logPath = BRIDGE_LOG_PATH): void {
  try {
    if (existsSync(logPath) && statSync(logPath).size > LOG_ROTATE_BYTES) {
      renameSync(logPath, `${logPath}.1`);
    }
  } catch {
    /* ignore */
  }
}

/**
 * Spawn the bridge as a detached child (own process group, stdio → log file)
 * and wait briefly to confirm it registered itself. Resolves with the state.
 */
export async function spawnDetachedBridge(
  options: BridgeLaunchOptions
): Promise<BridgeState> {
  mkdirSync(CONFIG_DIR, { mode: 0o700, recursive: true });
  rotateLogIfLarge();
  const logFd = openSync(BRIDGE_LOG_PATH, "a", 0o600);
  const [bin, ...prefix] = selfCommand();
  const child = spawn(bin!, [...prefix, ...bridgeArgs(options)], {
    detached: true,
    env: { ...process.env, TAHCODE_BRIDGE_MODE: "detached" },
    stdio: ["ignore", logFd, logFd],
    windowsHide: true,
  });
  closeSync(logFd);
  const { pid } = child;
  child.unref();
  if (!pid) {
    throw new Error("ブリッジプロセスを起動できませんでした");
  }

  const deadline = Date.now() + 3000;
  while (Date.now() < deadline) {
    const state = readBridgeState();
    if (state && state.pid === pid) {
      return state;
    }
    if (!processAlive(pid)) {
      throw new Error(
        `ブリッジがすぐに終了しました。${BRIDGE_LOG_PATH} を確認してください`
      );
    }
    await sleep(100);
  }
  return {
    cwd: options.cwd,
    log: BRIDGE_LOG_PATH,
    mode: "detached",
    pid,
    provider: options.provider,
    startedAt: new Date().toISOString(),
  };
}

/* ── stop ───────────────────────────────────────────────── */

function signalBridge(pid: number, signal: NodeJS.Signals): void {
  // Detached bridges lead their own process group: signal the group so any
  // agent CLI the bridge spawned goes down with it. Fall back to the pid alone.
  if (process.platform !== "win32") {
    try {
      process.kill(-pid, signal);
      return;
    } catch {
      /* not a group leader (foreground / launchd) */
    }
  }
  process.kill(pid, signal);
}

/** SIGTERM the bridge (then SIGKILL after a grace period). Returns false if nothing was running. */
export async function stopBridgeProcess(state: BridgeState): Promise<boolean> {
  if (!processAlive(state.pid)) {
    clearBridgeState(state.pid);
    return false;
  }
  signalBridge(state.pid, "SIGTERM");
  const deadline = Date.now() + STOP_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (!processAlive(state.pid)) {
      break;
    }
    await sleep(100);
  }
  if (processAlive(state.pid)) {
    signalBridge(state.pid, "SIGKILL");
    await sleep(200);
  }
  clearBridgeState(state.pid);
  return true;
}

/* ── logs ───────────────────────────────────────────────── */

export function tailLog(lines: number, logPath = BRIDGE_LOG_PATH): string[] {
  if (!existsSync(logPath)) {
    return [];
  }
  const content = readFileSync(logPath, "utf-8");
  const all = content.endsWith("\n")
    ? content.slice(0, -1).split("\n")
    : content.split("\n");
  return all
    .filter((line, index) => line.length > 0 || index < all.length - 1)
    .slice(-lines);
}

/** Print the last `lines`, then keep streaming appended bytes until Ctrl+C. */
export function followLog(
  lines: number,
  logPath = BRIDGE_LOG_PATH
): Promise<void> {
  for (const line of tailLog(lines, logPath)) {
    console.log(line);
  }
  let offset = existsSync(logPath) ? statSync(logPath).size : 0;
  return new Promise((resolve) => {
    const onChange = () => {
      if (!existsSync(logPath)) {
        return;
      }
      const { size } = statSync(logPath);
      if (size < offset) {
        offset = 0;
      } // rotated / truncated
      if (size === offset) {
        return;
      }
      const fd = openSync(logPath, "r");
      try {
        const buffer = Buffer.alloc(size - offset);
        readSync(fd, buffer, 0, buffer.length, offset);
        process.stdout.write(buffer.toString("utf-8"));
      } finally {
        closeSync(fd);
      }
      offset = size;
    };
    watchFile(logPath, { interval: 500 }, onChange);
    const stop = () => {
      unwatchFile(logPath, onChange);
      resolve();
    };
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
  });
}

/* ── macOS launchd ──────────────────────────────────────── */

export function launchdSupported(): boolean {
  return process.platform === "darwin";
}

function launchdDomain(): string {
  return `gui/${typeof process.getuid === "function" ? process.getuid() : 501}`;
}

function launchctl(args: string[]): { status: number; out: string } {
  const result = spawnSync("launchctl", args, {
    encoding: "utf-8",
    timeout: 15_000,
  });
  if (result.error) {
    return { status: 127, out: result.error.message };
  }
  return {
    out: `${result.stdout ?? ""}${result.stderr ?? ""}`,
    status: result.status ?? 1,
  };
}

export function launchdInstalled(): boolean {
  return launchdSupported() && existsSync(LAUNCHD_PLIST_PATH);
}

/** Is the agent loaded in the user's launchd domain? Returns its pid when it is running. */
export function launchdStatus(): { loaded: boolean; pid?: number } {
  if (!launchdSupported()) {
    return { loaded: false };
  }
  const result = launchctl(["print", `${launchdDomain()}/${LAUNCHD_LABEL}`]);
  if (result.status !== 0) {
    return { loaded: false };
  }
  const pid = /^\s*pid = (\d+)/m.exec(result.out)?.[1];
  return { loaded: true, pid: pid ? Number(pid) : undefined };
}

function launchdEnvKeyRank(key: string): number {
  if (key === "HOME") {
    return 0;
  }
  if (key === "PATH") {
    return 1;
  }
  if (key === "TAHCODE_BRIDGE_MODE") {
    return 2;
  }
  return 10;
}

function compareLaunchdEnvKeys(left: string, right: string): number {
  const diff = launchdEnvKeyRank(left) - launchdEnvKeyRank(right);
  return diff === 0 ? left.localeCompare(right) : diff;
}

function xml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function launchdEnvironment(
  sources: LaunchdEnvSources = {},
  plistPath = LAUNCHD_PLIST_PATH
): Record<string, string> {
  return resolveLaunchdEnvironment(sources, {
    envPath: BRIDGE_ENV_PATH,
    plistPath,
  });
}

export function renderLaunchdPlist(
  options: BridgeLaunchOptions,
  env: Record<string, string>
): string {
  const programArguments = [...selfCommand(), ...bridgeArgs(options)];
  const keys = Object.keys(env).sort(compareLaunchdEnvKeys);
  const dictEntries = keys
    .map(
      (key) =>
        `      <key>${xml(key)}</key>\n      <string>${xml(env[key] ?? "")}</string>`
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>Label</key>
    <string>${LAUNCHD_LABEL}</string>
    <key>ProgramArguments</key>
    <array>
${programArguments.map((argument) => `      <string>${xml(argument)}</string>`).join("\n")}
    </array>
    <key>WorkingDirectory</key>
    <string>${xml(options.cwd)}</string>
    <key>EnvironmentVariables</key>
    <dict>
${dictEntries}
    </dict>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>ThrottleInterval</key>
    <integer>15</integer>
    <key>ProcessType</key>
    <string>Background</string>
    <key>StandardOutPath</key>
    <string>${xml(BRIDGE_LOG_PATH)}</string>
    <key>StandardErrorPath</key>
    <string>${xml(BRIDGE_LOG_PATH)}</string>
  </dict>
</plist>
`;
}

export function launchdPlist(options: BridgeLaunchOptions): string {
  return renderLaunchdPlist(options, launchdEnvironment());
}

/** Write the plist and load it (starts the bridge immediately via RunAtLoad). */
export function launchdInstall(options: BridgeLaunchOptions): {
  ok: boolean;
  detail: string;
} {
  if (!launchdSupported()) {
    return { ok: false, detail: "launchd は macOS のみ対応です" };
  }
  mkdirSync(path.dirname(LAUNCHD_PLIST_PATH), { recursive: true });
  mkdirSync(CONFIG_DIR, { mode: 0o700, recursive: true });
  const env = launchdEnvironment({
    existingPlistEnv: readPlistEnvironmentVariables(LAUNCHD_PLIST_PATH),
  });
  persistBridgeEnvSecrets(env);
  if (launchdStatus().loaded) {
    launchctl(["bootout", `${launchdDomain()}/${LAUNCHD_LABEL}`]);
  }
  writeFileSync(LAUNCHD_PLIST_PATH, renderLaunchdPlist(options, env), {
    mode: 0o600,
  });
  chmodSync(LAUNCHD_PLIST_PATH, 0o600);
  return launchdLoad();
}

export function launchdLoad(): { ok: boolean; detail: string } {
  const result = launchctl(["bootstrap", launchdDomain(), LAUNCHD_PLIST_PATH]);
  if (result.status === 0) {
    return { ok: true, detail: "" };
  }
  const legacy = launchctl(["load", "-w", LAUNCHD_PLIST_PATH]);
  return legacy.status === 0
    ? { detail: "", ok: true }
    : { detail: (result.out || legacy.out).trim(), ok: false };
}

/** Unload from launchd (stops the bridge; RunAtLoad brings it back only while the plist exists). */
export function launchdUnload(): { ok: boolean; detail: string } {
  if (!launchdStatus().loaded) {
    return { ok: true, detail: "not loaded" };
  }
  const result = launchctl(["bootout", `${launchdDomain()}/${LAUNCHD_LABEL}`]);
  if (result.status === 0) {
    return { ok: true, detail: "" };
  }
  const legacy = launchctl(["unload", LAUNCHD_PLIST_PATH]);
  return legacy.status === 0
    ? { detail: "", ok: true }
    : { detail: (result.out || legacy.out).trim(), ok: false };
}

export function launchdUninstall(): {
  ok: boolean;
  detail: string;
  removed: boolean;
} {
  const unload = launchdUnload();
  const removed = existsSync(LAUNCHD_PLIST_PATH);
  if (removed) {
    rmSync(LAUNCHD_PLIST_PATH, { force: true });
  }
  return { ...unload, removed };
}

/** `launchctl kickstart -k` — restart the launchd-managed bridge in place. */
export function launchdRestart(): { ok: boolean; detail: string } {
  const result = launchctl([
    "kickstart",
    "-k",
    `${launchdDomain()}/${LAUNCHD_LABEL}`,
  ]);
  return result.status === 0
    ? { detail: "", ok: true }
    : { detail: result.out.trim(), ok: false };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
