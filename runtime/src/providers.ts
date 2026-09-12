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
import { spawn, type ChildProcess } from "node:child_process";
import type { ProviderDriverKind } from "../../shared/providers.ts";

export type ProviderProbe = {
  kind: ProviderDriverKind;
  displayName: string;
  binary: string | null;
  available: boolean;
  version: string | null;
  headlessSummary: string;
};

export type RunEvents = {
  onText: (chunk: string) => void | Promise<void>;
  onTool: (line: string) => void | Promise<void>;
  onThinking: (line: string) => void | Promise<void>;
};

const DISPLAY: Record<ProviderDriverKind, string> = {
  codex: "Codex",
  claudeAgent: "Claude",
  cursor: "Cursor",
  grok: "Grok",
  opencode: "OpenCode",
  antigravity: "Antigravity",
};

const BINARIES: Record<ProviderDriverKind, string[]> = {
  codex: ["codex"],
  claudeAgent: ["claude"],
  cursor: ["agent", "cursor-agent"],
  grok: ["grok"],
  opencode: ["opencode"],
  antigravity: ["antigravity", "agy"],
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
    if (found) return found;
  }
  return null;
}

async function binaryVersion(binary: string, args: string[]): Promise<string | null> {
  try {
    const out = await new Promise<string>((resolve, reject) => {
      const child = spawn(binary, args, { timeout: 15000 });
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
        kind,
        displayName: DISPLAY[kind] ?? kind,
        binary: null,
        available: false,
        version: null,
        headlessSummary: "native installer + Google sign-in (guided setup, no CLI)",
      });
      continue;
    }
    const binary = await whichBinary(BINARIES[kind] ?? []);
    const version = binary ? await binaryVersion(binary, ["--version"]) : null;
    probes.push({
      kind,
      displayName: DISPLAY[kind] ?? kind,
      binary,
      available: binary !== null,
      version,
      headlessSummary: headlessSummary(kind),
    });
  }
  return probes;
}

function headlessSummary(kind: ProviderDriverKind): string {
  switch (kind) {
    case "codex":
      return "codex exec --json (t3code CodexDriver)";
    case "claudeAgent":
      return "claude -p --output-format stream-json (t3code ClaudeDriver)";
    case "cursor":
      return "agent -p --output-format stream-json (t3code CursorDriver)";
    case "grok":
      return "grok --prompt (t3code GrokDriver)";
    case "opencode":
      return "opencode run (t3code OpenCodeDriver)";
    case "antigravity":
      return "native installer + Google sign-in (t3code AntigravityDriver)";
  }
}

export type ProviderRun = {
  process: ChildProcess;
  done: Promise<{ exitCode: number; output: string }>;
};

function headlessArgs(kind: ProviderDriverKind, prompt: string): string[] {
  switch (kind) {
    case "codex":
      return ["exec", "--json", prompt];
    case "claudeAgent":
      return [
        "-p",
        "--output-format",
        "stream-json",
        "--max-turns",
        "10",
        prompt,
      ];
    case "cursor":
      return ["-p", "--output-format", "stream-json", prompt];
    case "grok":
      return ["--prompt", prompt];
    case "opencode":
      return ["run", prompt];
    case "antigravity":
      throw new Error(
        "Antigravity has no headless CLI in Phase 1 — install via the provider app and pick another runtime provider.",
      );
  }
}

export async function runHeadless(
  kind: ProviderDriverKind,
  binary: string,
  prompt: string,
  cwd: string | undefined,
  events: RunEvents,
  signal: AbortSignal,
): Promise<{ exitCode: number; output: string }> {
  const args = headlessArgs(kind, prompt);
  const child = spawn(binary, args, {
    cwd,
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });

  let output = "";
  let buffer = "";

  const emit = async (line: string) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    if (kind === "codex" || kind === "claudeAgent" || kind === "cursor") {
      const parsed = tryParseJson(trimmed);
      const text = extractText(parsed ?? trimmed, kind);
      if (text) {
        output += `${text}\n`;
        await events.onText(`${text}\n`);
      } else if (looksLikeToolEvent(trimmed)) {
        await events.onTool(trimmed.slice(0, 2000));
      } else {
        output += `${trimmed}\n`;
        await events.onText(`${trimmed}\n`);
      }
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
    if (line) void events.onThinking(line.slice(0, 2000));
  });

  const abort = () => {
    child.kill("SIGTERM");
  };
  if (signal.aborted) abort();
  signal.addEventListener("abort", abort, { once: true });

  const exitCode = await new Promise<number>((resolve) => {
    child.on("close", (code) => resolve(code ?? 1));
    child.on("error", () => resolve(1));
  });
  if (buffer.trim()) await emit(buffer);

  return { exitCode, output: output.trim().slice(-20000) };
}

function tryParseJson(line: string): unknown | null {
  if (!line.startsWith("{")) return null;
  try {
    return JSON.parse(line) as unknown;
  } catch {
    return null;
  }
}

function extractText(parsed: unknown, kind: ProviderDriverKind): string | null {
  if (typeof parsed === "string") {
    return kind === "grok" || kind === "opencode" ? parsed : null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const record = parsed as Record<string, unknown>;
  const type = typeof record.type === "string" ? record.type : "";
  if (type === "result" && typeof record.result === "string") return record.result;
  if (type === "assistant") {
    const message = record.message as { content?: { text?: string; type?: string }[] } | undefined;
    const texts = message?.content
      ?.filter((item) => item.type === "text" && item.text)
      .map((item) => item.text ?? "");
    if (texts && texts.length > 0) return texts.join("\n");
  }
  if (typeof record.text === "string" && /message|output|content|delta/.test(type)) {
    return record.text;
  }
  if (typeof record.message === "string") return record.message;
  return null;
}

function looksLikeToolEvent(line: string): boolean {
  return /tool|function|exec|edit|write|read|bash|command/i.test(line.slice(0, 200));
}
