import {
  DESKTOP_BRIDGE_KEY,
  DESKTOP_IPC,
  desktopOAuthRedirectTo,
} from "@tahcode/core/desktop";
import type {
  DesktopCliStatus,
  OAuthStrategy,
  RegisterLocalRuntimeRequest,
  RegisterLocalRuntimeResult,
  TahcodeDesktopBridge,
} from "@tahcode/core/desktop";
import { contextBridge, ipcRenderer } from "electron";

/* ─────────────────────────────────────────────────────────
 * window.tahcodeDesktop — the only surface the web app sees.
 *
 * Runs sandboxed with contextIsolation; nothing here touches Node APIs.
 * The web app (src/lib/desktop.ts) treats the whole object as optional so
 * the same bundle keeps working in a plain browser. The shape is
 * TahcodeDesktopBridge from @tahcode/core/desktop.
 *
 * IPC is invoke-only and allow-listed: hostname, CLI status, and the
 * fixed registerLocalRuntime sequence. No arbitrary shell.
 * ───────────────────────────────────────────────────────── */

function argValue(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv
    .find((arg) => arg.startsWith(prefix))
    ?.slice(prefix.length);
}

const oauthStrategy: OAuthStrategy =
  argValue("tahcode-oauth") === "in-app" ? "in-app" : "system-browser";

const bridge: TahcodeDesktopBridge = {
  getCliStatus: () =>
    ipcRenderer.invoke(DESKTOP_IPC.getCliStatus) as Promise<DesktopCliStatus>,
  getHostname: () =>
    ipcRenderer.invoke(DESKTOP_IPC.getHostname) as Promise<string>,
  oauthRedirectTo: (next) =>
    oauthStrategy === "system-browser" ? desktopOAuthRedirectTo(next) : null,
  oauthStrategy,
  platform: process.platform,
  registerLocalRuntime: (request: RegisterLocalRuntimeRequest) =>
    ipcRenderer.invoke(
      DESKTOP_IPC.registerLocalRuntime,
      request
    ) as Promise<RegisterLocalRuntimeResult>,
  version: process.env.TAHCODE_DESKTOP_VERSION ?? "0.0.0",
};

contextBridge.exposeInMainWorld(DESKTOP_BRIDGE_KEY, bridge);
