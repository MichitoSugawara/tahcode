import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

import {
  DEEP_LINK_SCHEME,
  DESKTOP_OAUTH_CALLBACK,
} from "@tahcode/core/desktop";
import type { OAuthStrategy } from "@tahcode/core/desktop";

export { DEEP_LINK_SCHEME, DESKTOP_OAUTH_CALLBACK, type OAuthStrategy };

/* ─────────────────────────────────────────────────────────
 * Which tahcode deployment the shell loads.
 *
 * Precedence (highest first):
 *   1. `--url=https://…` on the command line
 *   2. `TAHCODE_DESKTOP_URL` env
 *   3. `TAHCODE_DESKTOP_ENV=production|staging|local` env
 *   4. the choice persisted from the "Server" menu (settings.json in userData)
 *   5. production
 * ───────────────────────────────────────────────────────── */

export type ServerPreset = "production" | "staging" | "local";

export const SERVER_PRESETS: Record<
  ServerPreset,
  { label: string; url: string }
> = {
  production: {
    label: "Production",
    url: "https://tahcode.gawara.workers.dev",
  },
  staging: {
    label: "Staging",
    url: "https://tahcode-staging.gawara.workers.dev",
  },
  local: { label: "Local (127.0.0.1:43173)", url: "http://127.0.0.1:43173" },
};

export interface ShellConfig {
  /** Origin the window is allowed to navigate within, e.g. https://tahcode.gawara.workers.dev */
  appUrl: string;
  preset: ServerPreset | null;
  /** Where Google sign-in happens. Default: the user's browser (see README). */
  oauthStrategy: OAuthStrategy;
  /** Set via `TAHCODE_DESKTOP_SMOKE=<png path>`: load, screenshot, quit. */
  smokeScreenshotPath: string | null;
  openDevTools: boolean;
}

export interface WindowBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PersistedSettings {
  preset?: ServerPreset;
  bounds?: WindowBounds;
}

function isPreset(value: string | undefined): value is ServerPreset {
  return value === "production" || value === "staging" || value === "local";
}

function isBounds(value: unknown): value is WindowBounds {
  if (!value || typeof value !== "object") {
    return false;
  }
  const b = value as Record<string, unknown>;
  return ["x", "y", "width", "height"].every(
    (key) => typeof b[key] === "number" && Number.isFinite(b[key])
  );
}

function argValue(argv: readonly string[], name: string): string | undefined {
  const prefix = `--${name}=`;
  const inline = argv.find((arg) => arg.startsWith(prefix));
  if (inline) {
    return inline.slice(prefix.length);
  }
  const index = argv.indexOf(`--${name}`);
  return index === -1 ? undefined : argv[index + 1];
}

function normalizeOrigin(raw: string): string {
  const url = new URL(raw);
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error(
      `tahcode desktop: unsupported app URL protocol ${url.protocol}`
    );
  }
  return url.origin;
}

export function settingsPath(userDataDir: string): string {
  return join(userDataDir, "settings.json");
}

export function readSettings(userDataDir: string): PersistedSettings {
  try {
    const parsed: unknown = JSON.parse(
      readFileSync(settingsPath(userDataDir), "utf-8")
    );
    if (parsed && typeof parsed === "object") {
      const { preset, bounds } = parsed as {
        preset?: unknown;
        bounds?: unknown;
      };
      const settings: PersistedSettings = {};
      const presetValue = typeof preset === "string" ? preset : undefined;
      if (isPreset(presetValue)) {
        settings.preset = presetValue;
      }
      if (isBounds(bounds)) {
        settings.bounds = bounds;
      }
      return settings;
    }
  } catch {
    /* first run or unreadable file */
  }
  return {};
}

export function writeSettings(
  userDataDir: string,
  settings: PersistedSettings
): void {
  const file = settingsPath(userDataDir);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(settings, null, 2));
}

export function resolveConfig(
  argv: readonly string[],
  env: NodeJS.ProcessEnv,
  userDataDir: string
): ShellConfig {
  const persisted = readSettings(userDataDir);
  const explicitUrl = argValue(argv, "url") ?? env.TAHCODE_DESKTOP_URL;
  const envPreset = env.TAHCODE_DESKTOP_ENV;
  if (envPreset !== undefined && !isPreset(envPreset)) {
    throw new Error(
      `tahcode desktop: TAHCODE_DESKTOP_ENV must be production, staging or local (got "${envPreset}")`
    );
  }

  let appUrl: string;
  let preset: ServerPreset | null;
  if (explicitUrl) {
    appUrl = normalizeOrigin(explicitUrl);
    preset = null;
  } else {
    preset = envPreset ?? persisted.preset ?? "production";
    appUrl = SERVER_PRESETS[preset].url;
  }

  const oauthStrategy: OAuthStrategy =
    env.TAHCODE_DESKTOP_OAUTH === "in-app" ? "in-app" : "system-browser";

  return {
    appUrl,
    preset,
    oauthStrategy,
    smokeScreenshotPath: env.TAHCODE_DESKTOP_SMOKE || null,
    openDevTools: env.TAHCODE_DESKTOP_DEVTOOLS === "1",
  };
}

/** Local dev servers (Vite / Convex / files Worker) count as "inside the app". */
export function isAppOrigin(config: ShellConfig, url: string): boolean {
  try {
    const target = new URL(url);
    if (target.origin === config.appUrl) {
      return true;
    }
    const app = new URL(config.appUrl);
    const loopback =
      app.hostname === "127.0.0.1" || app.hostname === "localhost";
    return (
      loopback &&
      (target.hostname === "127.0.0.1" || target.hostname === "localhost")
    );
  } catch {
    return false;
  }
}
