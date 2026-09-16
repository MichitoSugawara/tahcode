import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  DEFAULT_AUTO_UPDATE_ENABLED,
  DESKTOP_GITHUB_API_RELEASES,
  DESKTOP_GITHUB_OWNER,
  DESKTOP_GITHUB_REPO,
  DESKTOP_RELEASES_URL,
  UPDATE_UI,
  compareSemver,
  describeUpdateState,
  desktopCanInstallInApp,
  desktopReleaseTag,
  isAllowedUpdateDownloadUrl,
  isDesktopUpdateState,
  isMacInstallerName,
  isNewerVersion,
  parseDesktopReleaseTag,
  parseGithubReleases,
  parseSemver,
  selectLatestDesktopRelease,
  selectMacInstallerAsset,
  supportsDesktopUpdater,
  updateErrorMessage,
} from "@tahcode/core/desktop";
import { describe, expect, it } from "vitest";

import { parsePersistedSettings } from "../apps/desktop/src/main/config";
import { createUpdateService } from "../apps/desktop/src/main/updateService";
import type { UpdateServiceDeps } from "../apps/desktop/src/main/updateService";

const release = {
  assets: [
    {
      browser_download_url:
        "https://github.com/MichitoSugawara/tahcode-releases/releases/download/desktop-v0.2.0/tahcode-0.2.0-mac-arm64.dmg",
      name: "tahcode-0.2.0-mac-arm64.dmg",
      size: 120,
    },
    {
      browser_download_url:
        "https://github.com/MichitoSugawara/tahcode-releases/releases/download/desktop-v0.2.0/tahcode-0.2.0-mac-arm64.zip",
      name: "tahcode-0.2.0-mac-arm64.zip",
      size: 110,
    },
  ],
  draft: false,
  html_url:
    "https://github.com/MichitoSugawara/tahcode-releases/releases/tag/desktop-v0.2.0",
  prerelease: false,
  tag_name: "desktop-v0.2.0",
};

function serviceDeps(overrides: Partial<UpdateServiceDeps>): UpdateServiceDeps {
  return {
    downloadsDir: () => tmpdir(),
    fetch: async () => new Response("[]", { status: 200 }),
    getArch: () => "arm64",
    getPlatform: () => "darwin",
    getVersion: () => "0.1.0",
    isPackaged: () => true,
    isSigned: () => false,
    openExternal: async () => {
      /* unused */
    },
    openPath: async () => "",
    readAutoUpdateEnabled: () => false,
    writeAutoUpdateEnabled: () => {
      /* unused */
    },
    ...overrides,
  };
}

describe("desktop update helpers", () => {
  it("reads installer releases from the public tahcode-releases repo", () => {
    expect(DESKTOP_GITHUB_OWNER).toBe("MichitoSugawara");
    expect(DESKTOP_GITHUB_REPO).toBe("tahcode-releases");
    expect(DESKTOP_RELEASES_URL).toBe(
      "https://github.com/MichitoSugawara/tahcode-releases/releases"
    );
    expect(DESKTOP_GITHUB_API_RELEASES).toBe(
      "https://api.github.com/repos/MichitoSugawara/tahcode-releases/releases"
    );
  });

  it("parses desktop-v tags", () => {
    expect(parseSemver("0.1.0")).toStrictEqual([0, 1, 0]);
    expect(desktopReleaseTag("0.2.0")).toBe("desktop-v0.2.0");
    expect(parseDesktopReleaseTag("desktop-v0.2.0")).toBe("0.2.0");
    expect(parseDesktopReleaseTag("v0.2.0")).toBeNull();
  });

  it("compares semver newest-first", () => {
    expect(compareSemver("0.2.0", "0.1.0")).toBe(1);
    expect(isNewerVersion("0.2.0", "0.1.0")).toBeTruthy();
    expect(isNewerVersion("0.1.0", "0.1.0")).toBeFalsy();
  });

  it("picks the newest desktop-v release and prefers a .dmg", () => {
    const older = {
      ...release,
      html_url:
        "https://github.com/MichitoSugawara/tahcode-releases/releases/tag/desktop-v0.1.0",
      tag_name: "desktop-v0.1.0",
    };
    const parsed = parseGithubReleases([
      older,
      release,
      { ...release, draft: true, tag_name: "desktop-v9.0.0" },
      {
        ...release,
        html_url: "https://evil.example/releases/pwned",
        tag_name: "desktop-v8.0.0",
      },
    ]);
    expect(parsed).not.toBeNull();
    const latest = selectLatestDesktopRelease(parsed ?? []);
    expect(latest?.version).toBe("0.2.0");
    expect(selectMacInstallerAsset(release.assets, "arm64")?.name).toBe(
      "tahcode-0.2.0-mac-arm64.dmg"
    );
    expect(
      isMacInstallerName("tahcode-0.2.0-mac-x64.dmg", "arm64", "dmg")
    ).toBeFalsy();
  });

  it("allows only GitHub download URLs", () => {
    expect(
      isAllowedUpdateDownloadUrl(
        "https://github.com/MichitoSugawara/tahcode-releases/releases/tag/desktop-v0.2.0"
      )
    ).toBeTruthy();
    expect(
      isAllowedUpdateDownloadUrl(
        "https://objects.githubusercontent.com/github-production-release-asset-2e65be/file"
      )
    ).toBeTruthy();
    expect(
      isAllowedUpdateDownloadUrl("https://evil.example/payload")
    ).toBeFalsy();
    expect(
      isAllowedUpdateDownloadUrl(
        "https://user:pass@github.com/MichitoSugawara/tahcode-releases"
      )
    ).toBeFalsy();
  });

  it("describes an available update in Japanese", () => {
    expect(
      describeUpdateState({
        availableVersion: "0.2.0",
        autoUpdateEnabled: false,
        canDownload: true,
        canInstallInApp: false,
        currentVersion: "0.1.0",
        downloadPercent: null,
        downloadedPath: null,
        error: null,
        lastCheckReason: "user",
        packaged: true,
        phase: "available",
        platform: "darwin",
        releaseUrl: DESKTOP_RELEASES_URL,
      })
    ).toBe("バージョン 0.2.0 が利用できます。");
    expect(updateErrorMessage("network")).toContain("ネットワーク");
    expect(UPDATE_UI.check).toBe("アップデートを確認");
    expect(UPDATE_UI.updateNow).toBe("今すぐ更新");
  });

  it("keeps auto-update and in-app install off for unsigned builds", () => {
    expect(
      desktopCanInstallInApp({ packaged: true, signed: false })
    ).toBeFalsy();
    expect(DEFAULT_AUTO_UPDATE_ENABLED).toBeFalsy();
  });

  it("enables in-app replace only when the packaged build is signed", () => {
    expect(
      desktopCanInstallInApp({ packaged: true, signed: true })
    ).toBeTruthy();
    expect(
      desktopCanInstallInApp({ packaged: false, signed: true })
    ).toBeFalsy();
  });

  it("feature-detects the updater on older shells", () => {
    expect(supportsDesktopUpdater(null)).toBeFalsy();
    expect(
      supportsDesktopUpdater({
        version: "0.1.0",
      } as Parameters<typeof supportsDesktopUpdater>[0])
    ).toBeFalsy();
    expect(
      supportsDesktopUpdater({
        checkForUpdates: () => Promise.resolve({} as never),
        getUpdateState: () => Promise.resolve({} as never),
      })
    ).toBeTruthy();
  });

  it("accepts a complete update state and rejects a partial one", () => {
    expect(
      isDesktopUpdateState({
        availableVersion: null,
        autoUpdateEnabled: false,
        canDownload: false,
        canInstallInApp: false,
        currentVersion: "0.1.0",
        downloadPercent: null,
        downloadedPath: null,
        error: null,
        lastCheckReason: null,
        message: "アップデートを確認できます。",
        packaged: false,
        phase: "idle",
        platform: "darwin",
        releaseUrl: DESKTOP_RELEASES_URL,
      })
    ).toBeTruthy();
    expect(isDesktopUpdateState({ phase: "idle" })).toBeFalsy();
  });
});

describe("persisted auto-update setting", () => {
  it("defaults off and only accepts a boolean", () => {
    expect(parsePersistedSettings(null)).toStrictEqual({});
    expect(
      parsePersistedSettings({
        autoUpdateEnabled: true,
        preset: "staging",
      }).autoUpdateEnabled
    ).toBeTruthy();
    expect(
      parsePersistedSettings({ autoUpdateEnabled: "yes" }).autoUpdateEnabled
    ).toBeUndefined();
  });
});

describe("update service", () => {
  it("starts idle, unsigned, and with auto-update off", () => {
    const service = createUpdateService(serviceDeps({}));
    expect(service.getState().phase).toBe("idle");
    expect(service.getState().autoUpdateEnabled).toBeFalsy();
    expect(service.getState().canInstallInApp).toBeFalsy();
  });

  it("tracks whether the renderer mounted the update UI", () => {
    const service = createUpdateService(serviceDeps({}));
    expect(service.isRendererUiReady()).toBeFalsy();
    service.markRendererUiReady(true);
    expect(service.isRendererUiReady()).toBeTruthy();
    service.markRendererUiReady(false);
    expect(service.isRendererUiReady()).toBeFalsy();
  });

  it("reports an available GitHub release", async () => {
    const service = createUpdateService(
      serviceDeps({
        fetch: async () =>
          new Response(JSON.stringify([release]), {
            headers: { "content-type": "application/json" },
            status: 200,
          }),
      })
    );
    const checked = await service.check("user");
    expect(checked.phase).toBe("available");
    expect(checked.availableVersion).toBe("0.2.0");
    expect(checked.canDownload).toBeTruthy();
    expect(checked.message).toContain("0.2.0");
  });

  it("downloads the dmg and opens it", async () => {
    const downloads = mkdtempSync(join(tmpdir(), "tahcode-update-"));
    const opened: string[] = [];
    const payload = new Uint8Array([1, 2, 3, 4]);
    const service = createUpdateService(
      serviceDeps({
        downloadsDir: () => downloads,
        fetch: async (input) => {
          const url = String(input);
          if (url.includes("api.github.com")) {
            return new Response(JSON.stringify([release]), {
              headers: { "content-type": "application/json" },
              status: 200,
            });
          }
          return new Response(payload, {
            headers: { "content-length": String(payload.byteLength) },
            status: 200,
          });
        },
        openPath: async (filePath) => {
          opened.push(filePath);
          return "";
        },
      })
    );
    await service.check("user");
    const downloaded = await service.download();
    expect(downloaded.phase).toBe("ready");
    expect(downloaded.downloadedPath).toBeTruthy();
    expect(readFileSync(downloaded.downloadedPath ?? "")).toStrictEqual(
      Buffer.from(payload)
    );
    const applied = await service.apply();
    expect(applied.phase).toBe("ready");
    expect(opened.some((item) => item.endsWith(".dmg"))).toBeTruthy();
  });

  it("keeps the download-dmg apply path when signed (canInstallInApp is on)", async () => {
    const downloads = mkdtempSync(join(tmpdir(), "tahcode-update-signed-"));
    const opened: string[] = [];
    const payload = new Uint8Array([9, 8, 7, 6]);
    const service = createUpdateService(
      serviceDeps({
        downloadsDir: () => downloads,
        fetch: async (input) => {
          const url = String(input);
          if (url.includes("api.github.com")) {
            return new Response(JSON.stringify([release]), {
              headers: { "content-type": "application/json" },
              status: 200,
            });
          }
          return new Response(payload, {
            headers: { "content-length": String(payload.byteLength) },
            status: 200,
          });
        },
        isSigned: () => true,
        openPath: async (filePath) => {
          opened.push(filePath);
          return "";
        },
      })
    );
    expect(service.getState().canInstallInApp).toBeTruthy();
    await service.check("user");
    const downloaded = await service.download();
    expect(downloaded.phase).toBe("ready");
    expect(downloaded.message).toContain("再起動");
    const applied = await service.apply();
    expect(applied.phase).toBe("ready");
    expect(opened.some((item) => item.endsWith(".dmg"))).toBeTruthy();
  });

  it("persists the auto-update flag", () => {
    let storedAuto = false;
    const service = createUpdateService(
      serviceDeps({
        readAutoUpdateEnabled: () => storedAuto,
        writeAutoUpdateEnabled: (enabled) => {
          storedAuto = enabled;
        },
      })
    );
    const enabled = service.setAutoUpdate(true);
    expect(enabled.autoUpdateEnabled).toBeTruthy();
    expect(storedAuto).toBeTruthy();
  });

  it("reports up to date when the latest tag is not newer", async () => {
    const service = createUpdateService(
      serviceDeps({
        fetch: async () =>
          new Response(JSON.stringify([release]), {
            headers: { "content-type": "application/json" },
            status: 200,
          }),
        getVersion: () => "0.2.0",
        isPackaged: () => false,
      })
    );
    const checked = await service.check("auto");
    expect(checked.phase).toBe("upToDate");
    expect(checked.lastCheckReason).toBe("auto");
  });

  it("maps a network failure to a Japanese error", async () => {
    const service = createUpdateService(
      serviceDeps({
        fetch: async () => {
          throw new Error("offline");
        },
      })
    );
    const checked = await service.check("user");
    expect(checked.phase).toBe("error");
    expect(checked.error).toBe(updateErrorMessage("network"));
  });
});
