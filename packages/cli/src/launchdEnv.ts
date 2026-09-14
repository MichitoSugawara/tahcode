import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";

import { CONFIG_DIR } from "./config.ts";

/**
 * Durable secret store for the macOS launchd bridge (and `tahcode start`).
 * Lives under ~/.tahcode (0700). Never log values — only key names / present|missing.
 */
export const BRIDGE_ENV_PATH = path.join(CONFIG_DIR, "bridge.env");

/** Keys launchd always owns; not copied into bridge.env. */
export const LAUNCHD_MANAGED_KEYS = new Set([
  "HOME",
  "LANG",
  "LC_ALL",
  "LOGNAME",
  "PATH",
  "SHELL",
  "TAHCODE_BRIDGE_MODE",
  "TMPDIR",
  "USER",
]);

/** Copied from the installing shell when set (auth + runtime). */
export const LAUNCHD_PASSTHROUGH_KEYS = [
  "ANTHROPIC_API_KEY",
  "ANTHROPIC_AUTH_TOKEN",
  "CLAUDE_CODE_OAUTH_TOKEN",
  "CLAUDE_CONFIG_DIR",
  "CURSOR_API_KEY",
  "CURSOR_AUTH_TOKEN",
  "MULTICA_BIN",
  "TAHCODE_HOME",
] as const;

export type SecretPresence = "present" | "missing";

export interface LaunchdEnvSources {
  existingPlistEnv?: Record<string, string>;
  fileEnv?: Record<string, string>;
  processEnv?: NodeJS.ProcessEnv;
  execPath?: string;
  home?: string;
  user?: string;
  shell?: string;
}

export interface LaunchdDoctorFinding {
  level: "ok" | "warn" | "info";
  /** Japanese operator copy. Never includes secret values. */
  message: string;
}

export function parseDotEnv(text: string): Record<string, string> {
  const parsed: Record<string, string> = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const trimmed = rawLine.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const line = trimmed.startsWith("export ")
      ? trimmed.slice("export ".length).trim()
      : trimmed;
    const eq = line.indexOf("=");
    if (eq <= 0) {
      continue;
    }
    const key = line.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
      continue;
    }
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
      (value.startsWith("'") && value.endsWith("'") && value.length >= 2)
    ) {
      value = value.slice(1, -1);
    }
    if (value) {
      parsed[key] = value;
    }
  }
  return parsed;
}

export function unescapePlistXml(text: string): string {
  return text
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&amp;", "&");
}

/**
 * Pull EnvironmentVariables from a launchd plist. Only string entries.
 * Does not log. Invalid / missing dict → {}.
 */
export function parsePlistEnvironmentVariables(
  plistXml: string
): Record<string, string> {
  const block =
    /<key>EnvironmentVariables<\/key>\s*<dict>([\s\S]*?)<\/dict>/i.exec(
      plistXml
    );
  if (!block?.[1]) {
    return {};
  }
  const env: Record<string, string> = {};
  const pair = /<key>([^<]+)<\/key>\s*<string>([\s\S]*?)<\/string>/gi;
  for (const match of block[1].matchAll(pair)) {
    const key = unescapePlistXml(match[1] ?? "").trim();
    const value = unescapePlistXml(match[2] ?? "");
    if (key && value) {
      env[key] = value;
    }
  }
  return env;
}

export function readPlistEnvironmentVariables(
  plistPath: string
): Record<string, string> {
  try {
    if (!existsSync(plistPath)) {
      return {};
    }
    return parsePlistEnvironmentVariables(readFileSync(plistPath, "utf-8"));
  } catch {
    return {};
  }
}

export function readBridgeEnvFile(
  filePath = BRIDGE_ENV_PATH
): Record<string, string> {
  try {
    if (!existsSync(filePath)) {
      return {};
    }
    return parseDotEnv(readFileSync(filePath, "utf-8"));
  } catch {
    return {};
  }
}

function formatDotEnvValue(value: string): string {
  if (/[\s#"']/.test(value)) {
    return `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
  }
  return value;
}

/** Merge durable secrets into ~/.tahcode/bridge.env (0600). Values are never logged. */
export function persistBridgeEnvSecrets(
  env: Record<string, string>,
  filePath = BRIDGE_ENV_PATH
): void {
  const next = { ...readBridgeEnvFile(filePath) };
  for (const [key, value] of Object.entries(env)) {
    if (!value || LAUNCHD_MANAGED_KEYS.has(key)) {
      continue;
    }
    next[key] = value;
  }
  const keys = Object.keys(next).sort((a, b) => a.localeCompare(b));
  if (keys.length === 0) {
    return;
  }
  mkdirSync(path.dirname(filePath), { mode: 0o700, recursive: true });
  const body = [
    "# tahcode ブリッジ用の環境変数（権限 0600）。",
    "# tahcode start / service install が読みます。値をログや doctor に出さないでください。",
    "# Git に含めないでください。",
    "",
    ...keys.map((key) => `${key}=${formatDotEnvValue(next[key]!)}`),
    "",
  ].join("\n");
  writeFileSync(filePath, body, { mode: 0o600 });
  chmodSync(filePath, 0o600);
}

/**
 * Fill missing process.env keys from bridge.env. Does not overwrite.
 * Returns the key names that were applied (never values).
 */
export function applyBridgeEnvToProcess(
  processEnv: NodeJS.ProcessEnv = process.env,
  fileEnv: Record<string, string> = readBridgeEnvFile()
): string[] {
  const applied: string[] = [];
  for (const [key, value] of Object.entries(fileEnv)) {
    if (!value || processEnv[key]) {
      continue;
    }
    processEnv[key] = value;
    applied.push(key);
  }
  return applied;
}

export function buildLaunchdPath(input: {
  execPath: string;
  processPath?: string;
  existingPath?: string;
}): string {
  const nodeDir = path.dirname(input.execPath);
  const entries = [
    nodeDir,
    ...(input.processPath ?? "").split(path.delimiter),
    ...(input.existingPath ?? "").split(path.delimiter),
    "/opt/homebrew/bin",
    "/usr/local/bin",
    "/usr/bin",
    "/bin",
  ];
  return entries
    .filter((entry, index, all) => entry && all.indexOf(entry) === index)
    .join(path.delimiter);
}

export function launchdPathHasNode(
  pathValue: string,
  execPath: string,
  exists: (candidate: string) => boolean = existsSync
): boolean {
  const nodeDir = path.dirname(execPath);
  const dirs = pathValue.split(path.delimiter).filter(Boolean);
  if (dirs.includes(nodeDir)) {
    return true;
  }
  const binary = process.platform === "win32" ? "node.exe" : "node";
  return dirs.some((dir) => exists(path.join(dir, binary)));
}

export function secretPresence(
  env: Record<string, string>,
  key: string
): SecretPresence {
  const value = env[key];
  return value && value.length > 0 ? "present" : "missing";
}

function overlayDefined(
  target: Record<string, string>,
  source: Record<string, string | undefined>
): void {
  for (const [key, value] of Object.entries(source)) {
    if (value) {
      target[key] = value;
    }
  }
}

/**
 * Merge order (later wins when the value is non-empty):
 * bridge.env → existing plist → process.env (passthrough + keys already known).
 * PATH / HOME / TAHCODE_BRIDGE_MODE are always rebuilt.
 */
export function collectLaunchdEnvironment(
  sources: LaunchdEnvSources
): Record<string, string> {
  const processEnv = sources.processEnv ?? {};
  const execPath = sources.execPath ?? process.execPath;
  const home = sources.home ?? os.homedir();
  const env: Record<string, string> = {};

  overlayDefined(env, sources.fileEnv ?? {});
  overlayDefined(env, sources.existingPlistEnv ?? {});

  const passthrough: Record<string, string | undefined> = {};
  for (const key of LAUNCHD_PASSTHROUGH_KEYS) {
    passthrough[key] = processEnv[key];
  }
  for (const key of Object.keys(env)) {
    if (!LAUNCHD_MANAGED_KEYS.has(key)) {
      passthrough[key] = processEnv[key] ?? passthrough[key];
    }
  }
  overlayDefined(env, passthrough);

  let user = sources.user;
  if (!user) {
    try {
      user = os.userInfo().username;
    } catch {
      user = processEnv.USER ?? processEnv.LOGNAME;
    }
  }
  const shell = sources.shell ?? processEnv.SHELL;

  env.HOME = home;
  env.TAHCODE_BRIDGE_MODE = "launchd";
  env.PATH = buildLaunchdPath({
    execPath,
    existingPath: env.PATH,
    processPath: processEnv.PATH,
  });
  if (user) {
    env.USER = user;
    env.LOGNAME = user;
  }
  if (shell) {
    env.SHELL = shell;
  }
  if (processEnv.LANG) {
    env.LANG = processEnv.LANG;
  }
  if (processEnv.LC_ALL) {
    env.LC_ALL = processEnv.LC_ALL;
  }
  if (processEnv.TMPDIR) {
    env.TMPDIR = processEnv.TMPDIR;
  }

  return env;
}

export function resolveLaunchdEnvironment(
  sources: LaunchdEnvSources = {},
  paths: { plistPath?: string; envPath?: string } = {}
): Record<string, string> {
  return collectLaunchdEnvironment({
    execPath: sources.execPath ?? process.execPath,
    existingPlistEnv:
      sources.existingPlistEnv ??
      (paths.plistPath
        ? readPlistEnvironmentVariables(paths.plistPath)
        : undefined),
    fileEnv: sources.fileEnv ?? readBridgeEnvFile(paths.envPath),
    home: sources.home,
    processEnv: sources.processEnv ?? process.env,
    shell: sources.shell,
    user: sources.user,
  });
}

export function launchdDoctorFindings(input: {
  supported: boolean;
  installed: boolean;
  plistEnv: Record<string, string>;
  fileEnv: Record<string, string>;
  cursorAvailable: boolean;
  execPath: string;
  nodeExists?: (candidate: string) => boolean;
}): LaunchdDoctorFinding[] {
  if (!input.supported) {
    return [];
  }
  if (!input.installed) {
    return [
      {
        level: "info",
        message:
          "未登録（ログイン時に自動起動するには tahcode service install）",
      },
    ];
  }

  const findings: LaunchdDoctorFinding[] = [
    { level: "ok", message: "登録済み（com.tahcode.bridge）" },
  ];

  if (input.cursorAvailable) {
    const inPlist = secretPresence(input.plistEnv, "CURSOR_API_KEY");
    const inFile = secretPresence(input.fileEnv, "CURSOR_API_KEY");
    if (inPlist === "present") {
      findings.push({ level: "ok", message: "CURSOR_API_KEY: 設定済み" });
    } else if (inFile === "present") {
      findings.push({
        level: "warn",
        message:
          "CURSOR_API_KEY: launchd には未設定（~/.tahcode/bridge.env にはあります。tahcode service install で反映）",
      });
    } else {
      findings.push({
        level: "warn",
        message:
          "CURSOR_API_KEY: 未設定。~/.tahcode/bridge.env に書くか、シェルで export してから tahcode service install を実行してください",
      });
    }
  }

  const pathValue = input.plistEnv.PATH ?? "";
  if (launchdPathHasNode(pathValue, input.execPath, input.nodeExists)) {
    findings.push({ level: "ok", message: "PATH: node を含みます" });
  } else {
    findings.push({
      level: "warn",
      message:
        "PATH: node がありません。tahcode service install で現在の node を引き継ぎます",
    });
  }

  return findings;
}

/** Presence labels only — safe to print. */
export function launchdAuthSummary(env: Record<string, string>): {
  cursorApiKey: SecretPresence;
  claudeOAuth: SecretPresence;
  anthropicApiKey: SecretPresence;
} {
  return {
    anthropicApiKey: secretPresence(env, "ANTHROPIC_API_KEY"),
    claudeOAuth: secretPresence(env, "CLAUDE_CODE_OAUTH_TOKEN"),
    cursorApiKey: secretPresence(env, "CURSOR_API_KEY"),
  };
}
