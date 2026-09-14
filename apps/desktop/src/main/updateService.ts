import { createWriteStream, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

import {
  DEFAULT_AUTO_UPDATE_ENABLED,
  DESKTOP_GITHUB_API_RELEASES,
  DESKTOP_RELEASES_URL,
  desktopCanInstallInApp,
  isAllowedUpdateDownloadUrl,
  isNewerVersion,
  parseGithubReleases,
  selectLatestDesktopRelease,
  selectMacInstallerAsset,
  updateErrorMessage,
  withUpdateMessage,
} from "@tahcode/core/desktop";
import type {
  DesktopUpdateCheckReason,
  DesktopUpdateState,
} from "@tahcode/core/desktop";

const CHECK_TIMEOUT_MS = 20_000;
const DOWNLOAD_TIMEOUT_MS = 10 * 60 * 1000;

export interface PendingDesktopAsset {
  name: string;
  releaseUrl: string;
  url: string;
  version: string;
}

export interface UpdateServiceDeps {
  downloadsDir: () => string;
  fetch: typeof fetch;
  getArch: () => string;
  getPlatform: () => string;
  getVersion: () => string;
  isPackaged: () => boolean;
  isSigned: () => boolean;
  openExternal: (url: string) => Promise<void>;
  openPath: (filePath: string) => Promise<string>;
  readAutoUpdateEnabled: () => boolean;
  writeAutoUpdateEnabled: (enabled: boolean) => void;
}

export interface DesktopUpdateService {
  apply: () => Promise<DesktopUpdateState>;
  check: (reason: DesktopUpdateCheckReason) => Promise<DesktopUpdateState>;
  download: () => Promise<DesktopUpdateState>;
  getPendingAsset: () => PendingDesktopAsset | null;
  getState: () => DesktopUpdateState;
  isRendererUiReady: () => boolean;
  markRendererUiReady: (ready: boolean) => void;
  onState: (listener: (state: DesktopUpdateState) => void) => () => void;
  openLatestRelease: () => Promise<void>;
  setAutoUpdate: (enabled: boolean) => DesktopUpdateState;
}

interface MutableFields {
  availableVersion: string | null;
  canDownload: boolean;
  downloadPercent: number | null;
  downloadedPath: string | null;
  error: string | null;
  lastCheckReason: DesktopUpdateCheckReason | null;
  phase: DesktopUpdateState["phase"];
  releaseUrl: string | null;
}

export function createUpdateService(
  deps: UpdateServiceDeps
): DesktopUpdateService {
  let autoUpdateEnabled =
    deps.readAutoUpdateEnabled() ?? DEFAULT_AUTO_UPDATE_ENABLED;
  let pending: PendingDesktopAsset | null = null;
  let busy = false;
  let rendererUiReady = false;
  const listeners = new Set<(state: DesktopUpdateState) => void>();
  let fields: MutableFields = {
    availableVersion: null,
    canDownload: false,
    downloadPercent: null,
    downloadedPath: null,
    error: null,
    lastCheckReason: null,
    phase: "idle",
    releaseUrl: DESKTOP_RELEASES_URL,
  };

  const emit = (
    next: Partial<MutableFields> & Pick<MutableFields, "phase">
  ): DesktopUpdateState => {
    fields = { ...fields, ...next };
    const state = snapshot();
    for (const listener of listeners) {
      listener(state);
    }
    return state;
  };

  const snapshot = (): DesktopUpdateState =>
    withUpdateMessage({
      availableVersion: fields.availableVersion,
      autoUpdateEnabled,
      canDownload: fields.canDownload,
      canInstallInApp: desktopCanInstallInApp({
        packaged: deps.isPackaged(),
        signed: deps.isSigned(),
      }),
      currentVersion: deps.getVersion(),
      downloadPercent: fields.downloadPercent,
      downloadedPath: fields.downloadedPath,
      error: fields.error,
      lastCheckReason: fields.lastCheckReason,
      packaged: deps.isPackaged(),
      phase: fields.phase,
      platform: deps.getPlatform(),
      releaseUrl: fields.releaseUrl,
    });

  const fail = (
    code: Parameters<typeof updateErrorMessage>[0],
    reason: DesktopUpdateCheckReason | null
  ): DesktopUpdateState =>
    emit({
      error: updateErrorMessage(code),
      lastCheckReason: reason ?? fields.lastCheckReason,
      phase: "error",
    });

  const check = async (
    reason: DesktopUpdateCheckReason
  ): Promise<DesktopUpdateState> => {
    if (busy && fields.phase === "downloading") {
      return snapshot();
    }
    if (busy) {
      return fail("busy", reason);
    }
    busy = true;
    emit({
      error: null,
      lastCheckReason: reason,
      phase: "checking",
    });
    try {
      const response = await deps.fetch(
        `${DESKTOP_GITHUB_API_RELEASES}?per_page=30`,
        {
          headers: {
            Accept: "application/vnd.github+json",
            "User-Agent": `tahcode-desktop/${deps.getVersion()}`,
          },
          signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
        }
      );
      if (!response.ok) {
        return fail("network", reason);
      }
      const payload: unknown = await response.json();
      const releases = parseGithubReleases(payload);
      if (!releases) {
        return fail("bad-payload", reason);
      }
      const latest = selectLatestDesktopRelease(releases);
      if (!latest) {
        return fail("no-release", reason);
      }
      const releaseUrl = latest.release.html_url;
      if (!isNewerVersion(latest.version, deps.getVersion())) {
        pending = null;
        return emit({
          availableVersion: null,
          canDownload: false,
          downloadPercent: null,
          downloadedPath: null,
          error: null,
          lastCheckReason: reason,
          phase: "upToDate",
          releaseUrl,
        });
      }
      const asset =
        deps.getPlatform() === "darwin"
          ? selectMacInstallerAsset(latest.release.assets, deps.getArch())
          : null;
      pending = asset
        ? {
            name: asset.name,
            releaseUrl,
            url: asset.browser_download_url,
            version: latest.version,
          }
        : null;
      return emit({
        availableVersion: latest.version,
        canDownload: pending !== null,
        downloadPercent: null,
        downloadedPath: null,
        error: null,
        lastCheckReason: reason,
        phase: "available",
        releaseUrl,
      });
    } catch {
      return fail("network", reason);
    } finally {
      busy = false;
    }
  };

  const download = async (): Promise<DesktopUpdateState> => {
    if (fields.phase === "downloading" || busy) {
      return snapshot();
    }
    const asset = pending;
    if (!asset || !isAllowedUpdateDownloadUrl(asset.url)) {
      return fail("download-failed", fields.lastCheckReason);
    }
    busy = true;
    emit({
      downloadPercent: 0,
      error: null,
      phase: "downloading",
    });
    const dest = join(deps.downloadsDir(), asset.name);
    try {
      mkdirSync(dirname(dest), { recursive: true });
      const response = await deps.fetch(asset.url, {
        headers: { "User-Agent": `tahcode-desktop/${deps.getVersion()}` },
        redirect: "follow",
        signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
      });
      if (!response.ok || !response.body) {
        return fail("download-failed", fields.lastCheckReason);
      }
      await writeResponseToFile(response, dest, (percent) => {
        emit({
          downloadPercent: percent,
          phase: "downloading",
        });
      });
      return emit({
        downloadPercent: 100,
        downloadedPath: dest,
        error: null,
        phase: "ready",
      });
    } catch {
      return fail("download-failed", fields.lastCheckReason);
    } finally {
      busy = false;
    }
  };

  const apply = async (): Promise<DesktopUpdateState> => {
    const filePath = fields.downloadedPath;
    if (!filePath) {
      return fail("apply-failed", fields.lastCheckReason);
    }
    const openError = await deps.openPath(filePath);
    if (openError.length > 0) {
      return fail("apply-failed", fields.lastCheckReason);
    }
    return snapshot();
  };

  return {
    apply,
    check,
    download,
    getPendingAsset: () => pending,
    getState: snapshot,
    isRendererUiReady: () => rendererUiReady,
    markRendererUiReady: (ready) => {
      rendererUiReady = ready;
    },
    onState: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    openLatestRelease: async () => {
      const url = fields.releaseUrl ?? DESKTOP_RELEASES_URL;
      if (isAllowedUpdateDownloadUrl(url)) {
        await deps.openExternal(url);
      }
    },
    setAutoUpdate: (enabled) => {
      autoUpdateEnabled = enabled;
      deps.writeAutoUpdateEnabled(enabled);
      return emit({ phase: fields.phase });
    },
  };
}

async function writeResponseToFile(
  response: Response,
  dest: string,
  onPercent: (percent: number) => void
): Promise<void> {
  const total = Number(response.headers.get("content-length") ?? 0);
  const file = createWriteStream(dest);
  const reader = response.body?.getReader();
  if (!reader) {
    file.close();
    throw new Error("empty body");
  }
  let received = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      if (!value) {
        continue;
      }
      received += value.byteLength;
      await writeChunk(file, value);
      if (total > 0) {
        onPercent(Math.min(99, Math.round((received / total) * 100)));
      }
    }
  } catch (error) {
    file.destroy();
    throw error;
  }
  await closeFile(file);
}

function writeChunk(
  file: ReturnType<typeof createWriteStream>,
  chunk: Uint8Array
): Promise<void> {
  return new Promise((resolve, reject) => {
    file.write(chunk, (error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

function closeFile(file: ReturnType<typeof createWriteStream>): Promise<void> {
  return new Promise((resolve, reject) => {
    file.end((error?: Error | null) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}
