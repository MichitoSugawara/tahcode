import { writeFileSync } from "node:fs";
import path from "node:path";

import { app, BrowserWindow, nativeTheme, session, shell } from "electron";

import {
  DEEP_LINK_SCHEME,
  isAppOrigin,
  readSettings,
  resolveConfig,
  SERVER_PRESETS,
  writeSettings,
} from "./config";
import type { ServerPreset, ShellConfig } from "./config";
import { findDeepLink, loginReturnUrl, parseAuthCallback } from "./deepLink";
import { fallbackPage } from "./fallback";
import { installMenu } from "./menu";

/* ─────────────────────────────────────────────────────────
 * tahcode desktop — a hardened BrowserWindow around the web app.
 *
 * - Loads the deployed web app (production by default); nothing is bundled
 *   except this process and the preload bridge.
 * - Navigation is fenced to the app origin. Anything else (Google OAuth,
 *   links in chat) opens in the user's browser.
 * - Google sign-in returns through tahcode://auth/callback; we translate it
 *   to the web app's own /login?code=… so Convex Auth completes the exchange
 *   with the verifier it stored in this window's localStorage.
 * ───────────────────────────────────────────────────────── */

const isMac = process.platform === "darwin";
const userData = app.getPath("userData");
let config: ShellConfig;
try {
  config = resolveConfig(process.argv, process.env, userData);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  app.exit(2);
  throw error;
}

let win: BrowserWindow | null = null;
let pendingDeepLink: string | null = findDeepLink(process.argv);
let quitting = false;

const gotLock = app.requestSingleInstanceLock();
if (gotLock) {
  registerProtocolClient();

  app.on("open-url", (event, url) => {
    event.preventDefault();
    handleDeepLink(url);
  });

  app.on("second-instance", (_event, argv) => {
    const link = findDeepLink(argv);
    if (link) {
      handleDeepLink(link);
    }
    focusWindow();
  });

  app.on("window-all-closed", () => {
    if (!isMac) {
      app.quit();
    }
  });

  app.on("activate", () => {
    if (win === null) {
      createWindow();
    } else {
      focusWindow();
    }
  });

  app.on("before-quit", () => {
    quitting = true;
  });

  app.on("web-contents-created", (_event, contents) => {
    /* the policy applies to every WebContents, including any future child */
    contents.setWindowOpenHandler(({ url }) => {
      if (isAppOrigin(config, url)) {
        void win?.loadURL(url);
      } else {
        openExternalIfWeb(url);
      }
      return { action: "deny" };
    });
    contents.on("will-navigate", (event, url) => guardNavigation(event, url));
    contents.on("will-redirect", (event, url) => guardNavigation(event, url));
  });

  void app.whenReady().then(() => {
    hardenSession();
    installMenu(config, () => win, { reload, switchServer });
    createWindow();
    if (pendingDeepLink) {
      const link = pendingDeepLink;
      pendingDeepLink = null;
      handleDeepLink(link);
    }
  });
} else {
  app.quit();
}

function registerProtocolClient(): void {
  /* In dev (`electron .`) the executable is Electron itself, so the scheme has
   * to point at "electron <this dir>". macOS only honours the scheme once it is
   * in the bundle's Info.plist (electron-builder `protocols`), so use
   * `npm run pack` to test the OAuth return there. */
  if (process.defaultApp && process.argv[1]) {
    app.setAsDefaultProtocolClient(DEEP_LINK_SCHEME, process.execPath, [
      path.resolve(process.argv[1]),
    ]);
  } else {
    app.setAsDefaultProtocolClient(DEEP_LINK_SCHEME);
  }
}

function hardenSession(): void {
  const allowedPermissions = new Set([
    "notifications",
    "clipboard-read",
    "clipboard-sanitized-write",
    "fullscreen",
  ]);
  session.defaultSession.setPermissionRequestHandler(
    (_contents, permission, callback) => {
      callback(allowedPermissions.has(permission));
    }
  );
  session.defaultSession.setPermissionCheckHandler((_contents, permission) =>
    allowedPermissions.has(permission)
  );

  if (config.oauthStrategy === "in-app") {
    /* Google refuses sign-in from user agents that advertise an embedded shell. */
    const ua = session.defaultSession
      .getUserAgent()
      .replace(/ Electron\/\S+/, "")
      .replace(/ tahcode(-desktop)?\/\S+/, "");
    session.defaultSession.setUserAgent(ua);
  }
}

function createWindow(): void {
  const settings = readSettings(userData);
  const bounds = settings.bounds;
  win = new BrowserWindow({
    width: bounds?.width ?? 1360,
    height: bounds?.height ?? 860,
    x: bounds?.x,
    y: bounds?.y,
    minWidth: 900,
    minHeight: 600,
    title: "tahcode",
    show: false,
    backgroundColor: nativeTheme.shouldUseDarkColors ? "#0b140b" : "#f4f5f6",
    titleBarStyle: "default",
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: true,
      additionalArguments: [`--tahcode-oauth=${config.oauthStrategy}`],
    },
  });

  win.once("ready-to-show", () => {
    win?.show();
    if (config.openDevTools) {
      win?.webContents.openDevTools({ mode: "detach" });
    }
  });

  win.webContents.on(
    "did-fail-load",
    (_event, code, description, url, isMainFrame) => {
      /* -3 = ERR_ABORTED: a navigation we cancelled ourselves (OAuth hand-off) */
      if (!isMainFrame || code === -3) {
        return;
      }
      console.error(
        `tahcode desktop: failed to load ${url}: ${description} (${code})`
      );
      void win?.loadURL(
        fallbackPage(config.appUrl, `${description} (${code})`)
      );
    }
  );

  win.webContents.on("page-title-updated", (event) => {
    /* keep the OS-level title stable; the web app's own titles live in-page */
    event.preventDefault();
  });

  const persistBounds = () => {
    if (!win || win.isMinimized() || win.isFullScreen()) {
      return;
    }
    writeSettings(userData, {
      ...readSettings(userData),
      bounds: win.getNormalBounds(),
    });
  };
  win.on("resize", persistBounds);
  win.on("move", persistBounds);

  win.on("close", (event) => {
    if (isMac && !quitting) {
      /* macOS convention: red button hides, the app stays in the Dock */
      event.preventDefault();
      win?.hide();
    }
  });
  win.on("closed", () => {
    win = null;
  });

  if (config.smokeScreenshotPath) {
    armSmokeTest(win, config.smokeScreenshotPath);
  }

  void win.loadURL(config.appUrl);
}

function focusWindow(): void {
  if (!win) {
    return;
  }
  if (win.isMinimized()) {
    win.restore();
  }
  if (!win.isVisible()) {
    win.show();
  }
  win.focus();
}

function guardNavigation(
  event: { preventDefault: () => void },
  url: string
): void {
  if (isAppOrigin(config, url)) {
    return;
  }
  if (config.oauthStrategy === "in-app" && url.startsWith("https://")) {
    return;
  }
  event.preventDefault();
  openExternalIfWeb(url);
}

function openExternalIfWeb(url: string): void {
  if (/^https?:\/\//i.test(url)) {
    if (config.smokeScreenshotPath) {
      console.log(
        `tahcode desktop smoke: would open in system browser: ${url}`
      );
      return;
    }
    void shell.openExternal(url);
  } else {
    console.warn(`tahcode desktop: blocked navigation to ${url}`);
  }
}

function handleDeepLink(raw: string): void {
  const callback = parseAuthCallback(raw);
  if (!callback) {
    console.warn(`tahcode desktop: ignoring unknown deep link ${raw}`);
    return;
  }
  if (!app.isReady() || win === null) {
    pendingDeepLink = raw;
    return;
  }
  void win.loadURL(loginReturnUrl(config.appUrl, callback));
  focusWindow();
}

/* Reload the app; from the offline fallback (or any stray page) go home instead. */
function reload(): void {
  if (!win) {
    return;
  }
  if (isAppOrigin(config, win.webContents.getURL())) {
    win.webContents.reload();
  } else {
    void win.loadURL(config.appUrl);
  }
}

function switchServer(preset: ServerPreset): void {
  if (config.preset === preset) {
    return;
  }
  config = { ...config, preset, appUrl: SERVER_PRESETS[preset].url };
  writeSettings(userData, { ...readSettings(userData), preset });
  installMenu(config, () => win, { reload, switchServer });
  void win?.loadURL(config.appUrl);
}

/* CI / VM check: render whatever the shell shows (the app or the offline
 * fallback), write a PNG, exit. Exit code 0 in both cases; the log says which.
 * With TAHCODE_DESKTOP_SMOKE_DEEP_LINK set, the first load is followed by a
 * simulated tahcode:// callback so the OAuth return path is exercised too. */
function armSmokeTest(target: BrowserWindow, outFile: string): void {
  let done = false;
  let simulatedDeepLink = process.env.TAHCODE_DESKTOP_SMOKE_DEEP_LINK || null;
  const finish = async (reason: string) => {
    if (done) {
      return;
    }
    done = true;
    /* give React a moment to paint after the load event */
    await new Promise((resolve) =>
      setTimeout(
        resolve,
        Number(process.env.TAHCODE_DESKTOP_SMOKE_SETTLE_MS ?? 4000)
      )
    );
    try {
      const image = await target.webContents.capturePage();
      writeFileSync(outFile, image.toPNG());
      const url = target.webContents.getURL();
      const state = url.startsWith("data:")
        ? "offline fallback rendered"
        : `showing ${url}`;
      console.log(
        `tahcode desktop smoke: ${reason}; ${state}; screenshot -> ${outFile} (${image.getSize().width}x${image.getSize().height})`
      );
      app.exit(0);
    } catch (error) {
      console.error("tahcode desktop smoke: screenshot failed", error);
      app.exit(1);
    }
  };
  /* optional script run in the page once it is up (e.g. click "Google で続ける") */
  const evalScript = process.env.TAHCODE_DESKTOP_SMOKE_EVAL || null;
  target.webContents.on("did-finish-load", () => {
    const url = target.webContents.getURL();
    if (simulatedDeepLink && !url.startsWith("data:")) {
      const link = simulatedDeepLink;
      simulatedDeepLink = null;
      console.log(
        `tahcode desktop smoke: loaded ${url}; simulating deep link ${link}`
      );
      handleDeepLink(link);
      return;
    }
    void (async () => {
      if (evalScript && !url.startsWith("data:")) {
        await new Promise((resolve) => setTimeout(resolve, 2500));
        try {
          const result: unknown = await target.webContents.executeJavaScript(
            evalScript,
            true
          );
          console.log(
            `tahcode desktop smoke: eval -> ${JSON.stringify(result)}`
          );
        } catch (error) {
          console.error("tahcode desktop smoke: eval failed", error);
        }
      }
      await finish(`load finished for ${url}`);
    })();
  });
  setTimeout(
    () => void finish("timed out waiting for load"),
    Number(process.env.TAHCODE_DESKTOP_SMOKE_TIMEOUT_MS ?? 45000)
  );
}
