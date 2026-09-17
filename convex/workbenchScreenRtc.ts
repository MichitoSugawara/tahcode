import { v } from "convex/values";

import { clipScreenError } from "../shared/workbenchScreen.ts";
import {
  parseScreenRtcSdp,
  sanitizeScreenRtcIce,
  sanitizeScreenRtcPeerId,
  SCREEN_RTC_HISTORY_CAP,
  SCREEN_RTC_ICE_CLAIM_MAX,
  SCREEN_RTC_ICE_PENDING_CAP,
  screenRtcMissingSidecarMessage,
} from "../shared/workbenchScreenRtc.ts";
import type { Id } from "./_generated/dataModel";
import { mutation } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { authedMutation, authedQuery } from "./lib/customFunctions";
import { getRuntimeByToken } from "./lib/runtimeAuth";
import { screenRtcIce, screenRtcSessionStatus } from "./lib/validators";
import {
  canSeeWorkbenchSession,
  requireScreenWebRtcRuntime,
} from "./lib/workbenchAccess";

const rtcView = v.object({
  _id: v.id("screenRtcSessions"),
  answerSdp: v.optional(v.string()),
  error: v.optional(v.string()),
  peerId: v.string(),
  runtimeId: v.id("runtimes"),
  sessionId: v.id("screenSessions"),
  status: screenRtcSessionStatus,
});

const iceView = v.object({
  _id: v.id("screenRtcIce"),
  candidate: v.string(),
  sdpMLineIndex: v.optional(v.number()),
  sdpMid: v.optional(v.string()),
});

async function pruneOldRtc(ctx: MutationCtx, runtimeId: Id<"runtimes">) {
  const rows = await ctx.db
    .query("screenRtcSessions")
    .withIndex("by_runtime", (q) => q.eq("runtimeId", runtimeId))
    .take(SCREEN_RTC_HISTORY_CAP + 8);
  if (rows.length <= SCREEN_RTC_HISTORY_CAP) {
    return;
  }
  for (const row of rows.slice(SCREEN_RTC_HISTORY_CAP)) {
    if (row.status === "negotiating" || row.status === "answered") {
      continue;
    }
    await ctx.db.delete("screenRtcSessions", row._id);
  }
}

async function prunePendingIce(
  ctx: MutationCtx,
  rtcSessionId: Id<"screenRtcSessions">,
  from: "browser" | "bridge"
) {
  const pending = await ctx.db
    .query("screenRtcIce")
    .withIndex("by_rtc_from_status", (q) =>
      q
        .eq("rtcSessionId", rtcSessionId)
        .eq("from", from)
        .eq("status", "pending")
    )
    .take(SCREEN_RTC_ICE_PENDING_CAP + 16);
  if (pending.length <= SCREEN_RTC_ICE_PENDING_CAP) {
    return;
  }
  const extra = pending.length - SCREEN_RTC_ICE_PENDING_CAP;
  for (const row of pending.slice(0, extra)) {
    await ctx.db.delete("screenRtcIce", row._id);
  }
}

export async function screenSessionHasLiveRtc(
  ctx: MutationCtx,
  sessionId: Id<"screenSessions">
): Promise<boolean> {
  const rows = await ctx.db
    .query("screenRtcSessions")
    .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
    .take(4);
  return rows.some((row) => row.status === "answered");
}

export const open = authedMutation({
  args: {
    offerSdp: v.string(),
    peerId: v.string(),
    sessionId: v.id("screenSessions"),
  },
  handler: async (ctx, args) => {
    const offerSdp = parseScreenRtcSdp(args.offerSdp);
    const peerId = sanitizeScreenRtcPeerId(args.peerId);
    if (!offerSdp || !peerId) {
      throw new Error("Invalid WebRTC offer");
    }
    const session = await ctx.db.get("screenSessions", args.sessionId);
    if (!session) {
      throw new Error("Screen session not found");
    }
    if (session.requestedBy !== ctx.user._id) {
      throw new Error("Unauthorized");
    }
    if (session.status !== "watching") {
      throw new Error("Screen session is not watching");
    }
    await requireScreenWebRtcRuntime(ctx, session.runtimeId, ctx.user._id);
    const existing = await ctx.db
      .query("screenRtcSessions")
      .withIndex("by_runtime_owner_session", (q) =>
        q
          .eq("runtimeId", session.runtimeId)
          .eq("requestedBy", ctx.user._id)
          .eq("sessionId", args.sessionId)
      )
      .take(1);
    const row = existing[0];
    if (row) {
      await ctx.db.patch("screenRtcSessions", row._id, {
        answerSdp: undefined,
        error: undefined,
        offerSdp,
        peerId,
        status: "negotiating",
      });
      return row._id;
    }
    await pruneOldRtc(ctx, session.runtimeId);
    return await ctx.db.insert("screenRtcSessions", {
      offerSdp,
      orgId: session.orgId,
      peerId,
      requestedBy: ctx.user._id,
      runtimeId: session.runtimeId,
      sessionId: args.sessionId,
      status: "negotiating",
    });
  },
  returns: v.id("screenRtcSessions"),
});

export const close = authedMutation({
  args: { rtcSessionId: v.id("screenRtcSessions") },
  handler: async (ctx, args) => {
    const row = await ctx.db.get("screenRtcSessions", args.rtcSessionId);
    if (!row) {
      return null;
    }
    if (row.requestedBy !== ctx.user._id) {
      throw new Error("Unauthorized");
    }
    await ctx.db.patch("screenRtcSessions", row._id, { status: "closed" });
    return null;
  },
  returns: v.null(),
});

export const get = authedQuery({
  args: { rtcSessionId: v.id("screenRtcSessions") },
  handler: async (ctx, args) => {
    const row = await ctx.db.get("screenRtcSessions", args.rtcSessionId);
    if (!row) {
      return null;
    }
    const visible = await canSeeWorkbenchSession(
      ctx,
      row.orgId,
      row.runtimeId,
      row.requestedBy,
      ctx.user._id
    );
    if (!visible) {
      return null;
    }
    return {
      _id: row._id,
      answerSdp: row.answerSdp,
      error: row.error,
      peerId: row.peerId,
      runtimeId: row.runtimeId,
      sessionId: row.sessionId,
      status: row.status,
    };
  },
  returns: v.union(rtcView, v.null()),
});

export const listIce = authedQuery({
  args: { rtcSessionId: v.id("screenRtcSessions") },
  handler: async (ctx, args) => {
    const row = await ctx.db.get("screenRtcSessions", args.rtcSessionId);
    if (!row) {
      return [];
    }
    const visible = await canSeeWorkbenchSession(
      ctx,
      row.orgId,
      row.runtimeId,
      row.requestedBy,
      ctx.user._id
    );
    if (!visible) {
      return [];
    }
    const ice = await ctx.db
      .query("screenRtcIce")
      .withIndex("by_rtc_from_status", (q) =>
        q
          .eq("rtcSessionId", args.rtcSessionId)
          .eq("from", "bridge")
          .eq("status", "pending")
      )
      .take(SCREEN_RTC_ICE_CLAIM_MAX);
    return ice.map((item) => ({
      _id: item._id,
      candidate: item.candidate,
      sdpMLineIndex: item.sdpMLineIndex,
      sdpMid: item.sdpMid,
    }));
  },
  returns: v.array(iceView),
});

export const enqueueIce = authedMutation({
  args: {
    events: v.array(screenRtcIce),
    rtcSessionId: v.id("screenRtcSessions"),
  },
  handler: async (ctx, args) => {
    if (
      args.events.length < 1 ||
      args.events.length > SCREEN_RTC_ICE_CLAIM_MAX
    ) {
      throw new Error("WebRTC ICE batch must be between 1 and 16 candidates");
    }
    const row = await ctx.db.get("screenRtcSessions", args.rtcSessionId);
    if (!row) {
      throw new Error("WebRTC session not found");
    }
    if (row.requestedBy !== ctx.user._id) {
      throw new Error("Unauthorized");
    }
    if (row.status === "closed") {
      throw new Error("WebRTC session is closed");
    }
    await requireScreenWebRtcRuntime(ctx, row.runtimeId, ctx.user._id);
    for (const event of args.events) {
      const clean = sanitizeScreenRtcIce(event);
      if (!clean) {
        throw new Error("Invalid ICE candidate");
      }
      await ctx.db.insert("screenRtcIce", {
        candidate: clean.candidate,
        from: "browser",
        orgId: row.orgId,
        rtcSessionId: args.rtcSessionId,
        runtimeId: row.runtimeId,
        sdpMLineIndex: clean.sdpMLineIndex,
        sdpMid: clean.sdpMid,
        status: "pending",
      });
    }
    await prunePendingIce(ctx, args.rtcSessionId, "browser");
    return null;
  },
  returns: v.null(),
});

export const claimNext = mutation({
  args: { runtimeId: v.id("runtimes"), token: v.string() },
  handler: async (ctx, args) => {
    await getRuntimeByToken(ctx, args.runtimeId, args.token);
    const negotiating = await ctx.db
      .query("screenRtcSessions")
      .withIndex("by_runtime_and_status", (q) =>
        q.eq("runtimeId", args.runtimeId).eq("status", "negotiating")
      )
      .order("asc")
      .take(16);
    const row = negotiating.find((item) => !item.answerSdp);
    if (!row) {
      return null;
    }
    const now = Date.now();
    await ctx.db.patch("screenRtcSessions", row._id, {
      claimedAt: now,
      lastBridgeAt: now,
    });
    return {
      _id: row._id,
      offerSdp: row.offerSdp,
      peerId: row.peerId,
      sessionId: row.sessionId,
    };
  },
  returns: v.union(
    v.object({
      _id: v.id("screenRtcSessions"),
      offerSdp: v.string(),
      peerId: v.string(),
      sessionId: v.id("screenSessions"),
    }),
    v.null()
  ),
});

export const listActive = mutation({
  args: { runtimeId: v.id("runtimes"), token: v.string() },
  handler: async (ctx, args) => {
    await getRuntimeByToken(ctx, args.runtimeId, args.token);
    const out: { _id: Id<"screenRtcSessions">; peerId: string }[] = [];
    for (const status of ["negotiating", "answered"] as const) {
      const rows = await ctx.db
        .query("screenRtcSessions")
        .withIndex("by_runtime_and_status", (q) =>
          q.eq("runtimeId", args.runtimeId).eq("status", status)
        )
        .take(16);
      for (const row of rows) {
        out.push({ _id: row._id, peerId: row.peerId });
      }
    }
    return out;
  },
  returns: v.array(
    v.object({
      _id: v.id("screenRtcSessions"),
      peerId: v.string(),
    })
  ),
});

export const reportAnswer = mutation({
  args: {
    answerSdp: v.string(),
    rtcSessionId: v.id("screenRtcSessions"),
    runtimeId: v.id("runtimes"),
    token: v.string(),
  },
  handler: async (ctx, args) => {
    await getRuntimeByToken(ctx, args.runtimeId, args.token);
    const row = await ctx.db.get("screenRtcSessions", args.rtcSessionId);
    if (!row) {
      throw new Error("WebRTC session not found");
    }
    if (String(row.runtimeId) !== String(args.runtimeId)) {
      throw new Error("WebRTC session belongs to another runtime");
    }
    const answerSdp = parseScreenRtcSdp(args.answerSdp);
    if (!answerSdp) {
      throw new Error("Invalid WebRTC answer");
    }
    const now = Date.now();
    await ctx.db.patch("screenRtcSessions", row._id, {
      answerSdp,
      error: undefined,
      lastBridgeAt: now,
      status: row.status === "closed" ? "closed" : "answered",
    });
    const screen = await ctx.db.get("screenSessions", row.sessionId);
    if (screen) {
      await ctx.db.patch("screenSessions", screen._id, {
        error: undefined,
        lastBridgeAt: now,
      });
    }
    return null;
  },
  returns: v.null(),
});

export const reportError = mutation({
  args: {
    error: v.string(),
    rtcSessionId: v.id("screenRtcSessions"),
    runtimeId: v.id("runtimes"),
    token: v.string(),
  },
  handler: async (ctx, args) => {
    await getRuntimeByToken(ctx, args.runtimeId, args.token);
    const row = await ctx.db.get("screenRtcSessions", args.rtcSessionId);
    if (!row) {
      throw new Error("WebRTC session not found");
    }
    if (String(row.runtimeId) !== String(args.runtimeId)) {
      throw new Error("WebRTC session belongs to another runtime");
    }
    const now = Date.now();
    await ctx.db.patch("screenRtcSessions", row._id, {
      error: clipScreenError(args.error || screenRtcMissingSidecarMessage()),
      lastBridgeAt: now,
      status: row.status === "closed" ? "closed" : "failed",
    });
    return null;
  },
  returns: v.null(),
});

export const claimIce = mutation({
  args: { runtimeId: v.id("runtimes"), token: v.string() },
  handler: async (ctx, args) => {
    await getRuntimeByToken(ctx, args.runtimeId, args.token);
    const pending = await ctx.db
      .query("screenRtcIce")
      .withIndex("by_runtime_from_status", (q) =>
        q
          .eq("runtimeId", args.runtimeId)
          .eq("from", "browser")
          .eq("status", "pending")
      )
      .order("asc")
      .take(SCREEN_RTC_ICE_CLAIM_MAX);
    const events = [];
    for (const item of pending) {
      const owner = await ctx.db.get("screenRtcSessions", item.rtcSessionId);
      if (!owner || owner.status === "closed" || owner.status === "failed") {
        await ctx.db.patch("screenRtcIce", item._id, { status: "done" });
        continue;
      }
      await ctx.db.patch("screenRtcIce", item._id, { status: "done" });
      events.push({
        candidate: item.candidate,
        peerId: owner.peerId,
        rtcSessionId: item.rtcSessionId,
        sdpMLineIndex: item.sdpMLineIndex,
        sdpMid: item.sdpMid,
      });
    }
    return { events };
  },
  returns: v.object({
    events: v.array(
      v.object({
        candidate: v.string(),
        peerId: v.string(),
        rtcSessionId: v.id("screenRtcSessions"),
        sdpMLineIndex: v.optional(v.number()),
        sdpMid: v.optional(v.string()),
      })
    ),
  }),
});

export const reportIce = mutation({
  args: {
    events: v.array(screenRtcIce),
    rtcSessionId: v.id("screenRtcSessions"),
    runtimeId: v.id("runtimes"),
    token: v.string(),
  },
  handler: async (ctx, args) => {
    await getRuntimeByToken(ctx, args.runtimeId, args.token);
    const row = await ctx.db.get("screenRtcSessions", args.rtcSessionId);
    if (!row) {
      throw new Error("WebRTC session not found");
    }
    if (String(row.runtimeId) !== String(args.runtimeId)) {
      throw new Error("WebRTC session belongs to another runtime");
    }
    if (args.events.length > SCREEN_RTC_ICE_CLAIM_MAX) {
      throw new Error("WebRTC ICE batch is too large");
    }
    for (const event of args.events) {
      const clean = sanitizeScreenRtcIce(event);
      if (!clean) {
        continue;
      }
      await ctx.db.insert("screenRtcIce", {
        candidate: clean.candidate,
        from: "bridge",
        orgId: row.orgId,
        rtcSessionId: args.rtcSessionId,
        runtimeId: row.runtimeId,
        sdpMLineIndex: clean.sdpMLineIndex,
        sdpMid: clean.sdpMid,
        status: "pending",
      });
    }
    await prunePendingIce(ctx, args.rtcSessionId, "bridge");
    return null;
  },
  returns: v.null(),
});
