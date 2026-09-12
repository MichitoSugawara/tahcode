import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { mutation, type MutationCtx } from "./_generated/server";
import { assertChatVisible, getMembership } from "./lib/access";
import { authedQuery } from "./lib/customFunctions";
import { sha256Hex } from "./lib/ids";
import { jobStatus, providerKind } from "./lib/validators";

const jobView = v.object({
  _id: v.id("jobs"),
  chatId: v.id("chats"),
  triggerMessageId: v.id("messages"),
  assistantMessageId: v.id("messages"),
  runtimeId: v.id("runtimes"),
  driverKind: providerKind,
  status: jobStatus,
  prompt: v.string(),
  error: v.optional(v.string()),
});

const claimView = v.union(
  v.object({
    _id: v.id("jobs"),
    chatId: v.id("chats"),
    triggerMessageId: v.id("messages"),
    assistantMessageId: v.id("messages"),
    runtimeId: v.id("runtimes"),
    driverKind: providerKind,
    status: jobStatus,
    prompt: v.string(),
    contextJson: v.string(),
  }),
  v.null(),
);

async function getRuntimeByToken(
  ctx: MutationCtx,
  runtimeId: Id<"runtimes">,
  token: string,
) {
  const runtime = await ctx.db.get("runtimes", runtimeId);
  if (!runtime) throw new Error("Runtime not found");
  const hash = await sha256Hex(token);
  if (hash !== runtime.tokenHash) throw new Error("Invalid runtime token");
  return runtime;
}

export const claimNext = mutation({
  args: {
    runtimeId: v.id("runtimes"),
    token: v.string(),
  },
  returns: claimView,
  handler: async (ctx, args) => {
    await getRuntimeByToken(ctx, args.runtimeId, args.token);
    const queued = await ctx.db
      .query("jobs")
      .withIndex("by_runtime_and_status", (q) =>
        q.eq("runtimeId", args.runtimeId).eq("status", "queued"),
      )
      .order("asc")
      .take(1);
    const job = queued[0];
    if (!job) return null;
    await ctx.db.patch("jobs", job._id, {
      status: "running",
      claimedAt: Date.now(),
    });
    await ctx.db.patch("runtimes", args.runtimeId, {
      status: "online",
      lastSeenAt: Date.now(),
    });
    return {
      _id: job._id,
      chatId: job.chatId,
      triggerMessageId: job.triggerMessageId,
      assistantMessageId: job.assistantMessageId,
      runtimeId: job.runtimeId,
      driverKind: job.driverKind,
      status: "running" as const,
      prompt: job.prompt,
      contextJson: job.contextJson,
    };
  },
});

export const heartbeat = mutation({
  args: {
    runtimeId: v.id("runtimes"),
    token: v.string(),
    hostname: v.optional(v.string()),
    providers: v.optional(
      v.array(
        v.object({
          driverKind: providerKind,
          available: v.boolean(),
          version: v.optional(v.string()),
          binaryPath: v.optional(v.string()),
        }),
      ),
    ),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const runtime = await getRuntimeByToken(ctx, args.runtimeId, args.token);
    await ctx.db.patch("runtimes", runtime._id, {
      status: "online",
      lastSeenAt: Date.now(),
      hostname: args.hostname?.slice(0, 120) ?? runtime.hostname,
    });
    for (const provider of args.providers ?? []) {
      const existing = await ctx.db
        .query("runtimeProviders")
        .withIndex("by_runtime_and_kind", (q) =>
          q.eq("runtimeId", runtime._id).eq("driverKind", provider.driverKind),
        )
        .unique();
      if (existing) {
        await ctx.db.patch("runtimeProviders", existing._id, {
          available: provider.available,
          version: provider.version,
          binaryPath: provider.binaryPath,
        });
      } else {
        await ctx.db.insert("runtimeProviders", {
          runtimeId: runtime._id,
          driverKind: provider.driverKind,
          available: provider.available,
          version: provider.version,
          binaryPath: provider.binaryPath,
        });
      }
    }
    return null;
  },
});

export const appendEvent = mutation({
  args: {
    runtimeId: v.id("runtimes"),
    token: v.string(),
    jobId: v.id("jobs"),
    type: v.union(
      v.literal("thinking"),
      v.literal("tool"),
      v.literal("text"),
      v.literal("error"),
      v.literal("done"),
    ),
    text: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await getRuntimeByToken(ctx, args.runtimeId, args.token);
    const job = await ctx.db.get("jobs", args.jobId);
    if (!job) throw new Error("Job not found");
    if (String(job.runtimeId) !== String(args.runtimeId)) {
      throw new Error("Job belongs to another runtime");
    }
    const text = args.text.slice(0, 20000);
    await ctx.db.insert("jobEvents", {
      jobId: args.jobId,
      type: args.type,
      text,
    });
    if (args.type === "text" || args.type === "tool" || args.type === "thinking") {
      const message = await ctx.db.get("messages", job.assistantMessageId);
      if (message) {
        const next = `${message.body}${text}`.slice(-100000);
        await ctx.db.patch("messages", message._id, {
          body: next,
          status: "streaming",
        });
      }
    }
    return null;
  },
});

export const complete = mutation({
  args: {
    runtimeId: v.id("runtimes"),
    token: v.string(),
    jobId: v.id("jobs"),
    finalText: v.optional(v.string()),
    error: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await getRuntimeByToken(ctx, args.runtimeId, args.token);
    const job = await ctx.db.get("jobs", args.jobId);
    if (!job) throw new Error("Job not found");
    if (String(job.runtimeId) !== String(args.runtimeId)) {
      throw new Error("Job belongs to another runtime");
    }
    const failed = args.error !== undefined && args.error.length > 0;
    await ctx.db.patch("jobs", job._id, {
      status: failed ? "failed" : "done",
      error: args.error?.slice(0, 2000),
      completedAt: Date.now(),
    });
    const message = await ctx.db.get("messages", job.assistantMessageId);
    if (message) {
      if (args.finalText !== undefined) {
        await ctx.db.patch("messages", message._id, {
          body: args.finalText.slice(-100000),
          status: failed ? "error" : "done",
        });
      } else {
        await ctx.db.patch("messages", message._id, {
          status: failed ? "error" : "done",
        });
      }
    }
    await ctx.db.insert("jobEvents", {
      jobId: job._id,
      type: failed ? "error" : "done",
      text: (args.error ?? args.finalText ?? "done").slice(0, 5000),
    });
    return null;
  },
});

export const get = authedQuery({
  args: { jobId: v.id("jobs") },
  returns: v.union(
    v.object({
      job: jobView,
      events: v.array(
        v.object({
          _id: v.id("jobEvents"),
          type: v.string(),
          text: v.string(),
        }),
      ),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const job = await ctx.db.get("jobs", args.jobId);
    if (!job) return null;
    const chat = await ctx.db.get("chats", job.chatId);
    if (!chat) return null;
    const membership = await getMembership(ctx, chat.orgId, ctx.user._id);
    if (!membership) return null;
    try {
      await assertChatVisible(ctx, chat, ctx.user._id, membership.role);
    } catch {
      return null;
    }
    const events = await ctx.db
      .query("jobEvents")
      .withIndex("by_job", (q) => q.eq("jobId", args.jobId))
      .order("asc")
      .take(200);
    return {
      job: {
        _id: job._id,
        chatId: job.chatId,
        triggerMessageId: job.triggerMessageId,
        assistantMessageId: job.assistantMessageId,
        runtimeId: job.runtimeId,
        driverKind: job.driverKind,
        status: job.status,
        prompt: job.prompt,
        error: job.error,
      },
      events: events.map((event) => ({
        _id: event._id,
        type: event.type,
        text: event.text,
      })),
    };
  },
});

export const listByChat = authedQuery({
  args: { chatId: v.id("chats") },
  returns: v.array(jobView),
  handler: async (ctx, args) => {
    const chat = await ctx.db.get("chats", args.chatId);
    if (!chat) throw new Error("Chat not found");
    const membership = await getMembership(ctx, chat.orgId, ctx.user._id);
    if (!membership) throw new Error("Not a member of this organization");
    await assertChatVisible(ctx, chat, ctx.user._id, membership.role);
    const jobs = await ctx.db
      .query("jobs")
      .withIndex("by_chat", (q) => q.eq("chatId", args.chatId))
      .order("desc")
      .take(50);
    return jobs.map((job) => ({
      _id: job._id,
      chatId: job.chatId,
      triggerMessageId: job.triggerMessageId,
      assistantMessageId: job.assistantMessageId,
      runtimeId: job.runtimeId,
      driverKind: job.driverKind,
      status: job.status,
      prompt: job.prompt,
      error: job.error,
    }));
  },
});
