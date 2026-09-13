/**
 * Machine-side maintenance: live model discovery and allowlisted CLI updates.
 *
 * Everything that spawns a process lives here; the *decisions* (which command
 * is allowed, how to parse output) live in `shared/providerMaintenance.ts` so
 * the web UI can preview exactly what this file will run.
 */
import { spawn } from "node:child_process";
import { realpathSync } from "node:fs";
import {
  PROVIDER_MAINTENANCE,
  classifyInstallMethod,
  parseModelListOutput,
  updateCommandLabel,
  updatePlanFor,
  type InstallMethod,
  type LiveModel,
  type UpdatePlan,
} from "../../shared/providerMaintenance.ts";
import type { ProviderDriverKind } from "../../shared/providers.ts";

export const MODELS_TIMEOUT_MS = 45_000;
export const UPDATE_TIMEOUT_MS = 10 * 60_000;

export type ModelsDiscovery = {
  models: LiveModel[];
  checkedAt: number;
  error?: string;
};

export function resolveInstallMethod(binaryPath: string | null): InstallMethod {
  if (!binaryPath) return "unknown";
  let resolved = binaryPath;
  try {
    resolved = realpathSync(binaryPath);
  } catch {
    /* keep the symlink path */
  }
  return classifyInstallMethod(resolved);
}

export function plannedUpdate(kind: ProviderDriverKind, binaryPath: string | null): UpdatePlan | null {
  return updatePlanFor(kind, resolveInstallMethod(binaryPath), binaryPath);
}

export function plannedUpdateLabel(kind: ProviderDriverKind, binaryPath: string | null): string | undefined {
  return updateCommandLabel(plannedUpdate(kind, binaryPath)) ?? undefined;
}

type Captured = { exitCode: number; stdout: string; stderr: string; timedOut: boolean };

function capture(argv: readonly string[], timeoutMs: number, onLine?: (line: string) => void): Promise<Captured> {
  return new Promise((resolve) => {
    const [bin, ...args] = argv;
    if (!bin) {
      resolve({ exitCode: 127, stdout: "", stderr: "empty argv", timedOut: false });
      return;
    }
    // No shell: argv is passed verbatim, so nothing in it can be interpolated.
    const child = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, CI: "1", NO_COLOR: "1" } });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let pending = "";
    const feed = (chunk: Buffer) => {
      if (!onLine) return;
      pending += chunk.toString();
      const lines = pending.split(/\r?\n/);
      pending = lines.pop() ?? "";
      for (const line of lines) if (line.trim()) onLine(line);
    };
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
      feed(chunk);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
      feed(chunk);
    });
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 5000).unref();
    }, timeoutMs);
    child.on("error", (error) => {
      clearTimeout(timer);
      resolve({ exitCode: 127, stdout, stderr: `${stderr}${error.message}`, timedOut });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (pending.trim() && onLine) onLine(pending);
      resolve({ exitCode: code ?? 1, stdout, stderr, timedOut });
    });
  });
}

/**
 * Ask a provider CLI for its model catalog (`agent models`, `opencode models`,
 * `grok models`). Codex / Claude have no such command and report the static
 * catalog instead (`error` explains why so the UI can say so).
 */
export async function discoverModels(kind: ProviderDriverKind, binaryPath: string | null): Promise<ModelsDiscovery> {
  const argv = PROVIDER_MAINTENANCE[kind].modelsArgv;
  const checkedAt = Date.now();
  if (!argv) return { models: [], checkedAt, error: "no models command" };
  if (!binaryPath) return { models: [], checkedAt, error: "CLI not installed" };
  const result = await capture([binaryPath, ...argv], MODELS_TIMEOUT_MS);
  if (result.timedOut) return { models: [], checkedAt, error: `${argv.join(" ")} timed out after ${MODELS_TIMEOUT_MS / 1000}s` };
  if (result.exitCode !== 0) {
    const detail = (result.stderr || result.stdout).trim().split("\n")[0]?.slice(0, 200);
    return { models: [], checkedAt, error: `${argv.join(" ")} exited with ${result.exitCode}${detail ? `: ${detail}` : ""}` };
  }
  const models = parseModelListOutput(kind, `${result.stdout}\n${result.stderr}`);
  if (models.length === 0) return { models: [], checkedAt, error: `${argv.join(" ")} printed no parsable models` };
  return { models, checkedAt };
}

export type UpdateOutcome = {
  ok: boolean;
  plan: UpdatePlan | null;
  exitCode: number;
  error?: string;
};

/**
 * Run the allowlisted update for a provider, streaming output lines to
 * `onLine`. Refuses (without spawning anything) when the allowlist has no
 * non-interactive path for this install.
 */
export async function runUpdate(kind: ProviderDriverKind, binaryPath: string | null, onLine: (line: string) => void): Promise<UpdateOutcome> {
  const plan = plannedUpdate(kind, binaryPath);
  if (!plan) {
    return { ok: false, plan: null, exitCode: 1, error: `no supported update path for ${kind} (${PROVIDER_MAINTENANCE[kind].manualHint})` };
  }
  const result = await capture(plan.argv, UPDATE_TIMEOUT_MS, onLine);
  if (result.timedOut) return { ok: false, plan, exitCode: result.exitCode, error: `update timed out after ${UPDATE_TIMEOUT_MS / 60000} minutes` };
  if (result.exitCode !== 0) {
    const detail = result.stderr.trim().split("\n").filter(Boolean).pop()?.slice(0, 300);
    return { ok: false, plan, exitCode: result.exitCode, error: `${updateCommandLabel(plan)} exited with ${result.exitCode}${detail ? `: ${detail}` : ""}` };
  }
  return { ok: true, plan, exitCode: 0 };
}
