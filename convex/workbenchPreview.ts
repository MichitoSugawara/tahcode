import { v } from "convex/values";

import {
  clipPreviewBody,
  clipPreviewTitle,
  DEFAULT_PREVIEW_TAB_ID,
  parsePreviewUrl,
  PREVIEW_STALE_MS,
  previewUrlErrorMessage,
  pushPreviewHistory,
} from "../shared/workbenchPreview.ts";
import type { Id } from "./_generated/dataModel";
import { mutation } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { authedMutation, authedQuery } from "./lib/customFunctions";
import { getRuntimeByToken } from "./lib/runtimeAuth";
import { previewNavStatus } from "./lib/validators";
import {
  canSeeWorkbenchSession,
  requirePreviewRuntime,
} from "./lib/workbenchAccess";

const HISTORY_CAP = 20;

const sessionView = v.object({
  _id: v.id("previewSessions"),
  body: v.optional(v.string()),
  chatId: v.optional(v.id("chats")),
  contentType: v.optional(v.string()),
  error: v.optional(v.string()),
  history: v.array(v.string()),
  httpStatus: v.optional(v.number()),
  lastBridgeAt: v.optional(v.number()),
  runtimeId: v.id("runtimes"),
  status: previewNavStatus,
  tabId: v.string(),
  title: v.string(),
  url: v.string(),
});

async function failStalePreview(ctx: MutationCtx, runtimeId: Id<"runtimes">) {
  const loading = await ctx.db
    .query("previewSessions")
    .withIndex("by_runtime_and_status", (q) =>
      q.eq("runtimeId", runtimeId).eq("status", "loading")
    )
    .take(20);
  const now = Date.now();
  for (const row of loading) {
    const started = row.claimedAt ?? row._creationTime;
    if (now - started > PREVIEW_STALE_MS) {
      await ctx.db.patch("previewSessions", row._id, {
        completedAt: now,
        error: "The bridge did not finish loading this page.",
        status: "failed",
      });
    }
  }
}

async function pruneOldPreview(ctx: MutationCtx, runtimeId: Id<"runtimes">) {
  const rows = await ctx.db
    .query("previewSessions")
    .withIndex("by_runtime", (q) => q.eq("runtimeId", runtimeId))
    .take(HISTORY_CAP + 10);
  if (rows.length <= HISTORY_CAP) {
    return;
  }
  for (const row of rows.slice(HISTORY_CAP)) {
    if (row.status === "loading") {
      continue;
    }
    await ctx.db.delete("previewSessions", row._id);
  }
}

function toView(row: {
  _id: Id<"previewSessions">;
  body?: string;
  chatId?: Id<"chats">;
  contentType?: string;
  error?: string;
  history: string[];
  httpStatus?: number;
  lastBridgeAt?: number;
  runtimeId: Id<"runtimes">;
  status: "idle" | "loading" | "success" | "failed";
  tabId: string;
  title: string;
  url: string;
}) {
  return {
    _id: row._id,
    body: row.body,
    chatId: row.chatId,
    contentType: row.contentType,
    error: row.error,
    history: row.history,
    httpStatus: row.httpStatus,
    lastBridgeAt: row.lastBridgeAt,
    runtimeId: row.runtimeId,
    status: row.status,
    tabId: row.tabId,
    title: row.title,
    url: row.url,
  };
}

export const open = authedMutation({
  args: {
    chatId: v.optional(v.id("chats")),
    runtimeId: v.id("runtimes"),
    tabId: v.optional(v.string()),
    url: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { runtime } = await requirePreviewRuntime(
      ctx,
      args.runtimeId,
      ctx.user._id
    );
    const tabId = args.tabId?.trim() || DEFAULT_PREVIEW_TAB_ID;
    const existing = await ctx.db
      .query("previewSessions")
      .withIndex("by_runtime_owner_tab", (q) =>
        q
          .eq("runtimeId", args.runtimeId)
          .eq("requestedBy", ctx.user._id)
          .eq("tabId", tabId)
      )
      .take(1);
    const row = existing[0];
    if (row) {
      if (args.chatId && args.chatId !== row.chatId) {
        await ctx.db.patch("previewSessions", row._id, { chatId: args.chatId });
      }
      return row._id;
    }
    await pruneOldPreview(ctx, args.runtimeId);
    const parsed = args.url ? parsePreviewUrl(args.url) : null;
    const url = parsed?.ok ? parsed.url.href : "";
    return await ctx.db.insert("previewSessions", {
      chatId: args.chatId,
      history: url ? [url] : [],
      orgId: runtime.orgId,
      pendingUrl: url || undefined,
      requestedBy: ctx.user._id,
      runtimeId: args.runtimeId,
      status: url ? "loading" : "idle",
      tabId,
      title: "",
      url,
    });
  },
  returns: v.id("previewSessions"),
});

export const navigate = authedMutation({
  args: {
    sessionId: v.id("previewSessions"),
    url: v.string(),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db.get("previewSessions", args.sessionId);
    if (!row) {
      throw new Error("Preview session not found");
    }
    if (row.requestedBy !== ctx.user._id) {
      throw new Error("Unauthorized");
    }
    const parsed = parsePreviewUrl(args.url);
    if (!parsed.ok) {
      throw new Error(previewUrlErrorMessage(parsed.reason));
    }
    const href = parsed.url.href;
    await ctx.db.patch("previewSessions", row._id, {
      body: undefined,
      contentType: undefined,
      error: undefined,
      history: pushPreviewHistory(row.history, href),
      httpStatus: undefined,
      pendingUrl: href,
      status: "loading",
      title: "",
      url: href,
    });
    return null;
  },
  returns: v.null(),
});

export const get = authedQuery({
  args: { sessionId: v.id("previewSessions") },
  handler: async (ctx, args) => {
    const row = await ctx.db.get("previewSessions", args.sessionId);
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
    return toView(row);
  },
  returns: v.union(sessionView, v.null()),
});

export const claimNext = mutation({
  args: { runtimeId: v.id("runtimes"), token: v.string() },
  handler: async (ctx, args) => {
    await getRuntimeByToken(ctx, args.runtimeId, args.token);
    await failStalePreview(ctx, args.runtimeId);
    const loading = await ctx.db
      .query("previewSessions")
      .withIndex("by_runtime_and_status", (q) =>
        q.eq("runtimeId", args.runtimeId).eq("status", "loading")
      )
      .order("asc")
      .take(8);
    const row = loading.find((item) => (item.pendingUrl ?? "").length > 0);
    if (!row) {
      return null;
    }
    const url = row.pendingUrl ?? row.url;
    await ctx.db.patch("previewSessions", row._id, {
      claimedAt: Date.now(),
      lastBridgeAt: Date.now(),
      pendingUrl: undefined,
    });
    return { _id: row._id, url };
  },
  returns: v.union(
    v.object({
      _id: v.id("previewSessions"),
      url: v.string(),
    }),
    v.null()
  ),
});

export const complete = mutation({
  args: {
    body: v.optional(v.string()),
    contentType: v.optional(v.string()),
    error: v.optional(v.string()),
    httpStatus: v.optional(v.number()),
    requestId: v.id("previewSessions"),
    runtimeId: v.id("runtimes"),
    title: v.optional(v.string()),
    token: v.string(),
    url: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await getRuntimeByToken(ctx, args.runtimeId, args.token);
    const row = await ctx.db.get("previewSessions", args.requestId);
    if (!row) {
      throw new Error("Preview session not found");
    }
    if (String(row.runtimeId) !== String(args.runtimeId)) {
      throw new Error("Preview session belongs to another runtime");
    }
    const now = Date.now();
    const failed = Boolean(args.error && args.error.length > 0);
    await ctx.db.patch("previewSessions", row._id, {
      body: failed ? undefined : clipPreviewBody(args.body ?? ""),
      completedAt: now,
      contentType: failed ? undefined : args.contentType,
      error: failed ? args.error?.slice(0, 2000) : undefined,
      httpStatus: args.httpStatus,
      lastBridgeAt: now,
      status: failed ? "failed" : "success",
      title: clipPreviewTitle(args.title ?? row.title),
      url: args.url ?? row.url,
    });
    return null;
  },
  returns: v.null(),
});
