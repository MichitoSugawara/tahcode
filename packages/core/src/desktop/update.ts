/* ─────────────────────────────────────────────────────────
 * Desktop app updates — shared types and pure helpers.
 *
 * The Electron shell checks GitHub Releases (`desktop-v*` tags)
 * and either downloads a .dmg (unsigned builds) or, later,
 * applies in-app once Developer ID + notarization exist.
 * The web app only renders state the preload already validated.
 * ───────────────────────────────────────────────────────── */

export const DESKTOP_GITHUB_OWNER = "MichitoSugawara";
export const DESKTOP_GITHUB_REPO = "tahcode";
export const DESKTOP_RELEASE_TAG_PREFIX = "desktop-v";
export const DESKTOP_RELEASES_URL = `https://github.com/${DESKTOP_GITHUB_OWNER}/${DESKTOP_GITHUB_REPO}/releases`;
export const DESKTOP_GITHUB_API_RELEASES = `https://api.github.com/repos/${DESKTOP_GITHUB_OWNER}/${DESKTOP_GITHUB_REPO}/releases`;

/** Safe default: unsigned macOS builds cannot replace themselves in-app. */
export const DEFAULT_AUTO_UPDATE_ENABLED = false;

export const AUTO_UPDATE_FIRST_CHECK_MS = 20_000;
export const AUTO_UPDATE_INTERVAL_MS = 4 * 60 * 60 * 1000;

export const DESKTOP_UPDATE_PHASES = [
  "idle",
  "checking",
  "upToDate",
  "available",
  "downloading",
  "ready",
  "error",
] as const;

export type DesktopUpdatePhase = (typeof DESKTOP_UPDATE_PHASES)[number];

export type DesktopUpdateCheckReason = "user" | "auto";

export type DesktopUpdateErrorCode =
  | "apply-failed"
  | "bad-payload"
  | "busy"
  | "download-failed"
  | "network"
  | "no-release";

export interface DesktopUpdateState {
  availableVersion: string | null;
  autoUpdateEnabled: boolean;
  canDownload: boolean;
  canInstallInApp: boolean;
  currentVersion: string;
  downloadPercent: number | null;
  downloadedPath: string | null;
  error: string | null;
  lastCheckReason: DesktopUpdateCheckReason | null;
  message: string;
  packaged: boolean;
  phase: DesktopUpdatePhase;
  platform: string;
  releaseUrl: string | null;
}

export interface DesktopGithubAsset {
  browser_download_url: string;
  name: string;
  size: number;
}

export interface DesktopGithubRelease {
  assets: DesktopGithubAsset[];
  draft: boolean;
  html_url: string;
  prerelease: boolean;
  tag_name: string;
}

export const UPDATE_UI = {
  applySigned: "再起動して適用",
  applyUnsigned: "ディスクイメージを開く",
  autoUpdate: "自動アップデート",
  autoUpdateHint:
    "オンにすると起動時と数時間ごとに確認し、更新があれば通知します。適用は確認してから行います。未署名のため既定はオフです。",
  check: "アップデートを確認",
  nonMacNotice:
    "デスクトップの配布は現在 macOS（Apple Silicon）のみです。GitHub Releases から手動で入手できます。",
  openReleases: "GitHub Releases を開く",
  staleShell:
    "このデスクトップ版は更新機能に未対応です。GitHub Releases から最新の .dmg を入手してください。",
  unpackagedNotice:
    "開発ビルドではアプリへの適用はできません。確認とインストーラのダウンロードのみ行えます。",
  unsignedNotice:
    "このビルドは未署名です。macOS の Gatekeeper のため、アプリ内での自動差し替えはできません。ダウンロードした .dmg を開き、tahcode を Applications にコピーしてください。初回は右クリック → 開くが必要です。",
  updateNow: "今すぐ更新",
} as const;

const SEMVER = /^v?(\d+)\.(\d+)\.(\d+)/;
const PHASE_SET = new Set<string>(DESKTOP_UPDATE_PHASES);
const CHECK_REASONS = new Set<string>(["user", "auto"]);

function parseUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

export function parseSemver(
  version: string
): [major: number, minor: number, patch: number] | null {
  const match = SEMVER.exec(version.trim());
  if (!match) {
    return null;
  }
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

export function formatSemver(parts: readonly [number, number, number]): string {
  return `${parts[0]}.${parts[1]}.${parts[2]}`;
}

/** -1 if a < b, 0 if equal, 1 if a > b. Null when either side is not semver. */
export function compareSemver(a: string, b: string): number | null {
  const left = parseSemver(a);
  const right = parseSemver(b);
  if (!left || !right) {
    return null;
  }
  for (const [index, part] of left.entries()) {
    const other = right[index];
    if (other === undefined || part === other) {
      continue;
    }
    return part < other ? -1 : 1;
  }
  return 0;
}

export function isNewerVersion(candidate: string, current: string): boolean {
  return compareSemver(candidate, current) === 1;
}

export function desktopReleaseTag(version: string): string {
  const parsed = parseSemver(version);
  const body = parsed ? formatSemver(parsed) : version.trim().replace(/^v/, "");
  return `${DESKTOP_RELEASE_TAG_PREFIX}${body}`;
}

export function parseDesktopReleaseTag(tag: string): string | null {
  const trimmed = tag.trim();
  if (!trimmed.startsWith(DESKTOP_RELEASE_TAG_PREFIX)) {
    return null;
  }
  const parsed = parseSemver(trimmed.slice(DESKTOP_RELEASE_TAG_PREFIX.length));
  return parsed ? formatSemver(parsed) : null;
}

export function desktopCanInstallInApp(options: {
  packaged: boolean;
  signed: boolean;
}): boolean {
  return options.packaged && options.signed;
}

export function isAllowedUpdateDownloadUrl(value: string): boolean {
  const url = parseUrl(value);
  if (!url || url.protocol !== "https:") {
    return false;
  }
  if (url.username !== "" || url.password !== "") {
    return false;
  }
  const host = url.hostname.toLowerCase();
  return (
    host === "github.com" ||
    host === "objects.githubusercontent.com" ||
    host === "release-assets.githubusercontent.com" ||
    host.endsWith(".githubusercontent.com")
  );
}

export function selectMacInstallerAsset(
  assets: readonly DesktopGithubAsset[],
  arch: string
): DesktopGithubAsset | null {
  const dmg = assets.find((asset) =>
    isMacInstallerName(asset.name, arch, "dmg")
  );
  if (dmg) {
    return dmg;
  }
  return (
    assets.find((asset) => isMacInstallerName(asset.name, arch, "zip")) ?? null
  );
}

export function isMacInstallerName(
  name: string,
  arch: string,
  ext: "dmg" | "zip"
): boolean {
  if (!name.endsWith(`.${ext}`) || name.includes("blockmap")) {
    return false;
  }
  if (!name.includes("-mac-") && !name.includes("-darwin-")) {
    return false;
  }
  if (name.includes("-universal.")) {
    return true;
  }
  if (arch === "arm64") {
    return name.includes("-arm64.");
  }
  if (arch === "x64") {
    return name.includes("-x64.") || name.includes("-intel.");
  }
  return false;
}

export function parseGithubRelease(raw: unknown): DesktopGithubRelease | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const record = raw as Record<string, unknown>;
  if (
    typeof record.tag_name !== "string" ||
    typeof record.html_url !== "string" ||
    typeof record.draft !== "boolean" ||
    typeof record.prerelease !== "boolean" ||
    !Array.isArray(record.assets)
  ) {
    return null;
  }
  if (!isAllowedUpdateDownloadUrl(record.html_url)) {
    return null;
  }
  const assets: DesktopGithubAsset[] = [];
  for (const item of record.assets) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const asset = item as Record<string, unknown>;
    if (
      typeof asset.name !== "string" ||
      typeof asset.browser_download_url !== "string" ||
      typeof asset.size !== "number" ||
      !Number.isFinite(asset.size)
    ) {
      continue;
    }
    if (!isAllowedUpdateDownloadUrl(asset.browser_download_url)) {
      continue;
    }
    assets.push({
      browser_download_url: asset.browser_download_url,
      name: asset.name,
      size: asset.size,
    });
  }
  return {
    assets,
    draft: record.draft,
    html_url: record.html_url,
    prerelease: record.prerelease,
    tag_name: record.tag_name,
  };
}

export function parseGithubReleases(
  payload: unknown
): DesktopGithubRelease[] | null {
  if (!Array.isArray(payload)) {
    return null;
  }
  const releases: DesktopGithubRelease[] = [];
  for (const item of payload) {
    const parsed = parseGithubRelease(item);
    if (parsed) {
      releases.push(parsed);
    }
  }
  return releases;
}

export function selectLatestDesktopRelease(
  releases: readonly DesktopGithubRelease[]
): { release: DesktopGithubRelease; version: string } | null {
  let best: { release: DesktopGithubRelease; version: string } | null = null;
  for (const release of releases) {
    if (release.draft || release.prerelease) {
      continue;
    }
    const version = parseDesktopReleaseTag(release.tag_name);
    if (!version) {
      continue;
    }
    if (!best || compareSemver(version, best.version) === 1) {
      best = { release, version };
    }
  }
  return best;
}

export function updateErrorMessage(code: DesktopUpdateErrorCode): string {
  switch (code) {
    case "apply-failed":
      return "ダウンロードしたファイルを開けませんでした。ダウンロードフォルダを確認してください。";
    case "bad-payload":
      return "更新情報の形式が正しくありません。";
    case "busy":
      return "別の更新処理が進行中です。";
    case "download-failed":
      return "ダウンロードに失敗しました。GitHub Releases から手動で入手してください。";
    case "network":
      return "アップデートを確認できませんでした。ネットワーク接続を確認してください。";
    case "no-release":
      return "配布リリースが見つかりませんでした。GitHub Releases から手動で確認できます。";
  }
}

export function describeUpdateState(
  state: Omit<DesktopUpdateState, "message">
): string {
  switch (state.phase) {
    case "available":
      return state.availableVersion
        ? `バージョン ${state.availableVersion} が利用できます。`
        : "新しいバージョンが利用できます。";
    case "checking":
      return "アップデートを確認しています…";
    case "downloading":
      return state.downloadPercent === null
        ? "ダウンロードしています…"
        : `ダウンロード中… ${state.downloadPercent}%`;
    case "error":
      return state.error ?? "アップデートに失敗しました。";
    case "idle":
      return "アップデートを確認できます。";
    case "ready":
      return state.canInstallInApp
        ? "ダウンロードが完了しました。再起動すると適用されます。"
        : "ダウンロードが完了しました。ディスクイメージを開いて Applications にコピーしてください。";
    case "upToDate":
      return `最新版です（${state.currentVersion}）。`;
  }
}

export function withUpdateMessage(
  state: Omit<DesktopUpdateState, "message">
): DesktopUpdateState {
  return { ...state, message: describeUpdateState(state) };
}

export function isDesktopUpdateCheckReason(
  value: unknown
): value is DesktopUpdateCheckReason {
  return typeof value === "string" && CHECK_REASONS.has(value);
}

export function isDesktopUpdateState(
  value: unknown
): value is DesktopUpdateState {
  if (!value || typeof value !== "object") {
    return false;
  }
  const state = value as Record<string, unknown>;
  if (
    typeof state.phase !== "string" ||
    !PHASE_SET.has(state.phase) ||
    typeof state.currentVersion !== "string" ||
    typeof state.autoUpdateEnabled !== "boolean" ||
    typeof state.canDownload !== "boolean" ||
    typeof state.canInstallInApp !== "boolean" ||
    typeof state.packaged !== "boolean" ||
    typeof state.platform !== "string" ||
    typeof state.message !== "string"
  ) {
    return false;
  }
  if (
    state.availableVersion !== null &&
    typeof state.availableVersion !== "string"
  ) {
    return false;
  }
  if (state.releaseUrl !== null && typeof state.releaseUrl !== "string") {
    return false;
  }
  if (
    state.downloadedPath !== null &&
    typeof state.downloadedPath !== "string"
  ) {
    return false;
  }
  if (state.error !== null && typeof state.error !== "string") {
    return false;
  }
  if (
    state.downloadPercent !== null &&
    (typeof state.downloadPercent !== "number" ||
      !Number.isFinite(state.downloadPercent))
  ) {
    return false;
  }
  return (
    state.lastCheckReason === null ||
    isDesktopUpdateCheckReason(state.lastCheckReason)
  );
}

export function supportsDesktopUpdater(
  bridge: {
    getUpdateState?: unknown;
    checkForUpdates?: unknown;
  } | null
): boolean {
  return (
    bridge !== null &&
    typeof bridge.getUpdateState === "function" &&
    typeof bridge.checkForUpdates === "function"
  );
}
