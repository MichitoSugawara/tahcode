import { v } from "convex/values";

import {
  FS_BROWSE_STALE_MS,
  isSafeBrowsePath,
} from "../shared/filesystemBrowse.ts";
import type { Id } from "./_generated/dataModel";
import { mutation } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { assertCanUseRuntime, getMembership } from "./lib/access";
import { authedMutation, authedQuery } from "./lib/customFunctions";
import { getRuntimeByToken } from "./lib/runtimeAuth";
import { fsBrowseResult, fsBrowseStatus } from "./lib/validators";

const HISTORY_CAP = 40;

const requestView = v.object({
  _id: v.id("runtimeFsRequests"),
  error: v.optional(v.string()),
  path: v.string(),
  result: v.optional(fsBrowseResult),
  runtimeId: v.id("runtimes"),
  status: fsBrowseStatus,
});

async function failStaleBrowse(ctx: MutationCtx, runtimeId: Id<"runtimes">) {
  const running = await ctx.db
    .query("runtimeFsRequests")
    .withIndex("by_runtime_and_status", (q) =>
      q.eq("runtimeId", runtimeId).eq("status", "running")
    )
    .take(20);
  const now = Date.now();
  for (const row of running) {
    if (
      row.claimedAt !== undefined &&
      now - row.claimedAt > FS_BROWSE_STALE_MS
    ) {
      await ctx.db.patch("runtimeFsRequests", row._id, {
        completedAt: now,
        error: "The bridge did not finish listing this folder.",
        status: "failed",
      });
    }
  }
}

async function pruneOldBrowse(ctx: MutationCtx, runtimeId: Id<"runtimes">) {
  const rows = await ctx.db
    .query("runtimeFsRequests")
    .withIndex("by_runtime", (q) => q.eq("runtimeId", runtimeId))
    .take(HISTORY_CAP + 10);
  if (rows.length <= HISTORY_CAP) {
    return;
  }
  const extra = rows.slice(HISTORY_CAP);
  for (const row of extra) {
    if (row.status === "queued" || row.status === "running") {
      continue;
    }
    await ctx.db.delete("runtimeFsRequests", row._id);
  }
}

export const request = authedMutation({
  args: {
    path: v.string(),
    runtimeId: v.id("runtimes"),
  },
  handler: async (ctx, args) => {
    if (!isSafeBrowsePath(args.path)) {
      throw new Error("Folder path is invalid");
    }
    const runtime = await ctx.db.get("runtimes", args.runtimeId);
    if (!runtime) {
      throw new Error("Runtime not found");
    }
    const membership = await getMembership(ctx, runtime.orgId, ctx.user._id);
    if (!membership) {
      throw new Error("Not a member of this organization");
    }
    await assertCanUseRuntime(ctx, runtime, ctx.user._id, membership.role);
    const pending = await ctx.db
      .query("runtimeFsRequests")
      .withIndex("by_runtime_and_status", (q) =>
        q.eq("runtimeId", args.runtimeId).eq("status", "queued")
      )
      .take(20);
    for (const row of pending) {
      if (row.requestedBy === ctx.user._id) {
        await ctx.db.patch("runtimeFsRequests", row._id, {
          completedAt: Date.now(),
          error: "Replaced by a newer browse request",
          status: "failed",
        });
      }
    }
    await pruneOldBrowse(ctx, args.runtimeId);
    return await ctx.db.insert("runtimeFsRequests", {
      orgId: runtime.orgId,
      path: args.path.trim(),
      requestedBy: ctx.user._id,
      runtimeId: args.runtimeId,
      status: "queued",
    });
  },
  returns: v.id("runtimeFsRequests"),
});

export const get = authedQuery({
  args: { requestId: v.id("runtimeFsRequests") },
  handler: async (ctx, args) => {
    const row = await ctx.db.get("runtimeFsRequests", args.requestId);
    if (!row) {
      return null;
    }
    const membership = await getMembership(ctx, row.orgId, ctx.user._id);
    if (!membership) {
      return null;
    }
    if (row.requestedBy !== ctx.user._id) {
      const runtime = await ctx.db.get("runtimes", row.runtimeId);
      if (!runtime) {
        return null;
      }
      try {
        await assertCanUseRuntime(ctx, runtime, ctx.user._id, membership.role);
      } catch {
        return null;
      }
    }
    return {
      _id: row._id,
      error: row.error,
      path: row.path,
      result: row.result,
      runtimeId: row.runtimeId,
      status: row.status,
    };
  },
  returns: v.union(requestView, v.null()),
});

export const claimNext = mutation({
  args: { runtimeId: v.id("runtimes"), token: v.string() },
  handler: async (ctx, args) => {
    await getRuntimeByToken(ctx, args.runtimeId, args.token);
    await failStaleBrowse(ctx, args.runtimeId);
    const queued = await ctx.db
      .query("runtimeFsRequests")
      .withIndex("by_runtime_and_status", (q) =>
        q.eq("runtimeId", args.runtimeId).eq("status", "queued")
      )
      .order("asc")
      .take(1);
    const row = queued[0];
    if (!row) {
      return null;
    }
    await ctx.db.patch("runtimeFsRequests", row._id, {
      claimedAt: Date.now(),
      status: "running",
    });
    return { _id: row._id, path: row.path };
  },
  returns: v.union(
    v.object({
      _id: v.id("runtimeFsRequests"),
      path: v.string(),
    }),
    v.null()
  ),
});

export const complete = mutation({
  args: {
    error: v.optional(v.string()),
    requestId: v.id("runtimeFsRequests"),
    result: v.optional(fsBrowseResult),
    runtimeId: v.id("runtimes"),
    token: v.string(),
  },
  handler: async (ctx, args) => {
    await getRuntimeByToken(ctx, args.runtimeId, args.token);
    const row = await ctx.db.get("runtimeFsRequests", args.requestId);
    if (!row) {
      throw new Error("Browse request not found");
    }
    if (String(row.runtimeId) !== String(args.runtimeId)) {
      throw new Error("Browse request belongs to another runtime");
    }
    if (row.status !== "running") {
      return null;
    }
    const failed = Boolean(args.error && args.error.length > 0);
    await ctx.db.patch("runtimeFsRequests", row._id, {
      completedAt: Date.now(),
      error: failed ? args.error?.slice(0, 2000) : undefined,
      result: failed ? undefined : args.result,
      status: failed ? "failed" : "done",
    });
    return null;
  },
  returns: v.null(),
});
