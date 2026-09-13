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
import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";

import type { ProviderDriverKind } from "../../shared/providers.ts";

export interface ProviderProbe {
  kind: ProviderDriverKind;
  displayName: string;
  binary: string | null;
  available: boolean;
  version: string | null;
  headlessSummary: string;
}

export interface RunEvents {
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
        kind,
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
      kind,
      version,
    });
  }
  return probes;
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
 * bare `@provider` behaves exactly as before. Flags follow what t3code and
 * Multica pass: `codex exec --model`, `claude -p --model`, `agent -p --model`,
 * `opencode run --model provider/model`; Grok's headless flags stay
 * provisional (see README).
 */
export function headlessArgs(
  kind: ProviderDriverKind,
  prompt: string,
  model?: string
): string[] {
  const modelFlag = model ? ["--model", model] : [];
  switch (kind) {
    case "codex": {
      return ["exec", ...modelFlag, "--json", prompt];
    }
    case "claudeAgent": {
      // `--verbose` is required by the Claude CLI when combining
      // `-p/--print` with `--output-format stream-json`.
      return [
        "-p",
        ...modelFlag,
        "--output-format",
        "stream-json",
        "--verbose",
        "--max-turns",
        "10",
        prompt,
      ];
    }
    case "cursor": {
      return ["-p", ...modelFlag, "--output-format", "stream-json", prompt];
    }
    case "grok": {
      return [...modelFlag, "--prompt", prompt];
    }
    case "opencode": {
      return ["run", ...modelFlag, prompt];
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
  model?: string
): Promise<{ exitCode: number; output: string }> {
  const args = headlessArgs(kind, prompt, model);
  const child = spawn(binary, args, {
    cwd,
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });

  let output = "";
  let buffer = "";

  const emit = async (line: string) => {
    const trimmed = line.trim();
    if (!trimmed) {
      return;
    }
    if (kind === "codex" || kind === "claudeAgent" || kind === "cursor") {
      const parsed = tryParseJson(trimmed);
      if (parsed !== null) {
        const classified = classifyStreamEvent(parsed);
        if (classified.kind === "text" && classified.text) {
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
      await events.onText(`${trimmed}\n`);
      return;
    }
    output += `${trimmed}\n`;
    await events.onText(`${trimmed}\n`);
  };

  const onData = (data: Buffer) => {
    buffer += data.toString();
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      void emit(line);
    }
  };
  child.stdout?.on("data", onData);
  child.stderr?.on("data", (data: Buffer) => {
    const line = data.toString().trim();
    if (line) {
      void events.onThinking(line.slice(0, 2000));
    }
  });

  const abort = () => {
    child.kill("SIGTERM");
  };
  if (signal.aborted) {
    abort();
  }
  signal.addEventListener("abort", abort, { once: true });

  const exitCode = await new Promise<number>((resolve) => {
    child.on("close", (code) => resolve(code ?? 1));
    child.on("error", () => resolve(1));
  });
  if (buffer.trim()) {
    await emit(buffer);
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
 *   and the final {type:"result",result}.
 * - Codex exec --json: {type:"item.completed",item:{item_type|type:"agent_message"|"assistant_message",text}}
 *   with command/tool items surfaced as tool chips; turn/thread lifecycle
 *   events are trace-only.
 */
function classifyStreamEvent(parsed: unknown): StreamEvent {
  if (typeof parsed !== "object" || parsed === null) {
    return { kind: "trace" };
  }
  const record = parsed as Record<string, unknown>;
  const type = typeof record.type === "string" ? record.type : "";

  if (type === "result" && typeof record.result === "string") {
    return { kind: "text", text: record.result };
  }

  if (type === "assistant") {
    const message = record.message as
      | { content?: { text?: string; type?: string }[] }
      | undefined;
    const texts = message?.content
      ?.filter((item) => item.type === "text" && item.text)
      .map((item) => item.text ?? "");
    if (texts && texts.length > 0) {
      return { kind: "text", text: texts.join("\n") };
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
      return { kind: "text", text: item.text };
    }
    if (/command|tool|file|patch|mcp/.test(itemType)) {
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
    return { kind: "text", text: record.text };
  }
  if (typeof record.error === "string") {
    return { kind: "text", text: `error: ${record.error}` };
  }
  return { kind: "trace" };
}
