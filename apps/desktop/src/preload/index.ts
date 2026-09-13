import { contextBridge } from "electron";
import {
  DESKTOP_BRIDGE_KEY,
  desktopOAuthRedirectTo,
  type TahcodeDesktopBridge,
  type OAuthStrategy,
} from "@tahcode/core/desktop";

/* ─────────────────────────────────────────────────────────
 * window.tahcodeDesktop — the only surface the web app sees.
 *
 * Runs sandboxed with contextIsolation; nothing here touches Node APIs.
 * The web app (src/lib/desktop.ts) treats the whole object as optional so
 * the same bundle keeps working in a plain browser. The shape is
 * TahcodeDesktopBridge from @tahcode/core/desktop.
 * ───────────────────────────────────────────────────────── */

function argValue(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

const oauthStrategy: OAuthStrategy = argValue("tahcode-oauth") === "in-app" ? "in-app" : "system-browser";

const bridge: TahcodeDesktopBridge = {
  version: process.env.TAHCODE_DESKTOP_VERSION ?? "0.0.0",
  platform: process.platform,
  oauthStrategy,
  oauthRedirectTo: (next) => (oauthStrategy === "system-browser" ? desktopOAuthRedirectTo(next) : null),
};

contextBridge.exposeInMainWorld(DESKTOP_BRIDGE_KEY, bridge);
