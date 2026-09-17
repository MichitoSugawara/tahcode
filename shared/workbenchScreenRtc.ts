/**
 * Workbench remote WebRTC contract (TAH-83).
 *
 * Signaling only travels on the existing bridge ↔ Convex path. The
 * browser never opens http://127.0.0.1 on the user's Mac. Video bytes
 * stay on the WebRTC peer connection — Convex stores ephemeral SDP / ICE.
 *
 * Evidence:
 * - JPEG poll ceiling: shared/workbenchScreen.ts SCREEN_POLL_MS = 500
 *   and docs/workbench-tah81.md
 * - t3code local JPEG ~12fps: https://github.com/pingdotgg/t3code/pull/4397
 * - Beautiful UI Agent Screen look: https://www.beautifului.dev/
 * - Preferred OSS: https://github.com/mpromonet/webrtc-streamer
 *   (`screen://` → WebRTC, HTTP /api/call offer→answer)
 * - Not the product: https://github.com/rustdesk/rustdesk
 */

export const BRIDGE_CAPABILITY_SCREEN_WEBRTC = "screenWebRtc";

export const SCREEN_RTC_SOURCE = "screen://0";
export const SCREEN_RTC_HTTP_HOST = "127.0.0.1";
export const SCREEN_RTC_STUN_HOST = "stun.l.google.com:19302";
export const SCREEN_RTC_STUN_URLS = [`stun:${SCREEN_RTC_STUN_HOST}`] as const;

export const SCREEN_RTC_SDP_MAX = 24_000;
export const SCREEN_RTC_SDP_MIN = 8;
export const SCREEN_RTC_ICE_MAX = 2_000;
export const SCREEN_RTC_ICE_PENDING_CAP = 32;
export const SCREEN_RTC_ICE_CLAIM_MAX = 16;
export const SCREEN_RTC_HISTORY_CAP = 8;
export const SCREEN_RTC_PEER_ID_MAX = 80;
export const SCREEN_RTC_POLL_MS = 200;
export const SCREEN_RTC_START_TIMEOUT_MS = 8_000;

export const SCREEN_RTC_STATUSES = [
  "negotiating",
  "answered",
  "failed",
  "closed",
] as const;

export type ScreenRtcStatus = (typeof SCREEN_RTC_STATUSES)[number];

export const SCREEN_RTC_ICE_FROM = ["browser", "bridge"] as const;

export type ScreenRtcIceFrom = (typeof SCREEN_RTC_ICE_FROM)[number];

export type ScreenRtcIce = {
  candidate: string;
  sdpMLineIndex?: number;
  sdpMid?: string;
};

export type RemoteLiveMode = "empty" | "jpeg" | "webrtc";

export function runtimeHasScreenWebRtc(
  capabilities: readonly string[] | undefined
): boolean {
  return (capabilities ?? []).includes(BRIDGE_CAPABILITY_SCREEN_WEBRTC);
}

export function withScreenWebRtcCapability(
  capabilities: readonly string[],
  available: boolean
): string[] {
  const base = capabilities.filter(
    (item) => item !== BRIDGE_CAPABILITY_SCREEN_WEBRTC
  );
  return available ? [...base, BRIDGE_CAPABILITY_SCREEN_WEBRTC] : [...base];
}

export function isScreenRtcStatus(value: string): value is ScreenRtcStatus {
  return (SCREEN_RTC_STATUSES as readonly string[]).includes(value);
}

export function isScreenRtcIceFrom(value: string): value is ScreenRtcIceFrom {
  return (SCREEN_RTC_ICE_FROM as readonly string[]).includes(value);
}

const PEER_ID_PATTERN = /^[A-Za-z0-9._:-]+$/;

export function sanitizeScreenRtcPeerId(value: string): string | null {
  const trimmed = value.trim();
  if (
    trimmed.length < 1 ||
    trimmed.length > SCREEN_RTC_PEER_ID_MAX ||
    !PEER_ID_PATTERN.test(trimmed)
  ) {
    return null;
  }
  return trimmed;
}

export function parseScreenRtcSdp(value: string): string | null {
  const trimmed = value.replaceAll("\0", "").trim();
  if (
    trimmed.length < SCREEN_RTC_SDP_MIN ||
    trimmed.length > SCREEN_RTC_SDP_MAX
  ) {
    return null;
  }
  if (!trimmed.startsWith("v=0")) {
    return null;
  }
  if (!trimmed.includes("o=")) {
    return null;
  }
  return trimmed;
}

export function sanitizeScreenRtcIce(input: ScreenRtcIce): ScreenRtcIce | null {
  const candidate = input.candidate.replaceAll("\0", "").trim();
  if (candidate.length < 1 || candidate.length > SCREEN_RTC_ICE_MAX) {
    return null;
  }
  if (!candidate.startsWith("candidate:")) {
    return null;
  }
  const next: ScreenRtcIce = { candidate };
  if (typeof input.sdpMid === "string" && input.sdpMid.length > 0) {
    if (input.sdpMid.length > 64) {
      return null;
    }
    next.sdpMid = input.sdpMid;
  }
  if (typeof input.sdpMLineIndex === "number") {
    if (
      !Number.isFinite(input.sdpMLineIndex) ||
      input.sdpMLineIndex < 0 ||
      input.sdpMLineIndex > 64
    ) {
      return null;
    }
    next.sdpMLineIndex = Math.round(input.sdpMLineIndex);
  }
  return next;
}

export function screenRtcLoopbackBind(port: number): string {
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("WebRTC sidecar port is out of range");
  }
  return `${SCREEN_RTC_HTTP_HOST}:${port}`;
}

export function assertScreenRtcHttpBind(bind: string): string {
  if (!bind.startsWith(`${SCREEN_RTC_HTTP_HOST}:`)) {
    throw new Error("WebRTC sidecar must bind 127.0.0.1");
  }
  return bind;
}

/**
 * A MediaStream without `playing` is never a live desktop.
 */
export function screenLiveConnected(input: {
  playing: boolean;
  stream?: { id?: string } | null;
}): boolean {
  return Boolean(input.playing && input.stream);
}

export function pickRemoteLiveMode(input: {
  hasScreenWebRtc: boolean;
  jpegReady: boolean;
  playing: boolean;
  stream?: { id?: string } | null;
}): RemoteLiveMode {
  if (screenLiveConnected(input) && input.hasScreenWebRtc) {
    return "webrtc";
  }
  if (input.jpegReady) {
    return "jpeg";
  }
  return "empty";
}

export function screenRtcUpgradeMessage(): string {
  return "このマシンの tahcode は WebRTC 画面に未対応です。`npm i -g tahcode@latest && tahcode restart`";
}

export function screenRtcMissingSidecarMessage(): string {
  return "webrtc-streamer が見つかりません。PATH か TAHCODE_WEBRTC_STREAMER、または ~/.tahcode/bin/webrtc-streamer を置いて tahcode restart してください。";
}

export function screenRtcJpegFallbackLabel(): string {
  return "JPEG（低速）";
}
