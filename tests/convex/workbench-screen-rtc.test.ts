import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { sha256Hex } from "../../convex/lib/ids";
import schema from "../../convex/schema";

const modules = import.meta.glob("../../convex/**/*.*s");
const TOKEN = "th_screen_rtc_test_token_value";
const OFFER = [
  "v=0",
  "o=- 1 1 IN IP4 127.0.0.1",
  "s=-",
  "t=0 0",
  "m=video 9 UDP/TLS/RTP/SAVPF 96",
].join("\r\n");
const ANSWER = [
  "v=0",
  "o=- 2 1 IN IP4 127.0.0.1",
  "s=-",
  "t=0 0",
  "m=video 9 UDP/TLS/RTP/SAVPF 96",
].join("\r\n");

function fresh() {
  return convexTest(schema, modules);
}

async function insertUser(
  t: ReturnType<typeof fresh>,
  fields: { handle: string }
) {
  return await t.run(
    async (ctx) =>
      await ctx.db.insert("users", {
        handle: fields.handle,
        name: fields.handle,
      })
  );
}

function asUser(t: ReturnType<typeof fresh>, userId: Id<"users">) {
  return t.withIdentity({ subject: `${userId}|test-session` });
}

async function seedOrg(
  t: ReturnType<typeof fresh>,
  capabilities: string[] = ["screen", "screenInput", "screenWebRtc"]
) {
  const alice = await insertUser(t, { handle: "alice" });
  const aliceCtx = asUser(t, alice);
  const orgId = await aliceCtx.mutation(api.orgs.create, { name: "Acme" });
  const runtimeId = await t.run(
    async (ctx) =>
      await ctx.db.insert("runtimes", {
        capabilities,
        lastSeenAt: Date.now(),
        name: "ローカル",
        orgId,
        ownerUserId: alice,
        slug: "local",
        status: "online",
        tokenHash: await sha256Hex(TOKEN),
      })
  );
  return { alice, aliceCtx, orgId, runtimeId };
}

describe("workbench screen WebRTC signaling", () => {
  it("opens, claims an offer, and stores an answer without a video blob", async () => {
    const t = fresh();
    const { aliceCtx, runtimeId } = await seedOrg(t);
    const sessionId = await aliceCtx.mutation(api.workbenchScreen.open, {
      runtimeId,
    });
    const rtcSessionId = await aliceCtx.mutation(api.workbenchScreenRtc.open, {
      offerSdp: OFFER,
      peerId: "tah-peer-1",
      sessionId,
    });
    const empty = await aliceCtx.query(api.workbenchScreenRtc.get, {
      rtcSessionId,
    });
    const claimed = await t.mutation(api.workbenchScreenRtc.claimNext, {
      runtimeId,
      token: TOKEN,
    });
    await t.mutation(api.workbenchScreenRtc.reportAnswer, {
      answerSdp: ANSWER,
      rtcSessionId,
      runtimeId,
      token: TOKEN,
    });
    const answered = await aliceCtx.query(api.workbenchScreenRtc.get, {
      rtcSessionId,
    });
    const jpeg = await t.mutation(api.workbenchScreen.claimNext, {
      runtimeId,
      token: TOKEN,
    });
    expect({
      answer: answered?.answerSdp,
      claimedOffer: claimed?.offerSdp,
      connectedField: empty ? "connected" in empty : true,
      jpegAfterAnswer: jpeg,
      status: answered?.status,
    }).toStrictEqual({
      answer: ANSWER,
      claimedOffer: OFFER,
      connectedField: false,
      jpegAfterAnswer: null,
      status: "answered",
    });
  });

  it("refuses an old bridge without screenWebRtc", async () => {
    const t = fresh();
    const { aliceCtx, runtimeId } = await seedOrg(t, ["screen", "screenInput"]);
    const sessionId = await aliceCtx.mutation(api.workbenchScreen.open, {
      runtimeId,
    });
    await expect(
      aliceCtx.mutation(api.workbenchScreenRtc.open, {
        offerSdp: OFFER,
        peerId: "tah-peer-1",
        sessionId,
      })
    ).rejects.toThrow(/WebRTC 画面に未対応/);
  });

  it("hides another organization's RTC session", async () => {
    const t = fresh();
    const { aliceCtx, runtimeId } = await seedOrg(t);
    const sessionId = await aliceCtx.mutation(api.workbenchScreen.open, {
      runtimeId,
    });
    const rtcSessionId = await aliceCtx.mutation(api.workbenchScreenRtc.open, {
      offerSdp: OFFER,
      peerId: "tah-peer-1",
      sessionId,
    });
    const bob = await insertUser(t, { handle: "bob" });
    await asUser(t, bob).mutation(api.orgs.create, { name: "Other" });
    const hidden = await asUser(t, bob).query(api.workbenchScreenRtc.get, {
      rtcSessionId,
    });
    expect(hidden).toBeNull();
  });

  it("moves browser ICE to the owning runtime", async () => {
    const t = fresh();
    const { aliceCtx, runtimeId } = await seedOrg(t);
    const sessionId = await aliceCtx.mutation(api.workbenchScreen.open, {
      runtimeId,
    });
    const rtcSessionId = await aliceCtx.mutation(api.workbenchScreenRtc.open, {
      offerSdp: OFFER,
      peerId: "tah-peer-1",
      sessionId,
    });
    await aliceCtx.mutation(api.workbenchScreenRtc.enqueueIce, {
      events: [
        {
          candidate: "candidate:1 1 UDP 1 127.0.0.1 9 typ host",
          sdpMLineIndex: 0,
          sdpMid: "0",
        },
      ],
      rtcSessionId,
    });
    const claimed = await t.mutation(api.workbenchScreenRtc.claimIce, {
      runtimeId,
      token: TOKEN,
    });
    const again = await t.mutation(api.workbenchScreenRtc.claimIce, {
      runtimeId,
      token: TOKEN,
    });
    expect({
      againCount: again.events.length,
      first: claimed.events[0],
    }).toMatchObject({
      againCount: 0,
      first: {
        candidate: "candidate:1 1 UDP 1 127.0.0.1 9 typ host",
        peerId: "tah-peer-1",
      },
    });
  });
});
