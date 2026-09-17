import { describe, expect, it } from "vitest";

import {
  BRIDGE_CAPABILITIES,
  liveBridgeCapabilities,
} from "../runtime/src/runner.ts";
import { webrtcStreamerArgv } from "../runtime/src/webrtcStreamer.ts";
import { SCREEN_WEBRTC_MIN_CLI_VERSION } from "../shared/cliVersion.ts";
import {
  assertScreenRtcHttpBind,
  BRIDGE_CAPABILITY_SCREEN_WEBRTC,
  parseScreenRtcSdp,
  pickRemoteLiveMode,
  runtimeHasScreenWebRtc,
  sanitizeScreenRtcIce,
  sanitizeScreenRtcPeerId,
  screenLiveConnected,
  screenRtcLoopbackBind,
  withScreenWebRtcCapability,
} from "../shared/workbenchScreenRtc.ts";

const OFFER = [
  "v=0",
  "o=- 1 1 IN IP4 127.0.0.1",
  "s=-",
  "t=0 0",
  "m=video 9 UDP/TLS/RTP/SAVPF 96",
].join("\r\n");

describe("workbench screen WebRTC contract", () => {
  it("gates screenWebRtc on sidecar presence and never bakes it into the base bits", () => {
    expect({
      baseHasBit: BRIDGE_CAPABILITIES.includes(BRIDGE_CAPABILITY_SCREEN_WEBRTC),
      empty: runtimeHasScreenWebRtc([]),
      liveOff: liveBridgeCapabilities(false),
      liveOn: liveBridgeCapabilities(true),
      missing: runtimeHasScreenWebRtc(),
      present: runtimeHasScreenWebRtc([BRIDGE_CAPABILITY_SCREEN_WEBRTC]),
      version: SCREEN_WEBRTC_MIN_CLI_VERSION,
    }).toStrictEqual({
      baseHasBit: false,
      empty: false,
      liveOff: BRIDGE_CAPABILITIES,
      liveOn: withScreenWebRtcCapability(BRIDGE_CAPABILITIES, true),
      missing: false,
      present: true,
      version: "0.1.6",
    });
  });

  it("accepts real SDP / ICE and rejects junk before it hits Convex", () => {
    expect({
      ice: sanitizeScreenRtcIce({
        candidate: "candidate:1 1 UDP 1 127.0.0.1 9 typ host",
        sdpMLineIndex: 0,
        sdpMid: "0",
      }),
      junkIce: sanitizeScreenRtcIce({ candidate: "nope" }),
      junkPeer: sanitizeScreenRtcPeerId("bad peer"),
      junkSdp: parseScreenRtcSdp("not-sdp"),
      originless: parseScreenRtcSdp("v=0\nno-origin"),
      peer: sanitizeScreenRtcPeerId("tah-peer-1"),
      sdp: parseScreenRtcSdp(OFFER),
    }).toMatchObject({
      ice: {
        candidate: "candidate:1 1 UDP 1 127.0.0.1 9 typ host",
        sdpMLineIndex: 0,
      },
      junkIce: null,
      junkPeer: null,
      junkSdp: null,
      originless: null,
      peer: "tah-peer-1",
      sdp: OFFER,
    });
  });

  it("never treats a silent stream as a live desktop", () => {
    expect({
      gated: pickRemoteLiveMode({
        hasScreenWebRtc: false,
        jpegReady: false,
        playing: true,
        stream: { id: "s" },
      }),
      jpeg: pickRemoteLiveMode({
        hasScreenWebRtc: true,
        jpegReady: true,
        playing: false,
        stream: { id: "s" },
      }),
      silent: screenLiveConnected({ playing: false, stream: { id: "s" } }),
      streamless: screenLiveConnected({ playing: true, stream: null }),
      webrtc: pickRemoteLiveMode({
        hasScreenWebRtc: true,
        jpegReady: false,
        playing: true,
        stream: { id: "s" },
      }),
    }).toStrictEqual({
      gated: "empty",
      jpeg: "jpeg",
      silent: false,
      streamless: false,
      webrtc: "webrtc",
    });
  });

  it("forces the sidecar HTTP bind onto loopback", () => {
    expect(screenRtcLoopbackBind(8123)).toBe("127.0.0.1:8123");
    expect(() => assertScreenRtcHttpBind("0.0.0.0:8000")).toThrow(
      /127\.0\.0\.1/
    );
    expect(webrtcStreamerArgv({ httpBind: "127.0.0.1:8123" })).toStrictEqual([
      "--http",
      "127.0.0.1:8123",
      "--stun-server",
      "stun.l.google.com:19302",
      "-a",
      "screen://0",
    ]);
    expect(() => webrtcStreamerArgv({ httpBind: "0.0.0.0:8000" })).toThrow(
      /127\.0\.0\.1/
    );
  });
});
