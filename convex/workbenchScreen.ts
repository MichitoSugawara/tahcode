import { v } from "convex/values";

import {
  clipScreenError,
  DEFAULT_SCREEN_TAB_ID,
  isScreenFrameType,
  SCREEN_FRAME_MAX_BYTES,
  SCREEN_HISTORY_CAP,
  SCREEN_POLL_MS,
  SCREEN_WATCH_TIMEOUT_MS,
  screenFrameDue,
  screenUpgradeMessage,
} from "../shared/workbenchScreen.ts";
import type { Id } from "./_generated/dataModel";
import { mutation } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { authedMutation, authedQuery } from "./lib/customFunctions";
import { getRuntimeByToken } from "./lib/runtimeAuth";
import { screenSessionStatus } from "./lib/validators";
import {
  canSeeWorkbenchSession,
  requireScreenRuntime,
} from "./lib/workbenchAccess";

const sessionView = v.object({
  _id: v.id("screenSessions"),
  bytes: v.optional(v.number()),
  capturedAt: v.optional(v.number()),
  chatId: v.optional(v.id("chats")),
  contentType: v.optional(v.string()),
  error: v.optional(v.string()),
  frameUrl: v.union(v.string(), v.null()),
  height: v.optional(v.number()),
  lastBridgeAt: v.optional(v.number()),
  runtimeId: v.id("runtimes"),
  status: screenSessionStatus,
  tabId: v.string(),
  width: v.optional(v.number()),
});

async function pruneOldScreen(ctx: MutationCtx, runtimeId: Id<"runtimes">) {
  const rows = await ctx.db
    .query("screenSessions")
    .withIndex("by_runtime", (q) => q.eq("runtimeId", runtimeId))
    .take(SCREEN_HISTORY_CAP + 8);
  if (rows.length <= SCREEN_HISTORY_CAP) {
    return;
  }
  for (const row of rows.slice(SCREEN_HISTORY_CAP)) {
    if (row.status === "watching") {
      continue;
    }
    if (row.storageId) {
      await ctx.storage.delete(row.storageId);
    }
    await ctx.db.delete("screenSessions", row._id);
  }
}

async function markQuietWatching(ctx: MutationCtx, runtimeId: Id<"runtimes">) {
  const watching = await ctx.db
    .query("screenSessions")
    .withIndex("by_runtime_and_status", (q) =>
      q.eq("runtimeId", runtimeId).eq("status", "watching")
    )
    .take(16);
  const now = Date.now();
  for (const row of watching) {
    const last = row.lastBridgeAt ?? row.claimedAt ?? row._creationTime;
    if (now - last <= SCREEN_WATCH_TIMEOUT_MS) {
      continue;
    }
    await ctx.db.patch("screenSessions", row._id, {
      error: clipScreenError(
        "ブリッジが画面フレームを送っていません。tahcode が動いているか確認してください。"
      ),
    });
  }
}

async function replaceFrame(
  ctx: MutationCtx,
  previous: Id<"_storage"> | undefined,
  next: Id<"_storage">
) {
  if (previous && previous !== next) {
    await ctx.storage.delete(previous);
  }
}

export const open = authedMutation({
  args: {
    chatId: v.optional(v.id("chats")),
    runtimeId: v.id("runtimes"),
    tabId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { runtime } = await requireScreenRuntime(
      ctx,
      args.runtimeId,
      ctx.user._id
    );
    const tabId = args.tabId?.trim() || DEFAULT_SCREEN_TAB_ID;
    const existing = await ctx.db
      .query("screenSessions")
      .withIndex("by_runtime_owner_tab", (q) =>
        q
          .eq("runtimeId", args.runtimeId)
          .eq("requestedBy", ctx.user._id)
          .eq("tabId", tabId)
      )
      .take(1);
    const row = existing[0];
    if (row) {
      const patch: {
        chatId?: Id<"chats">;
        error?: undefined;
        status: "watching";
      } = { status: "watching" };
      if (args.chatId && args.chatId !== row.chatId) {
        patch.chatId = args.chatId;
      }
      if (row.status !== "watching" || row.error) {
        patch.error = undefined;
      }
      await ctx.db.patch("screenSessions", row._id, patch);
      return row._id;
    }
    await pruneOldScreen(ctx, args.runtimeId);
    return await ctx.db.insert("screenSessions", {
      chatId: args.chatId,
      orgId: runtime.orgId,
      requestedBy: ctx.user._id,
      runtimeId: args.runtimeId,
      status: "watching",
      tabId,
    });
  },
  returns: v.id("screenSessions"),
});

export const close = authedMutation({
  args: { sessionId: v.id("screenSessions") },
  handler: async (ctx, args) => {
    const row = await ctx.db.get("screenSessions", args.sessionId);
    if (!row) {
      return null;
    }
    if (row.requestedBy !== ctx.user._id) {
      throw new Error("Unauthorized");
    }
    await ctx.db.patch("screenSessions", row._id, { status: "closed" });
    return null;
  },
  returns: v.null(),
});

export const get = authedQuery({
  args: { sessionId: v.id("screenSessions") },
  handler: async (ctx, args) => {
    const row = await ctx.db.get("screenSessions", args.sessionId);
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
    const frameUrl = row.storageId
      ? await ctx.storage.getUrl(row.storageId)
      : null;
    return {
      _id: row._id,
      bytes: row.bytes,
      capturedAt: row.capturedAt,
      chatId: row.chatId,
      contentType: row.contentType,
      error: row.error,
      frameUrl,
      height: row.height,
      lastBridgeAt: row.lastBridgeAt,
      runtimeId: row.runtimeId,
      status: row.status,
      tabId: row.tabId,
      width: row.width,
    };
  },
  returns: v.union(sessionView, v.null()),
});

export const claimNext = mutation({
  args: { runtimeId: v.id("runtimes"), token: v.string() },
  handler: async (ctx, args) => {
    await getRuntimeByToken(ctx, args.runtimeId, args.token);
    await markQuietWatching(ctx, args.runtimeId);
    const watching = await ctx.db
      .query("screenSessions")
      .withIndex("by_runtime_and_status", (q) =>
        q.eq("runtimeId", args.runtimeId).eq("status", "watching")
      )
      .order("asc")
      .take(16);
    const now = Date.now();
    const row = watching.find((item) =>
      screenFrameDue(item.lastBridgeAt, now, SCREEN_POLL_MS)
    );
    if (!row) {
      return null;
    }
    await ctx.db.patch("screenSessions", row._id, {
      claimedAt: now,
      lastBridgeAt: now,
    });
    return { _id: row._id };
  },
  returns: v.union(v.object({ _id: v.id("screenSessions") }), v.null()),
});

export const generateUploadUrl = mutation({
  args: {
    runtimeId: v.id("runtimes"),
    sessionId: v.id("screenSessions"),
    token: v.string(),
  },
  handler: async (ctx, args) => {
    await getRuntimeByToken(ctx, args.runtimeId, args.token);
    const row = await ctx.db.get("screenSessions", args.sessionId);
    if (!row) {
      throw new Error("Screen session not found");
    }
    if (String(row.runtimeId) !== String(args.runtimeId)) {
      throw new Error("Screen session belongs to another runtime");
    }
    if (row.status !== "watching") {
      throw new Error("Screen session is not watching");
    }
    return await ctx.storage.generateUploadUrl();
  },
  returns: v.string(),
});

export const reportFrame = mutation({
  args: {
    bytes: v.number(),
    contentType: v.string(),
    height: v.optional(v.number()),
    runtimeId: v.id("runtimes"),
    sessionId: v.id("screenSessions"),
    storageId: v.id("_storage"),
    token: v.string(),
    width: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await getRuntimeByToken(ctx, args.runtimeId, args.token);
    const row = await ctx.db.get("screenSessions", args.sessionId);
    if (!row) {
      throw new Error("Screen session not found");
    }
    if (String(row.runtimeId) !== String(args.runtimeId)) {
      throw new Error("Screen session belongs to another runtime");
    }
    if (!isScreenFrameType(args.contentType)) {
      throw new Error("Unsupported screen frame type");
    }
    if (args.bytes < 1 || args.bytes > SCREEN_FRAME_MAX_BYTES) {
      throw new Error("Screen frame must be between 1 byte and 1.5MB");
    }
    const now = Date.now();
    await replaceFrame(ctx, row.storageId, args.storageId);
    await ctx.db.patch("screenSessions", row._id, {
      bytes: args.bytes,
      capturedAt: now,
      contentType: args.contentType,
      error: undefined,
      height: args.height,
      lastBridgeAt: now,
      status: row.status === "closed" ? "closed" : "watching",
      storageId: args.storageId,
      width: args.width,
    });
    return null;
  },
  returns: v.null(),
});

export const reportError = mutation({
  args: {
    error: v.string(),
    fatal: v.optional(v.boolean()),
    runtimeId: v.id("runtimes"),
    sessionId: v.id("screenSessions"),
    token: v.string(),
  },
  handler: async (ctx, args) => {
    await getRuntimeByToken(ctx, args.runtimeId, args.token);
    const row = await ctx.db.get("screenSessions", args.sessionId);
    if (!row) {
      throw new Error("Screen session not found");
    }
    if (String(row.runtimeId) !== String(args.runtimeId)) {
      throw new Error("Screen session belongs to another runtime");
    }
    const now = Date.now();
    await ctx.db.patch("screenSessions", row._id, {
      error: clipScreenError(args.error || screenUpgradeMessage()),
      lastBridgeAt: now,
      status: args.fatal && row.status !== "closed" ? "error" : row.status,
    });
    return null;
  },
  returns: v.null(),
});
