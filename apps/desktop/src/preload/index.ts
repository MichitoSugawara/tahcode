import { contextBridge } from "electron";
import {
  DESKTOP_BRIDGE_KEY,
  desktopOAuthRedirectTo,
  type DalecodeDesktopBridge,
  type OAuthStrategy,
} from "@dalecode/core/desktop";

/* ─────────────────────────────────────────────────────────
 * window.dalecodeDesktop — the only surface the web app sees.
 *
 * Runs sandboxed with contextIsolation; nothing here touches Node APIs.
 * The web app (src/lib/desktop.ts) treats the whole object as optional so
 * the same bundle keeps working in a plain browser. The shape is
 * DalecodeDesktopBridge from @dalecode/core/desktop.
 * ───────────────────────────────────────────────────────── */

function argValue(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

const oauthStrategy: OAuthStrategy = argValue("dalecode-oauth") === "in-app" ? "in-app" : "system-browser";

const bridge: DalecodeDesktopBridge = {
  version: process.env.DALECODE_DESKTOP_VERSION ?? "0.0.0",
  platform: process.platform,
  oauthStrategy,
  oauthRedirectTo: (next) => (oauthStrategy === "system-browser" ? desktopOAuthRedirectTo(next) : null),
};

contextBridge.exposeInMainWorld(DESKTOP_BRIDGE_KEY, bridge);
