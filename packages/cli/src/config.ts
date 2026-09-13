import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

/* ~/.tahcode/config.json — the link between this machine and one tahcode
 * runtime (the token the web UI issued at "このマシンを登録").
 *
 * Machines linked with the predecessor npm package (`dalecode` ≤ 0.1.1) keep
 * their link in ~/.dalecode/config.json; it is read as a fallback so
 * `npm i -g tahcode` does not force a re-link. New writes always go to
 * ~/.tahcode. */

export type LinkConfig = {
  url: string;
  runtimeId: string;
  token: string;
  name?: string;
  org?: string;
  linkedAt: string;
};

export const CONFIG_DIR = process.env.TAHCODE_HOME ?? path.join(os.homedir(), ".tahcode");
export const CONFIG_PATH = path.join(CONFIG_DIR, "config.json");
/** Link written by the old `dalecode` CLI; only consulted when TAHCODE_HOME is not set. */
export const LEGACY_CONFIG_PATH = process.env.TAHCODE_HOME ? null : path.join(os.homedir(), ".dalecode", "config.json");

function parseLink(file: string): LinkConfig | null {
  try {
    if (!existsSync(file)) return null;
    const parsed = JSON.parse(readFileSync(file, "utf8")) as Partial<LinkConfig>;
    if (!parsed.url || !parsed.runtimeId || !parsed.token) return null;
    return parsed as LinkConfig;
  } catch {
    return null;
  }
}

export function readLink(): LinkConfig | null {
  return parseLink(CONFIG_PATH) ?? (LEGACY_CONFIG_PATH ? parseLink(LEGACY_CONFIG_PATH) : null);
}

/** True when the effective link comes from the old ~/.dalecode directory. */
export function usingLegacyLink(): boolean {
  return !existsSync(CONFIG_PATH) && !!LEGACY_CONFIG_PATH && parseLink(LEGACY_CONFIG_PATH) !== null;
}

export function writeLink(config: LinkConfig): void {
  mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  writeFileSync(CONFIG_PATH, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
  chmodSync(CONFIG_PATH, 0o600);
}

/** Remove the stored link (new and legacy locations); returns the files that were deleted. */
export function removeLink(): string[] {
  const removed: string[] = [];
  for (const file of [CONFIG_PATH, LEGACY_CONFIG_PATH]) {
    if (file && existsSync(file)) {
      rmSync(file);
      removed.push(file);
    }
  }
  return removed;
}

/** Environment fallback (CI / containers): TAHCODE_URL + TAHCODE_RUNTIME_ID + TAHCODE_TOKEN
 *  (legacy DALECODE_* / CONVEX_URL + HARNESS_RUNTIME_ID + HARNESS_RUNTIME_TOKEN still work). */
export function linkFromEnv(): LinkConfig | null {
  const url = process.env.TAHCODE_URL ?? process.env.DALECODE_URL ?? process.env.CONVEX_URL ?? process.env.VITE_CONVEX_URL;
  const runtimeId = process.env.TAHCODE_RUNTIME_ID ?? process.env.DALECODE_RUNTIME_ID ?? process.env.HARNESS_RUNTIME_ID;
  const token = process.env.TAHCODE_TOKEN ?? process.env.DALECODE_TOKEN ?? process.env.HARNESS_RUNTIME_TOKEN;
  if (!url || !runtimeId || !token) return null;
  return { url, runtimeId, token, name: process.env.TAHCODE_RUNTIME_NAME ?? process.env.DALECODE_RUNTIME_NAME, linkedAt: "env" };
}

export function resolveLink(): LinkConfig | null {
  return linkFromEnv() ?? readLink();
}

export function maskToken(token: string): string {
  return token.length <= 10 ? "••••" : `${token.slice(0, 6)}…${token.slice(-4)}`;
}
