import { spawn, spawnSync } from "node:child_process";

/* ─────────────────────────────────────────────────────────
 * Multica CLI / daemon adapter. tahcode does not ship its own
 * execution daemon: the Multica daemon detects agent CLIs and
 * owns the machine's task execution; tahcode wraps its
 * lifecycle with tahcode branding and links the machine to a
 * tahcode org.
 * ───────────────────────────────────────────────────────── */

export const MULTICA_BIN = process.env.MULTICA_BIN ?? "multica";
export const MULTICA_INSTALL_URL = "https://raw.githubusercontent.com/multica-ai/multica/main/scripts/install.sh";
export const MULTICA_DOCS = "https://multica.ai/docs/daemon-runtimes";

export type DaemonHealth = {
  status?: string;
  pid?: number;
  version?: string;
  agents?: string[];
  workspaces?: unknown[];
  [key: string]: unknown;
};

export function multicaVersion(): string | null {
  const result = spawnSync(MULTICA_BIN, ["version"], { encoding: "utf8", timeout: 5000 });
  if (result.error || result.status !== 0) return null;
  return (result.stdout || result.stderr).trim().split("\n")[0] ?? null;
}

export function multicaInstalled(): boolean {
  return multicaVersion() !== null;
}

export function multicaAuthOk(): { ok: boolean; detail: string } {
  const result = spawnSync(MULTICA_BIN, ["auth", "status"], { encoding: "utf8", timeout: 8000 });
  if (result.error) return { ok: false, detail: result.error.message };
  const text = `${result.stdout}${result.stderr}`.trim();
  return { ok: result.status === 0, detail: text.split("\n")[0] ?? "" };
}

export function daemonHealth(): DaemonHealth | null {
  const result = spawnSync(MULTICA_BIN, ["daemon", "status", "--output", "json"], { encoding: "utf8", timeout: 8000 });
  if (result.error) return null;
  try {
    const parsed = JSON.parse(result.stdout) as DaemonHealth;
    return parsed;
  } catch {
    return result.status === 0 ? { status: "unknown" } : null;
  }
}

export function daemonRunning(health: DaemonHealth | null): boolean {
  return !!health && (health.status === "running" || health.status === "ok" || typeof health.pid === "number");
}

export function daemonAgents(health: DaemonHealth | null): string[] {
  if (!health || !Array.isArray(health.agents)) return [];
  return health.agents.map((agent) => String(agent));
}

/** Run a multica subcommand with inherited stdio; resolves with the exit code. */
export function passthrough(args: string[]): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn(MULTICA_BIN, args, { stdio: "inherit" });
    child.on("error", (error) => {
      console.error(`multica を起動できません: ${error.message}`);
      resolve(127);
    });
    child.on("exit", (code) => resolve(code ?? 1));
  });
}

export function hasBrew(): boolean {
  const result = spawnSync("brew", ["--version"], { encoding: "utf8", timeout: 5000 });
  return !result.error && result.status === 0;
}

export function installCommand(): string {
  if (process.platform === "win32") return "irm https://raw.githubusercontent.com/multica-ai/multica/main/scripts/install.ps1 | iex";
  if (hasBrew()) return "brew install multica-ai/tap/multica";
  return `curl -fsSL ${MULTICA_INSTALL_URL} | bash`;
}
