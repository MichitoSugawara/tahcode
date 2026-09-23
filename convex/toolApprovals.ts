import { v } from "convex/values";

import { mutation } from "./_generated/server";
import { authedMutation, authedQuery } from "./lib/customFunctions";
import { canCancelJob } from "./lib/jobCancel";
import { getRuntimeByToken } from "./lib/runtimeAuth";
import {
  decideToolApproval,
  listVisibleApprovals,
  requestDemoApproval,
  toToolApprovalView,
} from "./lib/toolApprovals";
import {
  toolApprovalDecision,
  toolApprovalStatus,
  toolApprovalView,
} from "./lib/validators";

const listResult = v.union(
  v.null(),
  v.object({
    chatId: v.id("chats"),
    items: v.array(toolApprovalView),
  })
);

export const listForChat = authedQuery({
  args: {
    chatId: v.id("chats"),
  },
  handler: async (ctx, args) =>
    await listVisibleApprovals(ctx, args.chatId, ctx.user._id),
  returns: listResult,
});

export const listForJob = authedQuery({
  args: {
    jobId: v.id("jobs"),
  },
  handler: async (ctx, args) => {
    const job = await ctx.db.get("jobs", args.jobId);
    if (!job) {
      return null;
    }
    return await listVisibleApprovals(ctx, job.chatId, ctx.user._id, job._id);
  },
  returns: listResult,
});

export const decide = authedMutation({
  args: {
    approvalId: v.id("toolApprovals"),
    decision: toolApprovalDecision,
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get("toolApprovals", args.approvalId);
    if (existing?.jobId) {
      const job = await ctx.db.get("jobs", existing.jobId);
      if (!job || !(await canCancelJob(ctx, ctx.user._id, job))) {
        throw new Error("この操作を承認する権限がありません");
      }
    }
    const row = await decideToolApproval(ctx, {
      approvalId: args.approvalId,
      decision: args.decision,
      userId: ctx.user._id,
    });
    return toToolApprovalView(row);
  },
  returns: toolApprovalView,
});

export const requestDemo = authedMutation({
  args: {
    chatId: v.id("chats"),
  },
  handler: async (ctx, args) => {
    const row = await requestDemoApproval(ctx, {
      chatId: args.chatId,
      userId: ctx.user._id,
    });
    return toToolApprovalView(row);
  },
  returns: toolApprovalView,
});

export const poll = mutation({
  args: {
    approvalId: v.id("toolApprovals"),
    jobId: v.id("jobs"),
    leaseId: v.optional(v.string()),
    runtimeId: v.id("runtimes"),
    token: v.string(),
  },
  handler: async (ctx, args) => {
    await getRuntimeByToken(ctx, args.runtimeId, args.token);
    const job = await ctx.db.get("jobs", args.jobId);
    if (!job || String(job.runtimeId) !== String(args.runtimeId)) {
      return { status: "cancelled" as const };
    }
    if (
      job.leaseId &&
      args.leaseId !== undefined &&
      args.leaseId !== job.leaseId
    ) {
      return { status: "cancelled" as const };
    }
    if (job.status !== "running") {
      return { status: "cancelled" as const };
    }
    const row = await ctx.db.get("toolApprovals", args.approvalId);
    if (!row || String(row.jobId ?? "") !== String(job._id)) {
      return { status: "cancelled" as const };
    }
    await ctx.db.patch("jobs", job._id, { lastHeartbeatAt: Date.now() });
    return { status: row.status };
  },
  returns: v.object({
    status: toolApprovalStatus,
  }),
});
