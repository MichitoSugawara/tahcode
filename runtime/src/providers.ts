/**
 * Headless provider wiring, ported from t3code driver concepts.
 * t3code source: pingdotgg/t3code `apps/server/src/provider/builtInDrivers.ts`
 * + Drivers/* — six drivers: codex, claudeAgent, cursor, grok, opencode, antigravity.
 *
 * t3code runs providers inside its Effect server (SDKs / app-server /
 * managed processes). Phase 1 here keeps the same provider set but uses each
 * CLI's documented headless entrypoint from the user's machine runtime:
 * codex exec, claude -p, agent -p, grok, opencode run. Antigravity has no CLI
 * and stays a guided stub.
 */
import type { ChildProcess } from "node:child_process";
import { spawn } from "node:child_process";

import { agentToolsMcpFlags } from "../../shared/agentTools.ts";
import type { StreamArtifact } from "../../shared/artifacts.ts";
import { extractStreamArtifacts } from "../../shared/artifacts.ts";
import {
  rewriteImagegenPrompt,
  usesCodexImagegen,
} from "../../shared/harnessFeatures.ts";
import type { ProviderOptionSelection } from "../../shared/modelOptions.ts";
import { planHeadlessEffort } from "../../shared/modelOptions.ts";
import type { InstallMethod } from "../../shared/providerMaintenance.ts";
import type { ProviderDriverKind } from "../../shared/providers.ts";
import {
  createUtf8LineBuffer,
  flushUtf8Lines,
  pushUtf8Lines,
} from "../../shared/utf8.ts";
import { plannedUpdateLabel, resolveInstallMethod } from "./maintenance.ts";

const KILL_GRACE_MS = 2000;

/** SIGTERM the spawned CLI (process group on Unix), then SIGKILL if it hangs. */
export function abortSpawnedProcess(child: ChildProcess): void {
  killSpawnedProcess(child, "SIGTERM");
  const timer = setTimeout(() => {
    killSpawnedProcess(child, "SIGKILL");
  }, KILL_GRACE_MS);
  child.once("close", () => {
    clearTimeout(timer);
  });
}

export function killSpawnedProcess(
  child: ChildProcess,
  signal: NodeJS.Signals = "SIGTERM"
): void {
  const pid = child.pid;
  if (pid === undefined) {
    return;
  }
  if (process.platform === "win32") {
    spawn("taskkill", ["/pid", String(pid), "/t", "/f"], {
      stdio: "ignore",
      windowsHide: true,
    });
    return;
  }
  try {
    process.kill(-pid, signal);
  } catch {
    try {
      child.kill(signal);
    } catch {
      /* already gone */
    }
  }
}

export interface ProviderProbe {
  kind: ProviderDriverKind;
  displayName: string;
  binary: string | null;
  available: boolean;
  version: string | null;
  headlessSummary: string;
  /** How the CLI got onto this machine (drives which update command is allowed). */
  installMethod: InstallMethod;
  /** Display form of the allowlisted update this bridge would run; undefined = manual only. */
  updateCommand: string | undefined;
}

export interface RunEvents {
  onArtifact?: (artifact: StreamArtifact) => void | Promise<void>;
  onText: (chunk: string) => void | Promise<void>;
  onTool: (line: string) => void | Promise<void>;
  onThinking: (line: string) => void | Promise<void>;
}

const DISPLAY: Record<ProviderDriverKind, string> = {
  antigravity: "Antigravity",
  claudeAgent: "Claude",
  codex: "Codex",
  cursor: "Cursor",
  grok: "Grok",
  opencode: "OpenCode",
};

const BINARIES: Record<ProviderDriverKind, string[]> = {
  antigravity: ["antigravity", "agy"],
  claudeAgent: ["claude"],
  codex: ["codex"],
  cursor: ["agent", "cursor-agent"],
  grok: ["grok"],
  opencode: ["opencode"],
};

export async function whichBinary(names: string[]): Promise<string | null> {
  for (const name of names) {
    const found = await new Promise<string | null>((resolve) => {
      const child = spawn("sh", ["-c", `command -v ${name}`]);
      let out = "";
      child.stdout.on("data", (data: Buffer) => {
        out += data.toString();
      });
      child.on("close", () => resolve(out.trim() || null));
      child.on("error", () => resolve(null));
    });
    if (found) {
      return found;
    }
  }
  return null;
}

async function binaryVersion(
  binary: string,
  args: string[]
): Promise<string | null> {
  try {
    const out = await new Promise<string>((resolve, reject) => {
      const child = spawn(binary, args, { timeout: 15_000 });
      let text = "";
      child.stdout.on("data", (data: Buffer) => {
        text += data.toString();
      });
      child.stderr.on("data", (data: Buffer) => {
        text += data.toString();
      });
      child.on("close", () => resolve(text));
      child.on("error", reject);
    });
    const first = out.split("\n")[0]?.trim().slice(0, 80);
    return first || null;
  } catch {
    return null;
  }
}

export async function probeProviders(): Promise<ProviderProbe[]> {
  const probes: ProviderProbe[] = [];
  for (const kind of Object.keys(BINARIES) as ProviderDriverKind[]) {
    if (kind === "antigravity") {
      probes.push({
        available: false,
        binary: null,
        displayName: DISPLAY[kind] ?? kind,
        headlessSummary:
          "native installer + Google sign-in (guided setup, no CLI)",
        installMethod: "unknown",
        kind,
        updateCommand: undefined,
        version: null,
      });
      continue;
    }
    const binary = await whichBinary(BINARIES[kind] ?? []);
    const version = binary ? await binaryVersion(binary, ["--version"]) : null;
    probes.push({
      available: binary !== null,
      binary,
      displayName: DISPLAY[kind] ?? kind,
      headlessSummary: headlessSummary(kind),
      installMethod: binary ? resolveInstallMethod(binary) : "unknown",
      kind,
      updateCommand: binary ? plannedUpdateLabel(kind, binary) : undefined,
      version,
    });
  }
  return probes;
}

/** Re-read one provider's version after an update (same probe as the heartbeat uses). */
export async function probeVersion(
  kind: ProviderDriverKind
): Promise<{ binary: string | null; version: string | null }> {
  const binary = await whichBinary(BINARIES[kind] ?? []);
  return {
    binary,
    version: binary ? await binaryVersion(binary, ["--version"]) : null,
  };
}

function headlessSummary(kind: ProviderDriverKind): string {
  switch (kind) {
    case "codex": {
      return "codex exec --json (t3code CodexDriver)";
    }
    case "claudeAgent": {
      return "claude -p --output-format stream-json (t3code ClaudeDriver)";
    }
    case "cursor": {
      return "agent -p --output-format stream-json (t3code CursorDriver)";
    }
    case "grok": {
      return "grok --prompt (t3code GrokDriver)";
    }
    case "opencode": {
      return "opencode run (t3code OpenCodeDriver)";
    }
    case "antigravity": {
      return "native installer + Google sign-in (t3code AntigravityDriver)";
    }
  }
}

export interface ProviderRun {
  process: ChildProcess;
  done: Promise<{ exitCode: number; output: string }>;
}

/**
 * Headless argv per provider. `model` is the slug from `@provider/model` (or
 * the chat's bound model); when absent the CLI runs with its own default, so a
 * bare `@provider` behaves exactly as before. `options` are t3code
 * `ProviderOptionSelection`s (effort / variant / thinking) and become
 * provider-native flags when the CLI has one. Flags follow what t3code and
 * Multica pass: `codex exec --model`, `claude -p --model`, `agent -p --model`,
 * `opencode run --model provider/model`; Grok's headless flags stay
 * provisional (see README).
 */
export function headlessArgs(
  kind: ProviderDriverKind,
  prompt: string,
  model?: string,
  options?: readonly ProviderOptionSelection[],
  mcpConfigPath?: string
): string[] {
  const effort = planHeadlessEffort(kind, prompt, model, options);
  const modelFlag = model ? ["--model", model] : [];
  const toolFlags = agentToolsMcpFlags(kind, mcpConfigPath);
  switch (kind) {
    case "codex": {
      const codexPrompt = rewriteImagegenPrompt(effort.prompt);
      const imagegenFlags = usesCodexImagegen(codexPrompt)
        ? ["-s", "workspace-write", "--skip-git-repo-check"]
        : [];
      return [
        "exec",
        ...modelFlag,
        ...effort.flags,
        ...imagegenFlags,
        "--json",
        codexPrompt,
      ];
    }
    case "claudeAgent": {
      // `--verbose` is required by the Claude CLI when combining
      // `-p/--print` with `--output-format stream-json`.
      return [
        "-p",
        ...modelFlag,
        ...effort.flags,
        ...toolFlags,
        "--output-format",
        "stream-json",
        "--verbose",
        "--max-turns",
        "10",
        effort.prompt,
      ];
    }
    case "cursor": {
      return [
        "-p",
        ...modelFlag,
        "--output-format",
        "stream-json",
        effort.prompt,
      ];
    }
    case "grok": {
      return [...modelFlag, "--prompt", effort.prompt];
    }
    case "opencode": {
      return ["run", ...modelFlag, ...effort.flags, effort.prompt];
    }
    case "antigravity": {
      throw new Error(
        "Antigravity has no headless CLI in Phase 1 — install via the provider app and pick another runtime provider."
      );
    }
  }
}

export async function runHeadless(
  kind: ProviderDriverKind,
  binary: string,
  prompt: string,
  cwd: string | undefined,
  events: RunEvents,
  signal: AbortSignal,
  model?: string,
  options?: readonly ProviderOptionSelection[],
  extras?: { env?: NodeJS.ProcessEnv; mcpConfigPath?: string }
): Promise<{ exitCode: number; output: string }> {
  const args = headlessArgs(
    kind,
    prompt,
    model,
    options,
    extras?.mcpConfigPath
  );
  const child = spawn(binary, args, {
    cwd,
    detached: process.platform !== "win32",
    env: extras?.env ?? process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });

  let output = "";
  let emittedText = false;
  let lastEmitted = "";
  const lineBuffer = createUtf8LineBuffer();
  const stderrBuffer = createUtf8LineBuffer();

  const emit = async (line: string) => {
    const trimmed = line.trim();
    if (!trimmed) {
      return;
    }
    if (kind === "codex" || kind === "claudeAgent" || kind === "cursor") {
      const parsed = tryParseJson(trimmed);
      if (parsed !== null) {
        const classified = classifyStreamEvent(
          parsed,
          emittedText,
          output,
          lastEmitted
        );
        if (events.onArtifact) {
          for (const artifact of extractStreamArtifacts(parsed)) {
            await events.onArtifact(artifact);
          }
        }
        if (classified.kind === "text" && classified.text) {
          emittedText = true;
          lastEmitted = classified.text;
          output += `${classified.text}\n`;
          await events.onText(`${classified.text}\n`);
        } else if (classified.kind === "tool") {
          await events.onTool(classified.text.slice(0, 2000));
        } else if (classified.kind === "trace") {
          // Protocol noise (turn.started, item.started, usage, …) goes to the
          // thinking trace instead of polluting the chat body with raw JSON.
          await events.onThinking(trimmed.slice(0, 1000));
        }
        return;
      }
      output += `${trimmed}\n`;
      emittedText = true;
      await events.onText(`${trimmed}\n`);
      return;
    }
    output += `${trimmed}\n`;
    emittedText = true;
    await events.onText(`${trimmed}\n`);
  };

  // Classify sequentially. Cursor/Claude flush assistant + result in one
  // stdout chunk; `void emit(line)` raced and double-appended the greeting.
  let emitChain = Promise.resolve();
  const queueEmit = (line: string) => {
    emitChain = emitChain
      .then(() => emit(line))
      .catch(() => {
        /* keep draining so later lines still classify */
      });
  };

  const onData = (data: Buffer) => {
    for (const line of pushUtf8Lines(lineBuffer, data)) {
      queueEmit(line);
    }
  };
  child.stdout?.on("data", onData);
  child.stderr?.on("data", (data: Buffer) => {
    for (const line of pushUtf8Lines(stderrBuffer, data)) {
      const text = line.trim();
      if (text) {
        void events.onThinking(text.slice(0, 2000));
      }
    }
  });

  const abort = () => {
    abortSpawnedProcess(child);
  };
  if (signal.aborted) {
    abort();
  }
  signal.addEventListener("abort", abort, { once: true });

  const exitCode = await new Promise<number>((resolve) => {
    child.on("close", (code) => resolve(code ?? 1));
    child.on("error", () => resolve(1));
  });
  signal.removeEventListener("abort", abort);
  await emitChain;
  for (const line of flushUtf8Lines(lineBuffer)) {
    await emit(line);
  }
  for (const line of flushUtf8Lines(stderrBuffer)) {
    const text = line.trim();
    if (text) {
      await events.onThinking(text.slice(0, 2000));
    }
  }

  return { exitCode, output: output.trim().slice(-20_000) };
}

function tryParseJson(line: string): unknown | null {
  if (!line.startsWith("{")) {
    return null;
  }
  try {
    return JSON.parse(line) as unknown;
  } catch {
    return null;
  }
}

type StreamEvent =
  | { kind: "text"; text: string }
  | { kind: "tool"; text: string }
  | { kind: "trace" };

/**
 * Classify one JSONL event from a provider's headless stream.
 *
 * Shapes handled (mirroring what t3code's adapters normalize):
 * - Claude / Cursor (claude-style): {type:"assistant",message:{content:[{type:"text",text}]}}
 *   and the final {type:"result",result}. Multiple `assistant` events may each
 *   carry the full message snapshot (not a delta). Skip when the new text
 *   equals accumulated text or is a prefix/suffix duplicate of the last
 *   emitted snapshot; treat a longer snapshot as replace (delta only).
 * - Codex exec --json: {type:"item.completed",item:{item_type|type:"agent_message"|"assistant_message",text}}
 *   with command/tool items surfaced as tool chips; turn/thread lifecycle
 *   events are trace-only.
 *
 * Callers must classify events sequentially and pass the text accumulated so
 * far. Concurrent classify with `alreadyEmittedText=false` will double-emit
 * Cursor's terminal `result`.
 */
export function classifyStreamEvent(
  parsed: unknown,
  alreadyEmittedText = false,
  accumulatedText = "",
  lastEmitted = ""
): StreamEvent {
  if (typeof parsed !== "object" || parsed === null) {
    return { kind: "trace" };
  }
  const record = parsed as Record<string, unknown>;
  const type = typeof record.type === "string" ? record.type : "";
  const hasEmitted = alreadyEmittedText || accumulatedText.trim().length > 0;

  if (type === "result" && typeof record.result === "string") {
    // Claude/Cursor emit the full text again as `result` after streaming
    // assistant deltas — do not append a second copy.
    if (
      hasEmitted ||
      isRedundantStreamText(record.result, accumulatedText, lastEmitted)
    ) {
      return { kind: "trace" };
    }
    return { kind: "text", text: record.result };
  }

  if (type === "assistant") {
    // Cursor --stream-partial-output: buffered flush before a tool call.
    if (typeof record.model_call_id === "string" && record.model_call_id) {
      return { kind: "trace" };
    }
    const message = record.message as
      | { content?: { text?: string; type?: string }[] }
      | undefined;
    const texts = message?.content
      ?.filter((item) => item.type === "text" && item.text)
      .map((item) => item.text ?? "");
    if (texts && texts.length > 0) {
      return classifyEmittedText(
        joinAssistantTexts(texts),
        accumulatedText,
        lastEmitted
      );
    }
    return { kind: "trace" };
  }

  // Codex item events: text lives nested inside `item`.
  const item = record.item as Record<string, unknown> | undefined;
  if (item && typeof item === "object") {
    const itemType =
      (typeof item.item_type === "string" && item.item_type) ||
      (typeof item.type === "string" && item.type) ||
      "";
    if (
      (itemType === "agent_message" || itemType === "assistant_message") &&
      typeof item.text === "string" &&
      type.endsWith("completed")
    ) {
      return classifyEmittedText(item.text, accumulatedText, lastEmitted);
    }
    if (/command|tool|file|patch|mcp|image_gen/.test(itemType)) {
      const label =
        (typeof item.command === "string" && item.command) ||
        (typeof item.text === "string" && item.text) ||
        itemType;
      return { kind: "tool", text: `${itemType}: ${label}` };
    }
    return { kind: "trace" };
  }

  if (
    typeof record.text === "string" &&
    /message|output|content|delta/.test(type)
  ) {
    return classifyEmittedText(record.text, accumulatedText, lastEmitted);
  }
  if (typeof record.error === "string") {
    return { kind: "text", text: `error: ${record.error}` };
  }
  return { kind: "trace" };
}

/** True when `incoming` is a snapshot already shown in `accumulated` / last emit. */
export function isRedundantStreamText(
  incoming: string,
  accumulated: string,
  lastEmitted = ""
): boolean {
  const next = incoming.trim();
  if (next.length === 0) {
    return false;
  }
  const prior = accumulated.trim();
  const last = lastEmitted.trim();
  if (prior.length > 0 && sameSnapshotText(prior, next)) {
    return true;
  }
  if (last.length > 0 && sameSnapshotText(last, next)) {
    return true;
  }
  if (last.length > 0 && isPrefixOrSuffixDuplicate(next, last)) {
    return true;
  }
  if (prior.length > 0 && isPrefixOrSuffixDuplicate(next, prior)) {
    return true;
  }
  return false;
}

function sameSnapshotText(left: string, right: string): boolean {
  return (
    left === right || left.replaceAll("\n", "") === right.replaceAll("\n", "")
  );
}

function isPrefixOrSuffixDuplicate(
  incoming: string,
  reference: string
): boolean {
  if (incoming.length >= reference.length) {
    return false;
  }
  return reference.startsWith(incoming) || reference.endsWith(incoming);
}

function joinAssistantTexts(texts: string[]): string {
  const unique: string[] = [];
  for (const text of texts) {
    const prev = unique.at(-1) ?? "";
    if (prev && isRedundantStreamText(text, prev, prev)) {
      continue;
    }
    unique.push(text);
  }
  return unique.join("\n");
}

function classifyEmittedText(
  incoming: string,
  accumulated: string,
  lastEmitted: string
): StreamEvent {
  if (isRedundantStreamText(incoming, accumulated, lastEmitted)) {
    return { kind: "trace" };
  }
  const prior = accumulated.trim();
  const next = incoming.trim();
  if (
    prior.length > 0 &&
    next.startsWith(prior) &&
    next.length > prior.length
  ) {
    const rest = next.slice(prior.length);
    if (rest.trim().length === 0) {
      return { kind: "trace" };
    }
    return { kind: "text", text: rest };
  }
  return { kind: "text", text: incoming };
}
