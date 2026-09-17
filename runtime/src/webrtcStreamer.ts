import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { createServer } from "node:net";
import { homedir } from "node:os";
import path from "node:path";

import {
  assertScreenRtcHttpBind,
  parseScreenRtcSdp,
  sanitizeScreenRtcIce,
  sanitizeScreenRtcPeerId,
  SCREEN_RTC_HTTP_HOST,
  SCREEN_RTC_SOURCE,
  SCREEN_RTC_START_TIMEOUT_MS,
  SCREEN_RTC_STUN_HOST,
  screenRtcLoopbackBind,
  screenRtcMissingSidecarMessage,
} from "../../shared/workbenchScreenRtc.ts";
import type { ScreenRtcIce } from "../../shared/workbenchScreenRtc.ts";
import { resolveOnPath } from "./screenCapture.ts";

export type StreamerFetch = (
  url: string,
  init?: RequestInit
) => Promise<Response>;

const STREAMER_NAME = "webrtc-streamer";

export function resolveWebRtcStreamer(
  env: NodeJS.ProcessEnv = process.env,
  which: (bin: string) => string | null = resolveOnPath,
  home = homedir()
): string | null {
  const fromEnv = env.TAHCODE_WEBRTC_STREAMER?.trim();
  if (fromEnv && existsSync(fromEnv)) {
    return fromEnv;
  }
  const onPath = which(STREAMER_NAME);
  if (onPath) {
    return onPath;
  }
  const extras = [
    path.join(home, ".tahcode", "bin", STREAMER_NAME),
    "/opt/homebrew/bin/webrtc-streamer",
    "/usr/local/bin/webrtc-streamer",
  ];
  for (const candidate of extras) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

/**
 * webrtc-streamer argv (v0.8.20 Darwin/Linux Release `--help` + README).
 *
 * `-H/--http` is a required bind (`arg`). Keep it `127.0.0.1:port`.
 * `-s/--stun` is an **external** STUN (`[=arg]`). `-S/--stun-server`
 * starts an embedded STUN listener — never use that for Google STUN.
 * `-a/--audio-layer` is the audio capture layer; omit the value for
 * dummy audio. Screen source is a positional `[urls...]` (`screen://0`).
 *
 * cxxopts optional flags do **not** consume the next argv token:
 * `-s host` registers `host` as a video URL and uses implicit
 * `0.0.0.0:3478`. `-s=host` / `-a=` fail (`Option '=' does not exist`).
 * `-shost` is clustered shorts. Attach the STUN value as `--stun=host`.
 * A bare `-a` then the positional URL is dummy audio + `screen://0`.
 */
export function webrtcStreamerArgv(input: {
  httpBind: string;
  source?: string;
  stun?: string;
}): string[] {
  const httpBind = assertScreenRtcHttpBind(input.httpBind);
  const stun = input.stun ?? SCREEN_RTC_STUN_HOST;
  return [
    "-H",
    httpBind,
    `--stun=${stun}`,
    "-a",
    input.source ?? SCREEN_RTC_SOURCE,
  ];
}

export async function allocateLoopbackPort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, SCREEN_RTC_HTTP_HOST, () => {
      resolve();
    });
  });
  const address = server.address();
  const port =
    typeof address === "object" && address !== null ? address.port : 0;
  await new Promise<void>((resolve) => {
    server.close(() => {
      resolve();
    });
  });
  if (port < 1) {
    throw new Error("Could not allocate a loopback port for WebRTC sidecar");
  }
  return port;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

export function readStreamerAnswer(payload: unknown): string | null {
  const record = asRecord(payload);
  if (!record) {
    return parseScreenRtcSdp(typeof payload === "string" ? payload : "");
  }
  const sdp = record.sdp;
  return typeof sdp === "string" ? parseScreenRtcSdp(sdp) : null;
}

export function readStreamerIceList(payload: unknown): ScreenRtcIce[] {
  if (!Array.isArray(payload)) {
    return [];
  }
  const out: ScreenRtcIce[] = [];
  for (const item of payload) {
    const record = asRecord(item);
    if (!record || typeof record.candidate !== "string") {
      continue;
    }
    const clean = sanitizeScreenRtcIce({
      candidate: record.candidate,
      sdpMLineIndex:
        typeof record.sdpMLineIndex === "number"
          ? record.sdpMLineIndex
          : undefined,
      sdpMid: typeof record.sdpMid === "string" ? record.sdpMid : undefined,
    });
    if (clean) {
      out.push(clean);
    }
  }
  return out;
}

export async function streamerCall(input: {
  baseUrl: string;
  fetchImpl?: StreamerFetch;
  offerSdp: string;
  peerId: string;
  url?: string;
}): Promise<string> {
  const peerId = sanitizeScreenRtcPeerId(input.peerId);
  const offerSdp = parseScreenRtcSdp(input.offerSdp);
  if (!peerId || !offerSdp) {
    throw new Error("Invalid WebRTC offer for sidecar");
  }
  const source = encodeURIComponent(input.url ?? SCREEN_RTC_SOURCE);
  const response = await (input.fetchImpl ?? fetch)(
    `${input.baseUrl}/api/call?peerid=${encodeURIComponent(peerId)}&url=${source}`,
    {
      body: JSON.stringify({ sdp: offerSdp, type: "offer" }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    }
  );
  if (!response.ok) {
    throw new Error(`sidecar /api/call failed (${response.status})`);
  }
  const answerSdp = readStreamerAnswer(await response.json());
  if (!answerSdp) {
    throw new Error("sidecar returned an invalid answer");
  }
  return answerSdp;
}

export async function streamerAddIce(input: {
  baseUrl: string;
  candidate: ScreenRtcIce;
  fetchImpl?: StreamerFetch;
  peerId: string;
}): Promise<void> {
  const peerId = sanitizeScreenRtcPeerId(input.peerId);
  const candidate = sanitizeScreenRtcIce(input.candidate);
  if (!peerId || !candidate) {
    return;
  }
  const response = await (input.fetchImpl ?? fetch)(
    `${input.baseUrl}/api/addIceCandidate?peerid=${encodeURIComponent(peerId)}`,
    {
      body: JSON.stringify(candidate),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    }
  );
  if (!response.ok) {
    throw new Error(`sidecar /api/addIceCandidate failed (${response.status})`);
  }
}

export async function streamerGetIce(input: {
  baseUrl: string;
  fetchImpl?: StreamerFetch;
  peerId: string;
}): Promise<ScreenRtcIce[]> {
  const peerId = sanitizeScreenRtcPeerId(input.peerId);
  if (!peerId) {
    return [];
  }
  const response = await (input.fetchImpl ?? fetch)(
    `${input.baseUrl}/api/getIceCandidate?peerid=${encodeURIComponent(peerId)}`
  );
  if (!response.ok) {
    throw new Error(`sidecar /api/getIceCandidate failed (${response.status})`);
  }
  return readStreamerIceList(await response.json());
}

export async function streamerHangup(input: {
  baseUrl: string;
  fetchImpl?: StreamerFetch;
  peerId: string;
}): Promise<void> {
  const peerId = sanitizeScreenRtcPeerId(input.peerId);
  if (!peerId) {
    return;
  }
  await (input.fetchImpl ?? fetch)(
    `${input.baseUrl}/api/hangup?peerid=${encodeURIComponent(peerId)}`
  );
}

async function waitForStreamer(
  baseUrl: string,
  fetchImpl: StreamerFetch,
  timeoutMs: number
): Promise<void> {
  const started = Date.now();
  let lastError = "sidecar did not become ready";
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetchImpl(`${baseUrl}/api/getIceServers`);
      if (response.ok) {
        return;
      }
      lastError = `sidecar ready check ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => {
      setTimeout(resolve, 150);
    });
  }
  throw new Error(lastError);
}

export class WebRtcStreamerHost {
  private baseUrl: string | null = null;
  private child: ChildProcess | null = null;
  private readonly fetchImpl: StreamerFetch;
  private readonly resolveBinary: () => string | null;

  constructor(
    resolveBinary: () => string | null = () => resolveWebRtcStreamer(),
    fetchImpl: StreamerFetch = fetch
  ) {
    this.resolveBinary = resolveBinary;
    this.fetchImpl = fetchImpl;
  }

  available(): boolean {
    return this.resolveBinary() !== null;
  }

  async ensureStarted(): Promise<string> {
    if (this.baseUrl) {
      return this.baseUrl;
    }
    const binary = this.resolveBinary();
    if (!binary) {
      throw new Error(screenRtcMissingSidecarMessage());
    }
    const port = await allocateLoopbackPort();
    const httpBind = screenRtcLoopbackBind(port);
    const args = webrtcStreamerArgv({ httpBind });
    const child = spawn(binary, args, {
      stdio: "ignore",
    });
    this.child = child;
    const baseUrl = `http://${httpBind}`;
    try {
      await waitForStreamer(
        baseUrl,
        this.fetchImpl,
        SCREEN_RTC_START_TIMEOUT_MS
      );
    } catch (error) {
      this.stop();
      throw error;
    }
    child.once("exit", () => {
      if (this.child === child) {
        this.child = null;
        this.baseUrl = null;
      }
    });
    this.baseUrl = baseUrl;
    return baseUrl;
  }

  async call(peerId: string, offerSdp: string): Promise<string> {
    const baseUrl = await this.ensureStarted();
    return await streamerCall({
      baseUrl,
      fetchImpl: this.fetchImpl,
      offerSdp,
      peerId,
    });
  }

  async addIce(peerId: string, candidate: ScreenRtcIce): Promise<void> {
    if (!this.baseUrl) {
      return;
    }
    await streamerAddIce({
      baseUrl: this.baseUrl,
      candidate,
      fetchImpl: this.fetchImpl,
      peerId,
    });
  }

  async getIce(peerId: string): Promise<ScreenRtcIce[]> {
    if (!this.baseUrl) {
      return [];
    }
    return await streamerGetIce({
      baseUrl: this.baseUrl,
      fetchImpl: this.fetchImpl,
      peerId,
    });
  }

  async hangup(peerId: string): Promise<void> {
    if (!this.baseUrl) {
      return;
    }
    await streamerHangup({
      baseUrl: this.baseUrl,
      fetchImpl: this.fetchImpl,
      peerId,
    });
  }

  stop(): void {
    if (this.child && !this.child.killed) {
      this.child.kill("SIGTERM");
    }
    this.child = null;
    this.baseUrl = null;
  }
}
