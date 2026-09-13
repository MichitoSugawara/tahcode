/* ─────────────────────────────────────────────────────────
 * One-click "register this Mac" — shared types and argument
 * checks for the Electron IPC. Pure functions only.
 *
 * The renderer never gets a shell. It may only ask the main
 * process for hostname / CLI status / registerLocalRuntime
 * with a tightly validated payload (no free-form command).
 * ───────────────────────────────────────────────────────── */

/** ipcMain.handle / ipcRenderer.invoke channel names. */
export const DESKTOP_IPC = {
  applyUpdate: "tahcode:desktop:applyUpdate",
  checkForUpdates: "tahcode:desktop:checkForUpdates",
  downloadUpdate: "tahcode:desktop:downloadUpdate",
  getCliStatus: "tahcode:desktop:getCliStatus",
  getHostname: "tahcode:desktop:getHostname",
  getUpdateState: "tahcode:desktop:getUpdateState",
  openLatestRelease: "tahcode:desktop:openLatestRelease",
  openUpdateUi: "tahcode:desktop:openUpdateUi",
  registerLocalRuntime: "tahcode:desktop:registerLocalRuntime",
  registerProgress: "tahcode:desktop:registerProgress",
  setAutoUpdate: "tahcode:desktop:setAutoUpdate",
  updateState: "tahcode:desktop:updateState",
  updateUiReady: "tahcode:desktop:updateUiReady",
} as const;

/** Allow-listed progress steps sent on `DESKTOP_IPC.registerProgress`. */
export const REGISTER_PROGRESS_STEPS = [
  "installing-cli",
  "linking",
  "restarting-bridge",
  "starting-bridge",
] as const;

export type RegisterProgressStep = (typeof REGISTER_PROGRESS_STEPS)[number];

export function isRegisterProgressStep(
  value: unknown
): value is RegisterProgressStep {
  return (
    typeof value === "string" &&
    (REGISTER_PROGRESS_STEPS as readonly string[]).includes(value)
  );
}

/** Desktop passes this so *it* owns stop→start after link (old CLIs ignore it). */
export const LINK_NO_RESTART_FLAG = "--no-restart";

/** argv after `tahcode` for a one-click link that does not touch a running bridge. */
export function linkArgv(
  request: RegisterLocalRuntimeRequest,
  noRestart = true
): string[] {
  const args = [
    "link",
    "--url",
    request.convexUrl,
    "--runtime",
    request.runtimeId,
    "--token",
    request.token,
    "--name",
    request.name,
  ];
  if (noRestart) {
    args.push(LINK_NO_RESTART_FLAG);
  }
  return args;
}

/**
 * After a successful link, recycle a running bridge or start one without
 * Multica (`--no-daemon`). Bridge-only is enough for the runtime to come online.
 */
export function planRegisterAfterLink(bridgeAlreadyRunning: boolean): {
  args: readonly string[];
  progress: RegisterProgressStep;
} {
  if (bridgeAlreadyRunning) {
    return { args: ["restart", "bridge"], progress: "restarting-bridge" };
  }
  return { args: ["start", "--no-daemon"], progress: "starting-bridge" };
}

export const MACHINE_NAME_MAX = 60;

export type DesktopRegisterErrorCode =
  | "busy"
  | "cli-install-failed"
  | "cli-missing"
  | "elevation-required"
  | "invalid-args"
  | "link-failed"
  | "start-failed";

export interface DesktopCliStatus {
  available: boolean;
  npmAvailable: boolean;
  path: string | null;
  version: string | null;
}

export interface RegisterLocalRuntimeRequest {
  convexUrl: string;
  name: string;
  runtimeId: string;
  token: string;
}

export interface DesktopDoctorGuidance {
  commands: string[];
  detail: string;
  title: string;
}

export interface RegisterLocalRuntimeOk {
  cliPath: string;
  guidance?: DesktopDoctorGuidance;
  installedCli: boolean;
  ok: true;
  /** True when an already-running bridge was stopped and started on the new link. */
  restartedBridge: boolean;
}

export interface RegisterLocalRuntimeErr {
  code: DesktopRegisterErrorCode;
  fallbackCommands?: string[];
  guidance?: DesktopDoctorGuidance;
  message: string;
  ok: false;
}

export type RegisterLocalRuntimeResult =
  | RegisterLocalRuntimeOk
  | RegisterLocalRuntimeErr;

const RUNTIME_ID = /^[a-z0-9]{10,80}$/i;
const RUNTIME_TOKEN = /^th_[a-f0-9]{24,96}$/i;

function parseUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function isLoopbackHost(hostname: string): boolean {
  return hostname === "127.0.0.1" || hostname === "localhost";
}

/** Convex deployment URL, or a loopback `npx convex dev` URL. */
export function isAllowedConvexUrl(value: string): boolean {
  const url = parseUrl(value);
  if (!url) {
    return false;
  }
  if (url.username !== "" || url.password !== "" || url.hash !== "") {
    return false;
  }
  if (url.pathname !== "/" && url.pathname !== "") {
    return false;
  }
  if (url.protocol === "https:") {
    return (
      url.hostname.endsWith(".convex.cloud") ||
      url.hostname.endsWith(".convex.site")
    );
  }
  if (url.protocol === "http:") {
    return isLoopbackHost(url.hostname);
  }
  return false;
}

export function isAllowedRuntimeId(value: string): boolean {
  return RUNTIME_ID.test(value);
}

export function isAllowedRuntimeToken(value: string): boolean {
  return RUNTIME_TOKEN.test(value);
}

function hasControlChars(value: string): boolean {
  for (const char of value) {
    const code = char.codePointAt(0);
    if (code !== undefined && (code < 32 || code === 127)) {
      return true;
    }
  }
  return false;
}

export function isAllowedMachineName(value: string): boolean {
  const name = value.trim();
  return (
    name.length > 0 && name.length <= MACHINE_NAME_MAX && !hasControlChars(name)
  );
}

export function parseRegisterLocalRuntimeRequest(
  raw: unknown
):
  | { ok: true; value: RegisterLocalRuntimeRequest }
  | { message: string; ok: false } {
  if (raw === null || typeof raw !== "object") {
    return { message: "登録リクエストの形式が正しくありません。", ok: false };
  }
  const record = raw as Record<string, unknown>;
  const convexUrl =
    typeof record.convexUrl === "string" ? record.convexUrl : "";
  const runtimeId =
    typeof record.runtimeId === "string" ? record.runtimeId : "";
  const token = typeof record.token === "string" ? record.token : "";
  const name = typeof record.name === "string" ? record.name.trim() : "";

  if (!isAllowedConvexUrl(convexUrl)) {
    return {
      message: "Convex URL が許可された形式ではありません。",
      ok: false,
    };
  }
  if (!isAllowedRuntimeId(runtimeId)) {
    return { message: "runtime id が正しくありません。", ok: false };
  }
  if (!isAllowedRuntimeToken(token)) {
    return { message: "トークンが正しくありません。", ok: false };
  }
  if (!isAllowedMachineName(name)) {
    return { message: "マシン名が正しくありません。", ok: false };
  }
  return {
    ok: true,
    value: { convexUrl, name, runtimeId, token },
  };
}

/** Drop `.local` (Bonjour) so a Mac hostname is a usable machine name. */
export function displayHostname(hostname: string): string {
  const trimmed = hostname.trim();
  if (trimmed.length === 0) {
    return "";
  }
  const withoutLocal = trimmed.replace(/\.local$/i, "");
  return (withoutLocal || trimmed).slice(0, MACHINE_NAME_MAX);
}

/** Browser-only fallback when the shell cannot supply a hostname. */
export function guessBrowserMachineName(
  userAgent: string,
  isoDate = new Date().toISOString()
): string {
  const os = /Mac/.test(userAgent)
    ? "mac"
    : /Windows/.test(userAgent)
      ? "win"
      : /Linux/.test(userAgent)
        ? "linux"
        : "machine";
  return `${os}-${isoDate.slice(5, 10).replace("-", "")}`;
}

export function posixShellQuote(value: string): string {
  return `'${value.replaceAll("'", `'"'"'`)}'`;
}

export function fallbackRegisterCommands(
  request: RegisterLocalRuntimeRequest
): string[] {
  const link = [
    "tahcode link",
    `--url ${posixShellQuote(request.convexUrl)}`,
    `--runtime ${posixShellQuote(request.runtimeId)}`,
    `--token ${posixShellQuote(request.token)}`,
    `--name ${posixShellQuote(request.name)}`,
  ].join(" ");
  return ["npm i -g tahcode", link, "tahcode start"];
}

export function redactSecrets(
  text: string,
  secrets: readonly string[]
): string {
  let out = text;
  for (const secret of secrets) {
    if (secret.length < 8) {
      continue;
    }
    out = out.split(secret).join(`${secret.slice(0, 3)}…`);
  }
  return out;
}

export function looksLikeElevationError(text: string): boolean {
  return /EACCES|EPERM|permission denied|as root|as administrator/i.test(text);
}

export function mergePath(
  existing: string,
  extras: readonly string[],
  delimiter: string
): string {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of [...extras, ...existing.split(delimiter)]) {
    if (part.length === 0 || seen.has(part)) {
      continue;
    }
    seen.add(part);
    out.push(part);
  }
  return out.join(delimiter);
}
