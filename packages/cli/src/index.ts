import os from "node:os";
import { spawn } from "node:child_process";
import { RuntimeClient } from "../../../runtime/src/convexClient.ts";
import { probeProviders } from "../../../runtime/src/providers.ts";
import { runLoop } from "../../../runtime/src/runner.ts";
import { CONFIG_PATH, maskToken, removeLink, resolveLink, writeLink, type LinkConfig } from "./config.ts";
import { MULTICA_BIN, MULTICA_DOCS, daemonAgents, daemonHealth, daemonRunning, installCommand, multicaAuthOk, multicaInstalled, multicaVersion, passthrough } from "./multica.ts";
import { BRAND, bold, code, dim, fail, heading, info, ok, warn } from "./ui.ts";

/* ─────────────────────────────────────────────────────────
 * dalecode — machine CLI
 *
 *   npm i -g dalecode
 *   dalecode link --url … --runtime … --token …   ← from the web UI
 *   dalecode start                                ← Multica daemon + bridge
 *
 * A thin wrapper around the Multica CLI/daemon: dalecode owns
 * the org/runtime link and the chat→job bridge; Multica owns
 * agent-CLI detection and machine execution.
 * ───────────────────────────────────────────────────────── */

const VERSION = "0.1.0";

type Flags = Record<string, string | boolean>;

function parseArgs(argv: string[]): { command: string; positional: string[]; flags: Flags } {
  const [command = "help", ...tail] = argv;
  const flags: Flags = {};
  const positional: string[] = [];
  for (let i = 0; i < tail.length; i += 1) {
    const arg = tail[i]!;
    if (arg === "--") {
      positional.push(...tail.slice(i + 1));
      break;
    }
    if (arg.startsWith("--")) {
      const [key, inline] = arg.slice(2).split("=", 2);
      if (inline !== undefined) flags[key!] = inline;
      else if (tail[i + 1] && !tail[i + 1]!.startsWith("--")) flags[key!] = tail[++i]!;
      else flags[key!] = true;
    } else {
      positional.push(arg);
    }
  }
  return { command, positional, flags };
}

function flagString(flags: Flags, key: string): string | undefined {
  const value = flags[key];
  return typeof value === "string" ? value : undefined;
}

function help(): void {
  console.log(`${BRAND} ${dim(`v${VERSION}`)} — このマシンを dalecode の Org につなぎ、Multica daemon でエージェントを動かす

${bold("使い方")}
  ${code("dalecode link")} --url <convex-url> --runtime <id> --token <th_…> [--name <machine>]
                        Web UI「このマシンを登録」で表示されたコマンド（~/.dalecode/config.json に保存）
  ${code("dalecode start")}      Multica daemon を起動し、dalecode のジョブブリッジをフォアグラウンドで実行
  ${code("dalecode status")}     リンク状態と Multica daemon の状態
  ${code("dalecode doctor")}     Node / Multica / エージェント CLI / dalecode 接続の診断
  ${code("dalecode providers")}  検出済みのエージェント CLI（Multica の検出 + t3code セット）
  ${code("dalecode stop")} · ${code("restart")} · ${code("logs [-f]")}   Multica daemon の停止 / 再起動 / ログ
  ${code("dalecode install-multica [--yes]")}   Multica CLI のインストールコマンドを表示（--yes で実行）
  ${code("dalecode multica <args…>")}          multica CLI にそのまま渡す（例: dalecode multica login）
  ${code("dalecode unlink")}     このマシンのリンクを削除

${bold("オプション")}
  --no-daemon         start 時に Multica daemon を起動しない（ブリッジのみ）
  --cwd <dir>         エージェントの作業ディレクトリ（既定: カレント）
  --provider <kind>   ブリッジのプロバイダを固定（codex / claudeAgent / cursor / grok / opencode）。固定中は @provider/model のモデル指定は無視

環境変数でもリンクできます: DALECODE_URL, DALECODE_RUNTIME_ID, DALECODE_TOKEN
（互換: CONVEX_URL, HARNESS_RUNTIME_ID, HARNESS_RUNTIME_TOKEN）
Multica: ${MULTICA_DOCS}`);
}

function requireLink(): LinkConfig {
  const link = resolveLink();
  if (!link) {
    fail("このマシンはまだ dalecode にリンクされていません。");
    info(`Web UI → Runtime タブ →「このマシンを登録」で表示される ${code("dalecode link …")} を実行してください。`);
    process.exit(2);
  }
  return link;
}

async function cmdLink(flags: Flags, positional: string[]): Promise<void> {
  // Accept an env-style block pasted as one argument or piped on stdin.
  let pasted = positional.join("\n");
  if (!pasted && !process.stdin.isTTY) pasted = await readStdin();
  const fromPaste = (key: string) => new RegExp(`${key}=\\"?([^\\"\\s]+)`).exec(pasted)?.[1];
  const url = flagString(flags, "url") ?? fromPaste("DALECODE_URL") ?? fromPaste("CONVEX_URL");
  const runtimeId = flagString(flags, "runtime") ?? flagString(flags, "runtime-id") ?? fromPaste("DALECODE_RUNTIME_ID") ?? fromPaste("HARNESS_RUNTIME_ID");
  const token = flagString(flags, "token") ?? fromPaste("DALECODE_TOKEN") ?? fromPaste("HARNESS_RUNTIME_TOKEN");
  if (!url || !runtimeId || !token) {
    fail("--url, --runtime, --token のすべてが必要です。");
    info(`例: ${code('dalecode link --url "https://xxx.convex.cloud" --runtime "<id>" --token "th_…" --name "office-mac"')}`);
    process.exit(2);
  }
  const link: LinkConfig = {
    url,
    runtimeId,
    token,
    name: flagString(flags, "name") ?? os.hostname(),
    org: flagString(flags, "org"),
    linkedAt: new Date().toISOString(),
  };
  heading("dalecode に接続を確認しています…");
  try {
    await new RuntimeClient(url).heartbeat({ runtimeId, token, hostname: os.hostname(), providers: [] });
    ok(`認証 OK（runtime ${runtimeId.slice(0, 8)}… / ${url}）`);
  } catch (error) {
    fail(`dalecode バックエンドに接続できません: ${error instanceof Error ? error.message : String(error)}`);
    info("URL・runtime id・トークンが Web UI の表示と一致しているか確認してください（トークンは一度だけ表示されます）。");
    process.exit(1);
  }
  writeLink(link);
  ok(`保存しました: ${CONFIG_PATH}`);
  console.log();
  info(`次: ${code("dalecode start")}（Multica CLI が未インストールなら ${code("dalecode install-multica")}）`);
}

function readStdin(): Promise<string> {
  return new Promise((resolve) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => (data += chunk));
    process.stdin.on("end", () => resolve(data));
    setTimeout(() => resolve(data), 300);
  });
}

async function ensureDaemon(link: LinkConfig, flags: Flags): Promise<void> {
  if (flags["no-daemon"]) {
    info("--no-daemon: Multica daemon は起動しません（ブリッジのみ）");
    return;
  }
  if (!multicaInstalled()) {
    warn(`Multica CLI が見つかりません（${MULTICA_BIN}）。ブリッジは t3code セットの CLI 検出で動作します。`);
    info(`インストール: ${code(installCommand())}  または ${code("dalecode install-multica --yes")}`);
    return;
  }
  const before = daemonHealth();
  if (daemonRunning(before)) {
    ok(`Multica daemon: 起動中${before?.pid ? `（pid ${before.pid}）` : ""} · agents: ${daemonAgents(before).join(", ") || "未検出"}`);
    return;
  }
  const auth = multicaAuthOk();
  if (!auth.ok) {
    warn("Multica にログインしていません。daemon はワークスペースなしで起動します（dalecode のジョブは影響なし）。");
    info(`Multica アカウントも使う場合: ${code("dalecode multica login")}`);
  }
  info("Multica daemon を起動します…");
  const codeExit = await passthrough(["daemon", "start", "--device-name", link.name ?? os.hostname()]);
  const after = daemonHealth();
  if (daemonRunning(after)) ok(`Multica daemon: 起動しました · agents: ${daemonAgents(after).join(", ") || "未検出"}`);
  else warn(`Multica daemon を確認できませんでした（exit ${codeExit}）。${code("dalecode logs")} で確認できます。`);
}

async function cmdStart(flags: Flags): Promise<void> {
  const link = requireLink();
  console.log(`${BRAND} ${dim(`v${VERSION}`)} — ${link.name ?? os.hostname()} を ${link.url} に接続`);
  await ensureDaemon(link, flags);
  heading("dalecode ブリッジ（Ctrl+C で停止）");
  const cwd = flagString(flags, "cwd") ?? process.env.DALECODE_CWD ?? process.env.HARNESS_CWD ?? process.cwd();
  const preferred = flagString(flags, "provider") as Parameters<typeof runLoop>[0]["preferredKind"];
  await runLoop({ convexUrl: link.url, runtimeId: link.runtimeId, token: link.token, cwd, preferredKind: preferred });
}

async function cmdStatus(): Promise<void> {
  const link = resolveLink();
  heading("dalecode");
  if (link) {
    ok(`リンク済み: ${link.name ?? os.hostname()} → ${link.url}`);
    info(`runtime ${link.runtimeId} · token ${maskToken(link.token)} · ${link.linkedAt === "env" ? "環境変数から" : CONFIG_PATH}`);
  } else {
    fail("未リンク（dalecode link …）");
  }
  heading("Multica");
  const version = multicaVersion();
  if (!version) {
    fail(`Multica CLI が見つかりません → ${code(installCommand())}`);
    return;
  }
  ok(version);
  await passthrough(["daemon", "status"]);
}

async function cmdDoctor(): Promise<void> {
  heading("環境");
  const major = Number(process.versions.node.split(".")[0]);
  (major >= 20 ? ok : fail)(`Node ${process.versions.node}${major >= 20 ? "" : "（20 以上が必要）"}`);

  heading("Multica");
  const version = multicaVersion();
  if (version) {
    ok(version);
    const auth = multicaAuthOk();
    (auth.ok ? ok : warn)(auth.ok ? `ログイン済み: ${auth.detail}` : `未ログイン（${code("dalecode multica login")} — Multica ワークスペースも使う場合のみ）`);
    const health = daemonHealth();
    if (daemonRunning(health)) ok(`daemon 起動中${health?.pid ? `（pid ${health.pid}）` : ""} · agents: ${daemonAgents(health).join(", ") || "未検出"}`);
    else warn(`daemon 停止中（${code("dalecode start")} で起動）`);
  } else {
    fail(`Multica CLI が見つかりません → ${code(installCommand())}`);
  }

  heading("エージェント CLI（t3code セット）");
  const probes = await probeProviders();
  for (const probe of probes) {
    (probe.available ? ok : info)(`${probe.displayName}: ${probe.available ? `${probe.binary} ${probe.version ?? ""}`.trim() : "未検出"}`);
  }
  if (!probes.some((probe) => probe.available)) warn("codex / claude / agent(cursor) / grok / opencode のいずれかにログインしてください。");

  heading("dalecode");
  const link = resolveLink();
  if (!link) {
    fail("未リンク。Web UI「このマシンを登録」のコマンドを実行してください。");
    return;
  }
  try {
    await new RuntimeClient(link.url).heartbeat({
      runtimeId: link.runtimeId,
      token: link.token,
      hostname: os.hostname(),
      providers: probes.map((probe) => ({ driverKind: probe.kind, available: probe.available, version: probe.version ?? undefined, binaryPath: probe.binary ?? undefined })),
    });
    ok(`接続 OK: ${link.name ?? os.hostname()} → ${link.url}`);
  } catch (error) {
    fail(`接続に失敗: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function cmdProviders(): Promise<void> {
  heading("Multica daemon が検出したエージェント");
  const health = daemonHealth();
  const agents = daemonAgents(health);
  if (agents.length > 0) agents.forEach((agent) => ok(agent));
  else info(multicaInstalled() ? "なし（daemon が停止中か、CLI が未検出）" : "Multica CLI 未インストール");
  heading("t3code プロバイダセット（dalecode ブリッジが直接起動できるもの）");
  for (const probe of await probeProviders()) {
    (probe.available ? ok : info)(`${probe.displayName} (${probe.kind}): ${probe.available ? `${probe.binary} ${probe.version ?? ""}`.trim() : "未検出"} — ${probe.headlessSummary}`);
  }
}

async function cmdInstallMultica(flags: Flags): Promise<void> {
  if (multicaInstalled()) {
    ok(`インストール済み: ${multicaVersion()}`);
    return;
  }
  const command = installCommand();
  if (!flags.yes) {
    heading("Multica CLI のインストール");
    info(`次を実行してください: ${code(command)}`);
    info(`自動で実行するには: ${code("dalecode install-multica --yes")}`);
    return;
  }
  heading(`実行: ${command}`);
  const shell = process.platform === "win32" ? "powershell" : "bash";
  const args = process.platform === "win32" ? ["-Command", command] : ["-lc", command];
  const exit = await new Promise<number>((resolve) => {
    const child = spawn(shell, args, { stdio: "inherit" });
    child.on("exit", (code) => resolve(code ?? 1));
    child.on("error", () => resolve(1));
  });
  if (exit === 0 && multicaInstalled()) ok(`インストールしました: ${multicaVersion()}`);
  else fail(`インストールに失敗しました（exit ${exit}）。${MULTICA_DOCS} を参照してください。`);
}

async function main(): Promise<void> {
  if (process.argv[2] === "multica") {
    process.exit(await passthrough(process.argv.slice(3)));
  }
  const { command, positional, flags } = parseArgs(process.argv.slice(2));
  if (flags.version || command === "version" || command === "--version") {
    console.log(`dalecode v${VERSION}`);
    return;
  }
  if (flags.help && command !== "multica") {
    help();
    return;
  }
  switch (command) {
    case "help":
    case "--help":
      help();
      return;
    case "link":
    case "login":
      await cmdLink(flags, positional);
      return;
    case "unlink":
    case "logout": {
      const removed = removeLink();
      (removed ? ok : info)(removed ? `削除しました: ${CONFIG_PATH}` : "リンクはありません");
      return;
    }
    case "start":
    case "run":
      await cmdStart(flags);
      return;
    case "status":
      await cmdStatus();
      return;
    case "doctor":
      await cmdDoctor();
      return;
    case "providers":
      await cmdProviders();
      return;
    case "stop":
      process.exit(await passthrough(["daemon", "stop", ...positional]));
      break;
    case "restart":
      process.exit(await passthrough(["daemon", "restart", ...positional]));
      break;
    case "logs":
      process.exit(await passthrough(["daemon", "logs", ...positional, ...(flags.follow ? ["-f"] : []), ...(flagString(flags, "n") ? ["-n", flagString(flags, "n")!] : [])]));
      break;
    case "install-multica":
      await cmdInstallMultica(flags);
      return;
    case "multica":
      // raw passthrough — argv after "multica" goes to the Multica CLI untouched
      process.exit(await passthrough(process.argv.slice(3)));
      break;
    default:
      fail(`不明なコマンド: ${command}`);
      help();
      process.exit(2);
  }
}

main().catch((error) => {
  fail(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
