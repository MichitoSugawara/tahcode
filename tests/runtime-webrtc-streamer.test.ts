import { createServer } from "node:http";

import { describe, expect, it } from "vitest";

import {
  readStreamerAnswer,
  resolveWebRtcStreamer,
  streamerCall,
  webrtcStreamerArgv,
} from "../runtime/src/webrtcStreamer.ts";

const ANSWER = [
  "v=0",
  "o=- 2 1 IN IP4 127.0.0.1",
  "s=-",
  "t=0 0",
  "m=video 9 UDP/TLS/RTP/SAVPF 96",
].join("\r\n");

describe("webrtc-streamer sidecar adapter", () => {
  it("prefers TAHCODE_WEBRTC_STREAMER then PATH, and ignores a missing env path", () => {
    expect(
      resolveWebRtcStreamer(
        { TAHCODE_WEBRTC_STREAMER: "/no/such/webrtc-streamer" },
        () => null,
        "/tmp/no-home"
      )
    ).toBeNull();
    expect(
      resolveWebRtcStreamer({}, (bin) =>
        bin === "webrtc-streamer" ? "/opt/bin/webrtc-streamer" : null
      )
    ).toBe("/opt/bin/webrtc-streamer");
  });

  it("posts the browser offer to /api/call and reads the answer SDP", async () => {
    const seen: { body: string; url: string }[] = [];
    const server = createServer((request, response) => {
      const chunks: Buffer[] = [];
      request.on("data", (chunk) => {
        chunks.push(chunk as Buffer);
      });
      request.on("end", () => {
        seen.push({
          body: Buffer.concat(chunks).toString("utf-8"),
          url: request.url ?? "",
        });
        response.writeHead(200, { "Content-Type": "application/json" });
        response.end(JSON.stringify({ sdp: ANSWER, type: "answer" }));
      });
    });
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => {
        resolve();
      });
    });
    const address = server.address();
    const port =
      typeof address === "object" && address !== null ? address.port : 0;
    const answerSdp = await streamerCall({
      baseUrl: `http://127.0.0.1:${port}`,
      offerSdp: [
        "v=0",
        "o=- 1 1 IN IP4 127.0.0.1",
        "s=-",
        "t=0 0",
        "m=video 9 UDP/TLS/RTP/SAVPF 96",
      ].join("\r\n"),
      peerId: "tah-peer-1",
    });
    await new Promise<void>((resolve) => {
      server.close(() => {
        resolve();
      });
    });
    expect({
      answerSdp,
      bind: webrtcStreamerArgv({ httpBind: "127.0.0.1:9" })[1],
      body: JSON.parse(seen[0]?.body ?? "{}"),
      parsed: readStreamerAnswer({ sdp: ANSWER, type: "answer" }),
      url: seen[0]?.url,
    }).toMatchObject({
      answerSdp: ANSWER,
      bind: "127.0.0.1:9",
      body: { type: "offer" },
      parsed: ANSWER,
      url: expect.stringContaining("/api/call?peerid=tah-peer-1"),
    });
    expect(seen[0]?.url).toContain("url=screen%3A%2F%2F0");
  });
});
