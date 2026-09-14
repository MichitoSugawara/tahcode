import { spawn } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  fallbackRegisterCommands,
  linkArgv,
  looksLikeElevationError,
  mergePath,
  parseRegisterLocalRuntimeRequest,
  planRegisterAfterLink,
  redactSecrets,
} from "@tahcode/core/desktop";
import type {
  DesktopCliStatus,
  RegisterLocalRuntimeRequest,
  RegisterLocalRuntimeResult,
  RegisterProgressStep,
} from "@tahcode/core/desktop";

/* ─────────────────────────────────────────────────────────
 * Register this machine from the Electron main process.
 *
 * The renderer only sends { convexUrl, runtimeId, token, name }.
 * Every child is spawned with an argv array (never a shell):
 *   tahcode link … --no-restart
 *   tahcode restart bridge   (existing bridge)
 *   tahcode start            (first start; tahcode bridge only)
 * The raw token is never logged.
 * ───────────────────────────────────────────────────────── */

const CLI_NAMES = ["tahcode", "tahcode.cmd"] as const;
const NPM_NAMES = ["npm", "npm.cmd"] as const;
const VERSION_TIMEOUT_MS = 8_000;
const INSTALL_TIMEOUT_MS = 180_000;
const LINK_TIMEOUT_MS = 30_000;
const START_TIMEOUT_MS = 60_000;

let registerInFlight = false;

export function desktopHostname(): string {
  return os.hostname();
}

export async function getCliStatus(): Promise<DesktopCliStatus> {
  const env = cliEnv();
  const cli = findOnPath(CLI_NAMES, env.PATH ?? "");
  const npm = findOnPath(NPM_NAMES, env.PATH ?? "");
  if (!cli) {
    return {
      available: false,
      npmAvailable: npm !== null,
      path: null,
      version: null,
    };
  }
  const probe = await run(cli, ["--version"], {
    env,
    timeoutMs: VERSION_TIMEOUT_MS,
  });
  const version = firstLine(`${probe.stdout}\n${probe.stderr}`) || null;
  return {
    available: probe.code === 0,
    npmAvailable: npm !== null,
    path: cli,
    version,
  };
}

export async function registerLocalRuntime(
  raw: unknown,
  onProgress?: (step: RegisterProgressStep) => void
): Promise<RegisterLocalRuntimeResult> {
  const parsed = parseRegisterLocalRuntimeRequest(raw);
  if (!parsed.ok) {
    return { code: "invalid-args", message: parsed.message, ok: false };
  }
  if (registerInFlight) {
    return {
      code: "busy",
      message: "この Mac の登録がすでに進行中です。",
      ok: false,
    };
  }
  registerInFlight = true;
  const request = parsed.value;
  const fallbackCommands = fallbackRegisterCommands(request);
  try {
    return await registerLocalRuntimeUnchecked(
      request,
      fallbackCommands,
      onProgress
    );
  } finally {
    registerInFlight = false;
  }
}

async function registerLocalRuntimeUnchecked(
  request: RegisterLocalRuntimeRequest,
  fallbackCommands: string[],
  onProgress?: (step: RegisterProgressStep) => void
): Promise<RegisterLocalRuntimeResult> {
  const env = cliEnv();
  const existingCli = findOnPath(CLI_NAMES, env.PATH ?? "");
  if (!existingCli) {
    onProgress?.("installing-cli");
  }
  const ensured = await ensureCli(env, fallbackCommands, request.token);
  if (!ensured.ok) {
    return ensured;
  }

  const { cliPath, installedCli } = ensured;
  const bridgeAlreadyRunning = bridgeLooksRunning();
  const followup = planRegisterAfterLink(bridgeAlreadyRunning);
  console.log(
    `tahcode desktop: linking runtime ${request.runtimeId.slice(0, 8)}…`
  );
  onProgress?.("linking");

  const linked = await run(cliPath, linkArgv(request), {
    env,
    timeoutMs: LINK_TIMEOUT_MS,
  });
  if (linked.code !== 0) {
    return commandFailed(
      "link-failed",
      "tahcode link に失敗しました。",
      linked,
      request.token,
      fallbackCommands
    );
  }

  onProgress?.(followup.progress);
  const headline = bridgeAlreadyRunning
    ? "tahcode ブリッジの再起動に失敗しました。"
    : "tahcode start に失敗しました。";
  console.log(
    bridgeAlreadyRunning
      ? "tahcode desktop: restarting the existing bridge on the new link"
      : "tahcode desktop: starting the bridge on the new link"
  );
  const followed = await run(cliPath, [...followup.args], {
    env,
    timeoutMs: START_TIMEOUT_MS,
  });
  if (followed.code !== 0) {
    return commandFailed(
      "start-failed",
      headline,
      followed,
      request.token,
      fallbackCommands
    );
  }

  return {
    cliPath,
    installedCli,
    ok: true,
    restartedBridge: bridgeAlreadyRunning,
  };
}

/** Live pid in ~/.tahcode/bridge.json — used only to pick restart vs start + progress. */
function bridgeLooksRunning(): boolean {
  const statePath = path.join(os.homedir(), ".tahcode", "bridge.json");
  try {
    const parsed = JSON.parse(readFileSync(statePath, "utf-8")) as {
      pid?: unknown;
    };
    if (typeof parsed.pid !== "number") {
      return false;
    }
    process.kill(parsed.pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

async function ensureCli(
  env: NodeJS.ProcessEnv,
  fallbackCommands: string[],
  token: string
): Promise<
  | { cliPath: string; installedCli: boolean; ok: true }
  | RegisterLocalRuntimeResult
> {
  const existing = findOnPath(CLI_NAMES, env.PATH ?? "");
  if (existing) {
    return { cliPath: existing, installedCli: false, ok: true };
  }

  const npm = findOnPath(NPM_NAMES, env.PATH ?? "");
  if (!npm) {
    return {
      code: "cli-missing",
      fallbackCommands,
      message:
        "tahcode CLI も npm も見つかりません。Node 20 以上を入れてから、ターミナルで次のコマンドを実行してください。",
      ok: false,
    };
  }

  const prefix = userNpmPrefix();
  console.log(`tahcode desktop: installing CLI into ${prefix}`);
  const installed = await run(
    npm,
    ["install", "--global", "tahcode", "--prefix", prefix],
    { env, timeoutMs: INSTALL_TIMEOUT_MS }
  );
  const combined = `${installed.stdout}\n${installed.stderr}`;
  const nextEnv = cliEnv();
  const after = findOnPath(CLI_NAMES, nextEnv.PATH ?? "");
  if (installed.code === 0 && after) {
    return { cliPath: after, installedCli: true, ok: true };
  }

  const redacted = redactSecrets(combined, [token]);
  if (looksLikeElevationError(redacted)) {
    return {
      code: "elevation-required",
      fallbackCommands,
      message:
        "tahcode CLI のインストールに管理者権限が必要です。ターミナルで次のコマンドを実行してください。",
      ok: false,
    };
  }
  return {
    code: "cli-install-failed",
    fallbackCommands,
    message: `tahcode CLI を入れられませんでした。${firstLine(redacted) || "npm install が失敗しました。"}`,
    ok: false,
  };
}

function commandFailed(
  code: "link-failed" | "start-failed",
  headline: string,
  result: CommandResult,
  token: string,
  fallbackCommands: string[]
): RegisterLocalRuntimeResult {
  const detail = redactSecrets(
    firstLine(`${result.stderr}\n${result.stdout}`) || `exit ${result.code}`,
    [token]
  );
  return {
    code,
    fallbackCommands,
    guidance: {
      commands: ["tahcode doctor", "tahcode start"],
      detail:
        "tahcode doctor で Node / エージェント CLI / tahcode 接続の状態を確認できます。",
      title: headline,
    },
    message: `${headline} ${detail}`,
    ok: false,
  };
}

function userNpmPrefix(): string {
  return path.join(os.homedir(), ".tahcode", "npm");
}

function extraBinDirs(): string[] {
  const home = os.homedir();
  return [
    ...explicitCliOverride(),
    path.join(userNpmPrefix(), "bin"),
    userNpmPrefix(),
    "/opt/homebrew/bin",
    "/opt/homebrew/sbin",
    "/usr/local/bin",
    path.join(home, ".local", "bin"),
    path.join(home, ".volta", "bin"),
    path.join(home, ".fnm", "current", "bin"),
    path.join(home, ".asdf", "shims"),
    path.join(home, ".nodenv", "shims"),
    ...nvmBinDirs(home),
  ];
}

function explicitCliOverride(): string[] {
  const override = process.env.TAHCODE_CLI;
  if (!override) {
    return [];
  }
  return [path.dirname(path.resolve(override))];
}

function nvmBinDirs(home: string): string[] {
  const root = path.join(home, ".nvm", "versions", "node");
  try {
    return readdirSync(root)
      .sort()
      .reverse()
      .map((name) => path.join(root, name, "bin"))
      .filter((dir) => existsSync(dir));
  } catch {
    return [];
  }
}

function cliEnv(): NodeJS.ProcessEnv {
  const pathValue = mergePath(
    process.env.PATH ?? "",
    extraBinDirs(),
    path.delimiter
  );
  return {
    ...process.env,
    NO_COLOR: "1",
    PATH: pathValue,
  };
}

function findOnPath(
  names: readonly string[],
  pathValue: string
): string | null {
  const override = process.env.TAHCODE_CLI;
  const lookingForCli = names.some(
    (name) => name === "tahcode" || name === "tahcode.cmd"
  );
  if (lookingForCli && override && isExecutable(override)) {
    return path.resolve(override);
  }
  for (const dir of pathValue.split(path.delimiter)) {
    if (dir.length === 0) {
      continue;
    }
    for (const name of names) {
      const candidate = path.join(dir, name);
      if (isExecutable(candidate)) {
        return candidate;
      }
    }
  }
  return null;
}

function isExecutable(file: string): boolean {
  try {
    const stat = statSync(file);
    if (!stat.isFile() && !stat.isSymbolicLink()) {
      return false;
    }
    if (process.platform === "win32") {
      return true;
    }
    return (stat.mode & 0o111) !== 0;
  } catch {
    return false;
  }
}

interface CommandResult {
  code: number;
  stderr: string;
  stdout: string;
}

function run(
  file: string,
  args: readonly string[],
  options: { env: NodeJS.ProcessEnv; timeoutMs: number }
): Promise<CommandResult> {
  return new Promise((resolve) => {
    const child = spawn(file, [...args], {
      env: options.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const finish = (code: number) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      resolve({ code, stderr, stdout });
    };
    const timer = setTimeout(() => {
      if (stderr.length === 0) {
        stderr = `timed out after ${options.timeoutMs}ms`;
      }
      child.kill("SIGTERM");
      setTimeout(() => {
        if (!settled) {
          child.kill("SIGKILL");
        }
      }, 2_000);
    }, options.timeoutMs);
    child.stdout.on("data", (chunk: Buffer | string) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      if (stderr.length === 0) {
        stderr = error.message;
      }
      finish(127);
    });
    child.on("close", (code) => {
      finish(code ?? 1);
    });
  });
}

function firstLine(text: string): string {
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.length > 0) {
      return trimmed.slice(0, 280);
    }
  }
  return "";
}
