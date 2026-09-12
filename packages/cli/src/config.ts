import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

/* ~/.dalecode/config.json — the link between this machine and one dalecode
 * runtime (the token the web UI issued at "このマシンを登録"). */

export type LinkConfig = {
  url: string;
  runtimeId: string;
  token: string;
  name?: string;
  org?: string;
  linkedAt: string;
};

export const CONFIG_DIR = process.env.DALECODE_HOME ?? path.join(os.homedir(), ".dalecode");
export const CONFIG_PATH = path.join(CONFIG_DIR, "config.json");

export function readLink(): LinkConfig | null {
  try {
    if (!existsSync(CONFIG_PATH)) return null;
    const parsed = JSON.parse(readFileSync(CONFIG_PATH, "utf8")) as Partial<LinkConfig>;
    if (!parsed.url || !parsed.runtimeId || !parsed.token) return null;
    return parsed as LinkConfig;
  } catch {
    return null;
  }
}

export function writeLink(config: LinkConfig): void {
  mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  writeFileSync(CONFIG_PATH, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
  chmodSync(CONFIG_PATH, 0o600);
}

export function removeLink(): boolean {
  if (!existsSync(CONFIG_PATH)) return false;
  rmSync(CONFIG_PATH);
  return true;
}

/** Environment fallback (CI / containers): CONVEX_URL + HARNESS_RUNTIME_ID + HARNESS_RUNTIME_TOKEN. */
export function linkFromEnv(): LinkConfig | null {
  const url = process.env.DALECODE_URL ?? process.env.CONVEX_URL ?? process.env.VITE_CONVEX_URL;
  const runtimeId = process.env.DALECODE_RUNTIME_ID ?? process.env.HARNESS_RUNTIME_ID;
  const token = process.env.DALECODE_TOKEN ?? process.env.HARNESS_RUNTIME_TOKEN;
  if (!url || !runtimeId || !token) return null;
  return { url, runtimeId, token, name: process.env.DALECODE_RUNTIME_NAME, linkedAt: "env" };
}

export function resolveLink(): LinkConfig | null {
  return linkFromEnv() ?? readLink();
}

export function maskToken(token: string): string {
  return token.length <= 10 ? "••••" : `${token.slice(0, 6)}…${token.slice(-4)}`;
}
