import os from "node:os";
import path from "node:path";

import {
  runAgentToolCli,
  runAgentToolMcp,
} from "../../../runtime/src/agentToolsHost.ts";
import { RuntimeClient } from "../../../runtime/src/convexClient.ts";
import {
  discoverModels,
  plannedUpdate,
  runUpdate,
} from "../../../runtime/src/maintenance.ts";
import {
  probeProviders,
  probeVersion,
} from "../../../runtime/src/providers.ts";
import type { ProviderProbe } from "../../../runtime/src/providers.ts";
import {
  BRIDGE_CAPABILITIES,
  reportFor,
  runLoop,
} from "../../../runtime/src/runner.ts";
import { CLI_VERSION as VERSION } from "../../../shared/cliVersion.ts";
import {
  mergeModelCatalog,
  PROVIDER_MAINTENANCE,
  supportsLiveModels,
  updateCommandLabel,
} from "../../../shared/providerMaintenance.ts";
import type { ProviderDriverKind } from "../../../shared/providers.ts";
import {
  isProviderDriverKind,
  PROVIDER_CATALOG,
} from "../../../shared/providers.ts";
import {
  reportDoctorAgentTools,
  warnStaleAgentToolsOnStart,
} from "./agentToolsCheck.ts";
import {
  BRIDGE_ENV_PATH,
  BRIDGE_LOG_PATH,
  LAUNCHD_LABEL,
  LAUNCHD_PLIST_PATH,
  followLog,
  launchdEnvironment,
  launchdInstall,
  launchdInstalled,
  launchdLoad,
  launchdRestart,
  launchdStatus,
  launchdSupported,
  launchdUninstall,
  launchdUnload,
  registerBridgeProcess,
  runningBridge,
  spawnDetachedBridge,
  stopBridgeProcess,
  tailLog,
  uptime,
} from "./bridge.ts";
import type { BridgeLaunchOptions, BridgeMode, BridgeState } from "./bridge.ts";
import {
  CONFIG_PATH,
  LEGACY_CONFIG_PATH,
  maskToken,
  removeLink,
  resolveLink,
  usingLegacyLink,
  writeLink,
} from "./config.ts";
import type { LinkConfig } from "./config.ts";
import {
  applyBridgeEnvToProcess,
  launchdAuthSummary,
  launchdDoctorFindings,
  readBridgeEnvFile,
  readPlistEnvironmentVariables,
} from "./launchdEnv.ts";
import { BRAND, bold, code, dim, fail, heading, info, ok, warn } from "./ui.ts";

/* ─────────────────────────────────────────────────────────
 * tahcode — machine CLI
 *
 *   npm i -g tahcode
 *   tahcode link --url … --runtime … --token …   ← from the web UI
 *   tahcode start                                ← tahcode bridge (background)
 *   tahcode start --foreground                   ← bridge in this terminal
 *
 * Default start is the tahcode bridge (`runtime/` → local provider CLIs).
 * There is no Multica runtime path.
 *
 * tahcode (ターコード, "team agent harness") is the renamed successor of the
 * `dalecode` npm package (last release 0.1.1). tahcode started at 0.1.0;
 * 0.1.1 adds `tahcode tool` / `tool-mcp` and leaseId on job events.
 * 0.1.2 adds Cursor headless `--force` so `tahcode tool` is not rejected.
 * 0.1.3 adds workbench pty / preview capabilities on the bridge.
 * 0.1.4 adds workbench screen frames on the bridge.
 * 0.1.5 adds keyboard / mouse input on the remote screen.
 * 0.1.5 adds keyboard / mouse input on the remote screen.
 * 0.1.5 adds keyboard / mouse input on the remote screen.
 * ───────────────────────────────────────────────────────── */

type Flags = Record<string, string | boolean>;

function parseArgs(argv: string[]): {
  command: string;
  positional: string[];
  flags: Flags;
} {
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
      if (inline !== undefined) {
        flags[key!] = inline;
      } else if (tail[i + 1] && !tail[i + 1]!.startsWith("-")) {
        flags[key!] = tail[++i]!;
      } else {
        flags[key!] = true;
      }
    } else if (/^-[a-zA-Z]$/.test(arg)) {
      // short flags: -f (boolean), -n <N> (value)
      const key = arg.slice(1);
      if (key === "n" && tail[i + 1] && !tail[i + 1]!.startsWith("-")) {
        flags[key] = tail[++i]!;
      } else {
        flags[key] = true;
      }
    } else {
      positional.push(arg);
    }
  }
  return { command, flags, positional };
}

function flagString(flags: Flags, key: string): string | undefined {
  const value = flags[key];
  return typeof value === "string" ? value : undefined;
}

function help(): void {
  console.log(`${BRAND} ${dim(`v${VERSION}`)} — このマシンを tahcode の Org につなぎ、tahcode ブリッジでエージェント CLI を動かす

${bold("使い方")}
  ${code("tahcode link")} --url <convex-url> --runtime <id> --token <th_…> [--name <machine>] [--no-restart]
                        Web UI「このマシンを登録」で表示されたコマンド（~/.tahcode/config.json に保存）。
                        起動中のブリッジがあれば新しい接続先で再起動します（${code("--no-restart")} でスキップ）
  ${code("tahcode start")}      tahcode のジョブブリッジをバックグラウンドで常駐させる
                        （${code("--foreground")} でこのターミナルで実行、Ctrl+C で停止）
  ${code("tahcode status")}     リンク状態・tahcode ブリッジの状態
  ${code("tahcode stop")}       ブリッジを停止
  ${code("tahcode restart")}    ブリッジを再起動
  ${code("tahcode logs")} [-f] [-n N]   ログ（${dim("~/.tahcode/bridge.log")}）
  ${code("tahcode service install|uninstall|status")}   macOS: launchd ユーザーエージェントとして登録（ログイン時に自動起動）
  ${code("tahcode doctor")}     Node / エージェント CLI / tahcode 接続の診断
  ${code("tahcode providers")}  検出済みのエージェント CLI（t3code セット）
  ${code("tahcode models [provider]")}   各 CLI が使えるモデル（agent models / opencode models / grok models をその場で実行。ない CLI は静的カタログ）
  ${code("tahcode update <provider|all> [--yes]")}   エージェント CLI を更新（Web UI の「CLI を更新」と同じ許可リストのコマンドだけ実行）
  ${code("tahcode unlink")}     このマシンのリンクを削除
  ${code("tahcode tool [name] [--args JSON]")}  実行中ジョブから Org / プロジェクト / チャット / ランタイム / プラグイン / Linear 課題を操作する（引数なしで一覧）
  ${code("tahcode tool-mcp")}   ハーネスが stdio で同じツールを呼ぶためのホスト（ジョブ中）

${bold("オプション")}
  --foreground        start: ブリッジをバックグラウンドにせず、このターミナルで実行（旧来の動作）
  --detach            start: バックグラウンドで実行（既定。明示したいとき用）
  --no-restart        link: 起動中のブリッジを再起動しない（デスクトップが一発登録後に自分で再起動する）
  --cwd <dir>         エージェントの作業ディレクトリ（既定: カレント）
  --provider <kind>   ブリッジのプロバイダを固定（codex / claudeAgent / cursor / grok / opencode）。固定中は @provider/model のモデル指定は無視

ファイル: ~/.tahcode/config.json（リンク）· bridge.json（ブリッジの pid）· bridge.log（ログ）· bridge.env（CURSOR_API_KEY など。service install は消さない）
環境変数でもリンクできます: TAHCODE_URL, TAHCODE_RUNTIME_ID, TAHCODE_TOKEN
（互換: DALECODE_*, CONVEX_URL, HARNESS_RUNTIME_ID, HARNESS_RUNTIME_TOKEN。旧 dalecode CLI の ~/.dalecode/config.json も読みます）`);
}

function requireLink(): LinkConfig {
  const link = resolveLink();
  if (!link) {
    fail("このマシンはまだ tahcode にリンクされていません。");
    info(
      `Web UI → Runtime タブ →「このマシンを登録」で表示される ${code("tahcode link …")} を実行してください。`
    );
    process.exit(2);
  }
  return link;
}

async function cmdLink(flags: Flags, positional: string[]): Promise<void> {
  // Accept an env-style block pasted as one argument or piped on stdin.
  let pasted = positional.join("\n");
  if (!pasted && !process.stdin.isTTY) {
    pasted = await readStdin();
  }
  const fromPaste = (key: string) =>
    new RegExp(`${key}=\\"?([^\\"\\s]+)`).exec(pasted)?.[1];
  const url =
    flagString(flags, "url") ??
    fromPaste("TAHCODE_URL") ??
    fromPaste("DALECODE_URL") ??
    fromPaste("CONVEX_URL");
  const runtimeId =
    flagString(flags, "runtime") ??
    flagString(flags, "runtime-id") ??
    fromPaste("TAHCODE_RUNTIME_ID") ??
    fromPaste("DALECODE_RUNTIME_ID") ??
    fromPaste("HARNESS_RUNTIME_ID");
  const token =
    flagString(flags, "token") ??
    fromPaste("TAHCODE_TOKEN") ??
    fromPaste("DALECODE_TOKEN") ??
    fromPaste("HARNESS_RUNTIME_TOKEN");
  if (!url || !runtimeId || !token) {
    fail("--url, --runtime, --token のすべてが必要です。");
    info(
      `例: ${code('tahcode link --url "https://xxx.convex.cloud" --runtime "<id>" --token "th_…" --name "office-mac"')}`
    );
    process.exit(2);
  }
  const link: LinkConfig = {
    linkedAt: new Date().toISOString(),
    name: flagString(flags, "name") ?? os.hostname(),
    org: flagString(flags, "org"),
    runtimeId,
    token,
    url,
  };
  heading("tahcode に接続を確認しています…");
  try {
    await new RuntimeClient(url).heartbeat({
      hostname: os.hostname(),
      providers: [],
      runtimeId,
      token,
    });
    ok(`認証 OK（runtime ${runtimeId.slice(0, 8)}… / ${url}）`);
  } catch (error) {
    fail(
      `tahcode バックエンドに接続できません: ${error instanceof Error ? error.message : String(error)}`
    );
    info(
      "URL・runtime id・トークンが Web UI の表示と一致しているか確認してください（トークンは一度だけ表示されます）。"
    );
    process.exit(1);
  }
  writeLink(link);
  ok(`保存しました: ${CONFIG_PATH}`);
  if (!flags["no-restart"] && bridgeShouldRelink()) {
    heading("既存のブリッジを新しい接続先で再起動します…");
    const restarted = await restartBridgeFromCli(flags);
    if (restarted) {
      ok("既存のブリッジを新しい接続先で再起動しました");
    } else {
      warn(
        `リンクは保存しましたが、ブリッジの再起動に失敗しました。${code("tahcode restart bridge")} を実行してください。`
      );
    }
    return;
  }
  console.log();
  info(`次: ${code("tahcode start")}（tahcode ブリッジを起動）`);
}

function readStdin(): Promise<string> {
  return new Promise((resolve) => {
    let data = "";
    process.stdin.setEncoding("utf-8");
    process.stdin.on("data", (chunk) => (data += chunk));
    process.stdin.on("end", () => resolve(data));
    setTimeout(() => resolve(data), 300);
  });
}

function rejectRemovedMulticaSurface(
  command: string,
  flags: Flags,
  positional: string[]
): void {
  if (flags.daemon) {
    fail(
      "Multica は tahcode のランタイムではありません。`--daemon` は削除されました。`tahcode start` でブリッジを起動してください。"
    );
    process.exit(2);
  }
  if (command === "install-multica" || command === "multica") {
    fail(
      "Multica コマンドは削除されました。エージェントは `tahcode start` のブリッジ経由で動きます。"
    );
    process.exit(2);
  }
  const target = positional[0];
  const usesTarget =
    command === "stop" || command === "restart" || command === "logs";
  if (
    usesTarget &&
    target !== undefined &&
    target !== "bridge" &&
    !target.startsWith("-")
  ) {
    fail(
      target === "multica" || target === "all" || target === "daemon"
        ? "Multica は tahcode のランタイムではありません。対象はブリッジのみです。"
        : `不明な対象: ${target}（tahcode stop / restart / logs はブリッジのみ）`
    );
    process.exit(2);
  }
}

function bridgeOptions(flags: Flags): BridgeLaunchOptions {
  return {
    cwd: path.resolve(
      flagString(flags, "cwd") ??
        process.env.TAHCODE_CWD ??
        process.env.HARNESS_CWD ??
        process.cwd()
    ),
    provider: flagString(flags, "provider"),
  };
}

function describeBridge(state: BridgeState): string {
  const mode = {
    detached: "バックグラウンド",
    foreground: "フォアグラウンド",
    launchd: "launchd",
  }[state.mode];
  const up = uptime(state.startedAt);
  return `pid ${state.pid} · ${mode}${up ? ` · ${up}` : ""} · cwd ${state.cwd}${state.provider ? ` · provider ${state.provider}` : ""}`;
}

/** Wait for the bridge process to register itself in ~/.tahcode/bridge.json. */
async function waitForBridge(timeoutMs = 5000): Promise<BridgeState | null> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const state = runningBridge();
    if (state) {
      return state;
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  return null;
}

async function cmdStart(flags: Flags): Promise<void> {
  const link = requireLink();
  const options = bridgeOptions(flags);
  const foreground = !!flags.foreground || !!flags.fg;

  const running = runningBridge();
  if (running) {
    ok(`tahcode ブリッジは既に起動中です（${describeBridge(running)}）`);
    info(
      `ログ: ${code("tahcode logs -f")} · 停止: ${code("tahcode stop")} · 再起動: ${code("tahcode restart")}`
    );
    return;
  }

  console.log(
    `${BRAND} ${dim(`v${VERSION}`)} — ${link.name ?? os.hostname()} を ${link.url} に接続`
  );
  warnStaleAgentToolsOnStart();

  if (foreground) {
    const envMode = process.env.TAHCODE_BRIDGE_MODE;
    const mode: BridgeMode =
      envMode === "detached" || envMode === "launchd" ? envMode : "foreground";
    registerBridgeProcess(options, mode);
    heading(
      mode === "foreground"
        ? "tahcode ブリッジ（Ctrl+C で停止）"
        : `tahcode ブリッジ（${mode} · pid ${process.pid}）`
    );
    const preferred = options.provider as Parameters<
      typeof runLoop
    >[0]["preferredKind"];
    await runLoop({
      bridgeVersion: VERSION,
      convexUrl: link.url,
      cwd: options.cwd,
      preferredKind: preferred,
      runtimeId: link.runtimeId,
      token: link.token,
    });
    return;
  }

  // macOS: a registered launchd agent is resumed (or left alone while it restarts) instead of double-starting.
  if (launchdInstalled()) {
    if (launchdStatus().loaded) {
      warn(
        `launchd（${LAUNCHD_LABEL}）がブリッジを管理中です。起動待ちの可能性があります — ${code("tahcode restart")} で即時再起動できます。`
      );
      return;
    }
    heading("launchd エージェントを再開します…");
    const loaded = launchdLoad();
    if (loaded.ok) {
      const state = await waitForBridge();
      if (state) {
        ok(`tahcode ブリッジ: 起動しました（${describeBridge(state)}）`);
      } else {
        warn(
          `launchd に読み込みましたが、ブリッジの起動を確認できません。${code("tahcode logs")} を確認してください。`
        );
      }
      return;
    }
    warn(
      `launchd の読み込みに失敗（${loaded.detail}）。通常のバックグラウンド起動に切り替えます。`
    );
  }

  heading("tahcode ブリッジをバックグラウンドで起動します…");
  const state = await spawnDetachedBridge(options);
  ok(`tahcode ブリッジ: 起動しました（${describeBridge(state)}）`);
  info(`ログ: ${BRIDGE_LOG_PATH}`);
  info(
    `状態: ${code("tahcode status")} · ログ: ${code("tahcode logs -f")} · 停止: ${code("tahcode stop")}`
  );
  if (launchdSupported() && !launchdInstalled()) {
    info(`ログイン時に自動起動するには: ${code("tahcode service install")}`);
  }
}

function printBridgeStatus(): BridgeState | null {
  heading("tahcode ブリッジ");
  const state = runningBridge();
  if (state) {
    ok(`起動中（${describeBridge(state)}）`);
    if (state.log) {
      info(`ログ: ${state.log}`);
    }
  } else {
    fail(`停止中（${code("tahcode start")} で起動）`);
  }
  if (launchdSupported()) {
    if (launchdInstalled()) {
      const status = launchdStatus();
      (status.loaded ? ok : warn)(
        `launchd: 登録済み（${LAUNCHD_LABEL} · ${status.loaded ? "読み込み済み" : `停止中 — ${code("tahcode start")} で再開`}）`
      );
    } else {
      info(
        `launchd: 未登録（${code("tahcode service install")} でログイン時に自動起動）`
      );
    }
  }
  return state;
}

async function cmdStatus(): Promise<void> {
  const link = resolveLink();
  heading("tahcode");
  if (link) {
    ok(`リンク済み: ${link.name ?? os.hostname()} → ${link.url}`);
    const legacy = link.linkedAt !== "env" && usingLegacyLink();
    info(
      `runtime ${link.runtimeId} · token ${maskToken(link.token)} · ${link.linkedAt === "env" ? "環境変数から" : legacy ? LEGACY_CONFIG_PATH : CONFIG_PATH}`
    );
    if (legacy) {
      info(
        `旧 dalecode CLI のリンクを使っています。${code("tahcode link …")} を再実行すると ${CONFIG_PATH} に移ります。`
      );
    }
  } else {
    fail("未リンク（tahcode link …）");
  }
  printBridgeStatus();
}

async function cmdDoctor(): Promise<void> {
  let toolsFailed = false;
  heading("環境");
  const major = Number(process.versions.node.split(".")[0]);
  (major >= 20 ? ok : fail)(
    `Node ${process.versions.node}${major >= 20 ? "" : "（20 以上が必要）"}`
  );
  toolsFailed = reportDoctorAgentTools();

  heading("エージェント CLI（t3code セット）");
  const probes = await probeProviders();
  for (const probe of probes) {
    (probe.available ? ok : info)(
      `${probe.displayName}: ${probe.available ? `${probe.binary} ${probe.version ?? ""}`.trim() : "未検出"}${probe.available ? dim(` · 更新: ${probe.updateCommand ?? PROVIDER_MAINTENANCE[probe.kind].manualHint}`) : ""}`
    );
  }
  if (!probes.some((probe) => probe.available)) {
    warn(
      "codex / claude / agent(cursor) / grok / opencode のいずれかにログインしてください。"
    );
  }
  reportLaunchdDoctor(
    probes.some((probe) => probe.kind === "cursor" && probe.available)
  );

  heading("tahcode");
  const link = resolveLink();
  if (!link) {
    fail("未リンク。Web UI「このマシンを登録」のコマンドを実行してください。");
    if (toolsFailed) {
      process.exitCode = 1;
    }
    return;
  }
  try {
    await new RuntimeClient(link.url).heartbeat({
      bridgeVersion: VERSION,
      capabilities: BRIDGE_CAPABILITIES,
      hostname: os.hostname(),
      providers: probes.map((probe) => reportFor(probe)),
      runtimeId: link.runtimeId,
      token: link.token,
    });
    ok(`接続 OK: ${link.name ?? os.hostname()} → ${link.url}`);
  } catch (error) {
    fail(
      `接続に失敗: ${error instanceof Error ? error.message : String(error)}`
    );
  }
  const bridge = runningBridge();
  (bridge ? ok : warn)(
    bridge
      ? `ブリッジ起動中（${describeBridge(bridge)}）`
      : `ブリッジ停止中（${code("tahcode start")} で起動）`
  );
  if (toolsFailed) {
    process.exitCode = 1;
  }
}

async function cmdProviders(): Promise<void> {
  heading("t3code プロバイダセット（tahcode ブリッジが直接起動できるもの）");
  for (const probe of await probeProviders()) {
    (probe.available ? ok : info)(
      `${probe.displayName} (${probe.kind}): ${probe.available ? `${probe.binary} ${probe.version ?? ""}`.trim() : "未検出"} — ${probe.headlessSummary}`
    );
  }
  info(
    `モデル一覧: ${code("tahcode models")} · CLI の更新: ${code("tahcode update <provider>")}`
  );
}

/** Resolve a `codex` / `claude` / `cursor` / `agent` … argument to a provider kind. */
function providerArg(raw: string | undefined): ProviderDriverKind | null {
  if (!raw) {
    return null;
  }
  const lower = raw.toLowerCase();
  if (isProviderDriverKind(raw)) {
    return raw;
  }
  const entry = PROVIDER_CATALOG.find(
    (item) =>
      item.kind.toLowerCase() === lower ||
      item.displayName.toLowerCase() === lower ||
      item.mentionHandles.includes(lower) ||
      item.binaryNames.includes(lower)
  );
  return entry?.kind ?? null;
}

async function cmdModels(positional: string[]): Promise<void> {
  const only = positional[0] ? providerArg(positional[0]) : null;
  if (positional[0] && !only) {
    fail(
      `不明なプロバイダ: ${positional[0]}（codex / claude / cursor / grok / opencode / antigravity）`
    );
    process.exit(2);
  }
  const probes = (await probeProviders()).filter(
    (probe) => !only || probe.kind === only
  );
  for (const probe of probes) {
    heading(
      `${probe.displayName}${probe.available ? dim(` · ${probe.binary} ${probe.version ?? ""}`.trimEnd()) : dim(" · 未検出")}`
    );
    if (probe.available && supportsLiveModels(probe.kind)) {
      const discovery = await discoverModels(probe.kind, probe.binary);
      const merged = mergeModelCatalog(probe.kind, discovery.models);
      (merged.source === "live" ? ok : warn)(
        merged.source === "live"
          ? `${PROVIDER_MAINTENANCE[probe.kind].modelsHint} → ${merged.models.length} 件`
          : `ライブ取得に失敗（${discovery.error ?? "不明"}）→ 静的カタログ ${merged.models.length} 件`
      );
      for (const model of merged.models) {
        info(
          `${model.slug}${model.name && model.name !== model.slug ? dim(`  ${model.name}`) : ""}${model.default ? dim("  (default)") : ""}`
        );
      }
    } else {
      const merged = mergeModelCatalog(probe.kind, null);
      info(
        `${PROVIDER_MAINTENANCE[probe.kind].modelsHint} → ${merged.models.length} 件${probe.available ? "" : "（CLI 未検出のため参考値）"}`
      );
      for (const model of merged.models) {
        info(
          `${model.slug}${model.name === model.slug ? "" : dim(`  ${model.name}`)}${model.legacy ? dim("  legacy") : ""}`
        );
      }
    }
  }
}

async function cmdUpdate(flags: Flags, positional: string[]): Promise<void> {
  const target = positional[0];
  if (!target) {
    fail(
      "更新するプロバイダを指定してください: tahcode update <codex|claude|cursor|grok|opencode|all>"
    );
    process.exit(2);
  }
  const probes = await probeProviders();
  const wanted: ProviderProbe[] = [];
  if (target === "all") {
    wanted.push(...probes.filter((probe) => probe.available));
  } else {
    const kind = providerArg(target);
    if (!kind) {
      fail(`不明なプロバイダ: ${target}`);
      process.exit(2);
    }
    const probe = probes.find((item) => item.kind === kind);
    if (!probe?.available) {
      fail(`${kind} の CLI はこのマシンで検出されていません。`);
      process.exit(1);
    }
    wanted.push(probe);
  }
  if (wanted.length === 0) {
    info("更新対象の CLI がありません。");
    return;
  }
  let exit = 0;
  for (const probe of wanted) {
    heading(`${probe.displayName} ${dim(probe.version ?? "")}`.trimEnd());
    const plan = plannedUpdate(probe.kind, probe.binary);
    if (!plan) {
      warn(
        `このインストール方法（${probe.installMethod}）向けの自動更新はありません → 手動: ${code(PROVIDER_MAINTENANCE[probe.kind].manualHint)}`
      );
      continue;
    }
    info(
      `実行するコマンド: ${code(updateCommandLabel(plan) ?? "")}${dim(` （${plan.via} · ${probe.binary}）`)}`
    );
    if (!flags.yes) {
      info(`実行するには ${code(`tahcode update ${target} --yes`)}`);
      continue;
    }
    const outcome = await runUpdate(probe.kind, probe.binary, (line) =>
      console.log(`    ${dim(line)}`)
    );
    if (!outcome.ok) {
      fail(outcome.error ?? `更新に失敗しました（exit ${outcome.exitCode}）`);
      exit = 1;
      continue;
    }
    const after = await probeVersion(probe.kind);
    ok(
      after.version && after.version !== probe.version
        ? `更新しました: ${probe.version ?? "?"} → ${after.version}`
        : `最新です: ${after.version ?? probe.version ?? ""}`.trim()
    );
  }
  process.exit(exit);
}

/** Stop the bridge however it was started. Returns true if something was stopped. */
async function stopBridge(): Promise<boolean> {
  const state = runningBridge();
  if (state?.mode === "launchd" || (!state && launchdStatus().loaded)) {
    // KeepAlive would respawn a killed process: unload the agent instead (plist stays → back on next login / `tahcode start`).
    const result = launchdUnload();
    if (!result.ok) {
      fail(`launchd から停止できません: ${result.detail}`);
      return false;
    }
    if (state) {
      await stopBridgeProcess(state);
    }
    ok(
      `tahcode ブリッジ: 停止しました（launchd · ${LAUNCHD_LABEL} を unload）`
    );
    info(
      `再開: ${code("tahcode start")} · 自動起動を解除: ${code("tahcode service uninstall")}`
    );
    return true;
  }
  if (!state) {
    info("tahcode ブリッジ: 起動していません");
    return false;
  }
  const stopped = await stopBridgeProcess(state);
  (stopped ? ok : info)(
    stopped
      ? `tahcode ブリッジ: 停止しました（pid ${state.pid}）`
      : "tahcode ブリッジ: 起動していません"
  );
  return stopped;
}

async function cmdStop(): Promise<void> {
  heading("tahcode ブリッジ");
  await stopBridge();
}

function bridgeShouldRelink(): boolean {
  return runningBridge() !== null || launchdStatus().loaded;
}

/** Restart (or start) only the tahcode bridge against the current link. */
async function restartBridgeFromCli(flags: Flags): Promise<boolean> {
  const previous = runningBridge();
  if (previous?.mode === "launchd" || (!previous && launchdStatus().loaded)) {
    const result = launchdRestart();
    if (!result.ok) {
      fail(`launchd で再起動できません: ${result.detail}`);
      return false;
    }
    const state = await waitForBridge();
    if (state) {
      ok(`再起動しました（${describeBridge(state)}）`);
    } else {
      warn(
        `再起動を要求しましたが、ブリッジの起動を確認できません。${code("tahcode logs")} を確認してください。`
      );
    }
    return true;
  }
  if (previous) {
    await stopBridgeProcess(previous);
  }
  requireLink();
  // Reuse the previous cwd / provider unless overridden; a foreground bridge comes back detached.
  const options: BridgeLaunchOptions = {
    cwd: flagString(flags, "cwd")
      ? path.resolve(flagString(flags, "cwd")!)
      : (previous?.cwd ?? bridgeOptions(flags).cwd),
    provider: flagString(flags, "provider") ?? previous?.provider,
  };
  const state = await spawnDetachedBridge(options);
  ok(`${previous ? "再起動" : "起動"}しました（${describeBridge(state)}）`);
  info(`ログ: ${code("tahcode logs -f")}`);
  return true;
}

async function cmdRestart(flags: Flags): Promise<void> {
  heading("tahcode ブリッジ");
  const restarted = await restartBridgeFromCli(flags);
  if (!restarted) {
    process.exit(1);
  }
}

async function cmdLogs(flags: Flags): Promise<void> {
  const follow = !!flags.follow || !!flags.f;
  const lines =
    Number(flagString(flags, "n") ?? flagString(flags, "lines") ?? 50) || 50;
  if (follow) {
    await followLog(lines);
    return;
  }
  const tail = tailLog(lines);
  if (tail.length === 0) {
    info(`ログはまだありません（${BRIDGE_LOG_PATH}）`);
  }
  for (const line of tail) {
    console.log(line);
  }
}

/* ── macOS launchd user agent ───────────────────────────── */

async function cmdService(flags: Flags, positional: string[]): Promise<void> {
  const action = positional[0] ?? "status";
  if (!launchdSupported()) {
    fail(
      "tahcode service（launchd）は macOS のみ対応です。他の OS では tahcode start（バックグラウンド）を使ってください。"
    );
    process.exit(2);
  }
  switch (action) {
    case "install": {
      requireLink();
      const options = bridgeOptions(flags);
      heading("launchd ユーザーエージェントを登録します");
      info(`plist: ${LAUNCHD_PLIST_PATH}`);
      info(
        `cwd ${options.cwd}${options.provider ? ` · provider ${options.provider}` : ""}`
      );
      const running = runningBridge();
      if (running && running.mode !== "launchd") {
        info(
          `既存のブリッジ（pid ${running.pid}）を停止して launchd に引き継ぎます`
        );
        await stopBridgeProcess(running);
      }
      const result = launchdInstall(options);
      if (!result.ok) {
        fail(`launchctl に失敗しました: ${result.detail}`);
        process.exit(1);
      }
      printLaunchdAuthSummary();
      const state = await waitForBridge(8000);
      if (state) {
        ok(
          `登録して起動しました（${describeBridge(state)}）— ログイン時に自動起動します`
        );
      } else {
        warn(
          `登録しましたが、ブリッジの起動を確認できません。${code("tahcode logs")} を確認してください。`
        );
      }
      info(
        `停止: ${code("tahcode stop")} · 解除: ${code("tahcode service uninstall")} · ログ: ${BRIDGE_LOG_PATH}`
      );
      return;
    }
    case "uninstall": {
      heading("launchd ユーザーエージェントを解除します");
      const result = launchdUninstall();
      if (!result.ok) {
        warn(`launchctl bootout: ${result.detail}`);
      }
      (result.removed ? ok : info)(
        result.removed
          ? `削除しました: ${LAUNCHD_PLIST_PATH}`
          : "登録されていません"
      );
      const leftover = runningBridge();
      if (leftover) {
        await stopBridgeProcess(leftover);
      }
      return;
    }
    case "status": {
      printBridgeStatus();
      if (launchdInstalled()) {
        info(`plist: ${LAUNCHD_PLIST_PATH}`);
      }
      return;
    }
    default: {
      fail(
        `不明なサブコマンド: service ${action}（install / uninstall / status）`
      );
      process.exit(2);
    }
  }
}

function presenceLabel(value: "present" | "missing"): string {
  return value === "present" ? "設定済み" : "未設定";
}

function printLaunchdAuthSummary(): void {
  const summary = launchdAuthSummary(launchdEnvironment());
  info(`CURSOR_API_KEY: ${presenceLabel(summary.cursorApiKey)}`);
  info(
    `CLAUDE_CODE_OAUTH_TOKEN: ${presenceLabel(summary.claudeOAuth)} · ANTHROPIC_API_KEY: ${presenceLabel(summary.anthropicApiKey)}`
  );
  info(`永続化: ${BRIDGE_ENV_PATH}（service install は既存の値を消しません）`);
}

function reportLaunchdDoctor(cursorAvailable: boolean): void {
  if (!launchdSupported()) {
    return;
  }
  heading("launchd");
  const findings = launchdDoctorFindings({
    cursorAvailable,
    execPath: process.execPath,
    fileEnv: readBridgeEnvFile(),
    installed: launchdInstalled(),
    plistEnv: readPlistEnvironmentVariables(LAUNCHD_PLIST_PATH),
    supported: true,
  });
  for (const finding of findings) {
    if (finding.level === "ok") {
      ok(finding.message);
    } else if (finding.level === "warn") {
      warn(finding.message);
    } else {
      info(finding.message);
    }
  }
}

async function main(): Promise<void> {
  applyBridgeEnvToProcess();

  const { command, positional, flags } = parseArgs(process.argv.slice(2));
  if (flags.version || command === "version" || command === "--version") {
    console.log(`tahcode v${VERSION}`);
    return;
  }
  rejectRemovedMulticaSurface(command, flags, positional);
  if (flags.help) {
    help();
    return;
  }
  switch (command) {
    case "help":
    case "--help": {
      help();
      return;
    }
    case "link":
    case "login": {
      await cmdLink(flags, positional);
      return;
    }
    case "unlink":
    case "logout": {
      const removed = removeLink();
      (removed.length > 0 ? ok : info)(
        removed.length > 0
          ? `削除しました: ${removed.join(", ")}`
          : "リンクはありません"
      );
      return;
    }
    case "start":
    case "run": {
      await cmdStart(flags);
      return;
    }
    case "status": {
      await cmdStatus();
      return;
    }
    case "doctor": {
      await cmdDoctor();
      return;
    }
    case "providers": {
      await cmdProviders();
      return;
    }
    case "models": {
      await cmdModels(positional);
      return;
    }
    case "update":
    case "upgrade": {
      await cmdUpdate(flags, positional);
      return;
    }
    case "stop": {
      await cmdStop();
      return;
    }
    case "restart": {
      await cmdRestart(flags);
      return;
    }
    case "logs": {
      await cmdLogs(flags);
      return;
    }
    case "service": {
      await cmdService(flags, positional);
      return;
    }
    case "tool": {
      process.exit(
        await runAgentToolCli({
          argsJson: flagString(flags, "args"),
          name: positional[0],
        })
      );
      return;
    }
    case "tool-mcp": {
      await runAgentToolMcp();
      return;
    }
    default: {
      fail(`不明なコマンド: ${command}`);
      help();
      process.exit(2);
    }
  }
}

main().catch((error) => {
  fail(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
