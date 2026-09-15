/* ─────────────────────────────────────────────────────────
 * @tahcode/core/desktop — the contract between the web app, the Convex
 * backend and the Electron shell (apps/desktop). Pure functions only; no
 * DOM, Node or Electron imports, so every consumer can bundle it.
 *
 *   web     src/lib/desktop.ts            reads window.tahcodeDesktop, picks redirectTo
 *   convex  convex/lib/authRedirect.ts    allow-lists the deep link in callbacks.redirect
 *   desktop apps/desktop/src/main + preload  parses the deep link, exposes the bridge
 * ───────────────────────────────────────────────────────── */

import type {
  DesktopBrowseFolderRequest,
  DesktopBrowseFolderResult,
  DesktopPickFolderRequest,
  DesktopPickFolderResult,
} from "./folder";
import type {
  DesktopCliStatus,
  RegisterLocalRuntimeRequest,
  RegisterLocalRuntimeResult,
  RegisterProgressStep,
} from "./register";
import type { DesktopUpdateCheckReason, DesktopUpdateState } from "./update";

export const DEEP_LINK_SCHEME = "tahcode";

/** Where Convex Auth sends the browser after Google when the shell started the flow. */
export const DESKTOP_OAUTH_CALLBACK = `${DEEP_LINK_SCHEME}://auth/callback`;

/** Global the preload script installs on `window`. */
export const DESKTOP_BRIDGE_KEY = "tahcodeDesktop";

export type OAuthStrategy = "system-browser" | "in-app";

/** The only surface the web app sees inside the shell (contextBridge). */
export interface TahcodeDesktopBridge {
  /** apps/desktop/package.json version */
  version: string;
  platform: string;
  oauthStrategy: OAuthStrategy;
  /** `redirectTo` for `signIn("google", …)`, or null to keep the browser default. */
  oauthRedirectTo: (next: string) => string | null;
  /** OS hostname (Bonjour `.local` still attached; UI may strip it). */
  getHostname: () => Promise<string>;
  /** Whether `tahcode` / `npm` are on the augmented PATH. */
  getCliStatus: () => Promise<DesktopCliStatus>;
  /**
   * Main process: ensure the CLI, then `tahcode link` and restart/start the
   * bridge against the new config. The renderer must not pass a command
   * string — only the Convex-issued fields and an optional progress sink.
   */
  registerLocalRuntime: (
    request: RegisterLocalRuntimeRequest,
    onProgress?: (step: RegisterProgressStep) => void
  ) => Promise<RegisterLocalRuntimeResult>;
  /**
   * Optional: older shells shipped before TAH-67 do not expose these.
   * The web app must feature-detect (`supportsDesktopFolderPicker`).
   */
  browseFolder?: (
    request?: DesktopBrowseFolderRequest
  ) => Promise<DesktopBrowseFolderResult>;
  pickFolder?: (
    request?: DesktopPickFolderRequest
  ) => Promise<DesktopPickFolderResult>;
  /**
   * Optional: older shells shipped before TAH-22 do not expose these.
   * The web app must feature-detect (`supportsDesktopUpdater`).
   */
  applyUpdate?: () => Promise<DesktopUpdateState>;
  checkForUpdates?: (
    reason?: DesktopUpdateCheckReason
  ) => Promise<DesktopUpdateState>;
  downloadUpdate?: () => Promise<DesktopUpdateState>;
  getUpdateState?: () => Promise<DesktopUpdateState>;
  markUpdateUiReady?: () => Promise<void>;
  onOpenUpdateUi?: (listener: () => void) => () => void;
  onUpdateState?: (listener: (state: DesktopUpdateState) => void) => () => void;
  openLatestRelease?: () => Promise<void>;
  setAutoUpdate?: (enabled: boolean) => Promise<DesktopUpdateState>;
}

export interface AuthCallback {
  code: string;
  /** In-app path to continue to after sign-in (invite links); "/" when absent. */
  next: string;
}

function parseUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function safeNext(next: string | null | undefined): string {
  return next && next.startsWith("/") ? next : "/";
}

/** Build the deep link the web app passes as `redirectTo` from inside the shell. */
export function desktopOAuthRedirectTo(next: string): string {
  const url = new URL(DESKTOP_OAUTH_CALLBACK);
  const path = safeNext(next);
  if (path !== "/") {
    url.searchParams.set("next", path);
  }
  return url.toString();
}

/** Strict match on scheme + host + path; query is where `next` and `code` live. */
export function isDesktopOAuthCallback(value: string): boolean {
  const candidate = parseUrl(value);
  if (!candidate) {
    return false;
  }
  const expected = new URL(DESKTOP_OAUTH_CALLBACK);
  return (
    candidate.protocol === expected.protocol &&
    candidate.host === expected.host &&
    candidate.pathname === expected.pathname &&
    candidate.username === "" &&
    candidate.password === "" &&
    candidate.hash === ""
  );
}

/** `tahcode://auth/callback?code=…&next=…` → { code, next } or null for anything else. */
export function parseAuthCallback(raw: string): AuthCallback | null {
  if (!isDesktopOAuthCallback(raw)) {
    return null;
  }
  const url = new URL(raw);
  const code = url.searchParams.get("code");
  if (!code) {
    return null;
  }
  return { code, next: safeNext(url.searchParams.get("next")) };
}

/** The web app's own return URL, so ConvexAuthProvider exchanges the code as in a browser. */
export function loginReturnUrl(appUrl: string, callback: AuthCallback): string {
  const url = new URL("/login", appUrl);
  if (callback.next !== "/") {
    url.searchParams.set("next", callback.next);
  }
  url.searchParams.set("code", callback.code);
  return url.toString();
}

/** First `tahcode://…` argument in a process argv (Linux/Windows second-instance hand-off). */
export function findDeepLink(argv: readonly string[]): string | null {
  return argv.find((arg) => arg.startsWith(`${DEEP_LINK_SCHEME}://`)) ?? null;
}

/**
 * Convex Auth `callbacks.redirect`: the desktop deep link is accepted verbatim;
 * everything else follows Convex Auth's built-in rule (relative paths or SITE_URL)
 * so browser behaviour is unchanged.
 */
export function resolveRedirectTo(redirectTo: string, siteUrl: string): string {
  if (isDesktopOAuthCallback(redirectTo)) {
    return redirectTo;
  }

  const base = siteUrl.replace(/\/$/, "");
  if (redirectTo.startsWith("?") || redirectTo.startsWith("/")) {
    return `${base}${redirectTo}`;
  }
  if (redirectTo.startsWith(base)) {
    const after = redirectTo[base.length];
    if (after === undefined || after === "?" || after === "/") {
      return redirectTo;
    }
  }
  throw new Error(
    `Invalid redirectTo ${redirectTo} for configured SITE_URL: ${base}`
  );
}

export {
  isAllowedFolderPath,
  isDesktopBrowseFolderResult,
  isDesktopPickFolderResult,
  parseBrowseFolderRequest,
  parsePickFolderRequest,
  supportsDesktopFolderBrowse,
  supportsDesktopFolderPicker,
} from "./folder";
export type {
  DesktopBrowseFolderOk,
  DesktopBrowseFolderRequest,
  DesktopBrowseFolderResult,
  DesktopPickFolderRequest,
  DesktopPickFolderResult,
} from "./folder";
export {
  DESKTOP_IPC,
  LINK_NO_RESTART_FLAG,
  MACHINE_NAME_MAX,
  REGISTER_PROGRESS_STEPS,
  displayHostname,
  fallbackRegisterCommands,
  guessBrowserMachineName,
  isAllowedConvexUrl,
  isAllowedMachineName,
  isAllowedRuntimeId,
  isAllowedRuntimeToken,
  isRegisterProgressStep,
  linkArgv,
  looksLikeElevationError,
  mergePath,
  parseRegisterLocalRuntimeRequest,
  planRegisterAfterLink,
  posixShellQuote,
  redactSecrets,
} from "./register";
export {
  AUTO_UPDATE_FIRST_CHECK_MS,
  AUTO_UPDATE_INTERVAL_MS,
  DEFAULT_AUTO_UPDATE_ENABLED,
  DESKTOP_GITHUB_API_RELEASES,
  DESKTOP_GITHUB_OWNER,
  DESKTOP_GITHUB_REPO,
  DESKTOP_RELEASES_URL,
  DESKTOP_RELEASE_TAG_PREFIX,
  DESKTOP_UPDATE_PHASES,
  UPDATE_UI,
  compareSemver,
  describeUpdateState,
  desktopCanInstallInApp,
  desktopReleaseTag,
  formatSemver,
  isAllowedUpdateDownloadUrl,
  isDesktopUpdateCheckReason,
  isDesktopUpdateState,
  isMacInstallerName,
  isNewerVersion,
  parseDesktopReleaseTag,
  parseGithubRelease,
  parseGithubReleases,
  parseSemver,
  selectLatestDesktopRelease,
  selectMacInstallerAsset,
  supportsDesktopUpdater,
  updateErrorMessage,
  withUpdateMessage,
} from "./update";
export type {
  DesktopCliStatus,
  DesktopDoctorGuidance,
  DesktopRegisterErrorCode,
  RegisterLocalRuntimeErr,
  RegisterLocalRuntimeOk,
  RegisterLocalRuntimeRequest,
  RegisterLocalRuntimeResult,
  RegisterProgressStep,
} from "./register";
export type {
  DesktopGithubAsset,
  DesktopGithubRelease,
  DesktopUpdateCheckReason,
  DesktopUpdateErrorCode,
  DesktopUpdatePhase,
  DesktopUpdateState,
} from "./update";
