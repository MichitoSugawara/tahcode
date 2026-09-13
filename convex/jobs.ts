import { v } from "convex/values";

import type { Id } from "./_generated/dataModel";
import { mutation } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { assertChatVisible, getMembership } from "./lib/access";
import { authedQuery } from "./lib/customFunctions";
import { randomToken, sha256Hex } from "./lib/ids";
import { MAX_JOB_ATTEMPTS, STALE_JOB_MS } from "./lib/runtimeHealth";
import { upsertProviderReports } from "./lib/runtimeReports";
import { loadJobSkills } from "./lib/skills";
import {
  jobSkillPayload,
  jobStatus,
  optionSelection,
  providerKind,
  runtimeProviderReport,
} from "./lib/validators";

const jobView = v.object({
  _id: v.id("jobs"),
  assistantMessageId: v.id("messages"),
  chatId: v.id("chats"),
  driverKind: providerKind,
  error: v.optional(v.string()),
  model: v.optional(v.string()),
  options: v.optional(v.array(optionSelection)),
  prompt: v.string(),
  runtimeId: v.id("runtimes"),
  status: jobStatus,
  triggerMessageId: v.id("messages"),
});

const claimView = v.union(
  v.object({
    _id: v.id("jobs"),
    assistantMessageId: v.id("messages"),
    chatId: v.id("chats"),
    contextJson: v.string(),
    driverKind: providerKind,
    model: v.optional(v.string()),
    options: v.optional(v.array(optionSelection)),
    prompt: v.string(),
    runtimeId: v.id("runtimes"),
    status: jobStatus,
    triggerMessageId: v.id("messages"),
    leaseId: v.string(),
    skills: v.array(jobSkillPayload),
  }),
  v.null()
);

async function getRuntimeByToken(
  ctx: MutationCtx,
  runtimeId: Id<"runtimes">,
  token: string
) {
  const runtime = await ctx.db.get("runtimes", runtimeId);
  if (!runtime) {
    throw new Error("Runtime not found");
  }
  const hash = await sha256Hex(token);
  if (hash !== runtime.tokenHash) {
    throw new Error("Invalid runtime token");
  }
  return runtime;
}

async function recoverStaleJobs(
  ctx: MutationCtx,
  runtimeId: Id<"runtimes">,
  now: number
) {
  const running = await ctx.db
    .query("jobs")
    .withIndex("by_runtime_and_status", (q) =>
      q.eq("runtimeId", runtimeId).eq("status", "running")
    )
    .take(20);
  for (const job of running) {
    const beat = job.lastHeartbeatAt ?? job.claimedAt ?? 0;
    if (now - beat < STALE_JOB_MS) {
      continue;
    }
    const attempt = (job.attempt ?? 1) + 1;
    if (attempt > MAX_JOB_ATTEMPTS) {
      await ctx.db.patch("jobs", job._id, {
        completedAt: now,
        error: "Runtime lost contact with this job",
        status: "failed",
      });
      const message = await ctx.db.get("messages", job.assistantMessageId);
      if (message) {
        await ctx.db.patch("messages", message._id, { status: "error" });
      }
      continue;
    }
    await ctx.db.patch("jobs", job._id, {
      attempt,
      claimedAt: undefined,
      leaseId: undefined,
      status: "queued",
    });
  }
}

async function touchRunningJobs(
  ctx: MutationCtx,
  runtimeId: Id<"runtimes">,
  now: number
) {
  const running = await ctx.db
    .query("jobs")
    .withIndex("by_runtime_and_status", (q) =>
      q.eq("runtimeId", runtimeId).eq("status", "running")
    )
    .take(20);
  for (const job of running) {
    await ctx.db.patch("jobs", job._id, { lastHeartbeatAt: now });
  }
}

async function requireJobLease(
  ctx: MutationCtx,
  args: { jobId: Id<"jobs">; leaseId?: string; runtimeId: Id<"runtimes"> }
) {
  const job = await ctx.db.get("jobs", args.jobId);
  if (!job) {
    throw new Error("Job not found");
  }
  if (String(job.runtimeId) !== String(args.runtimeId)) {
    throw new Error("Job belongs to another runtime");
  }
  if (job.status !== "running") {
    throw new Error("Job is not running");
  }
  if (job.leaseId && args.leaseId !== job.leaseId) {
    throw new Error("Job lease expired");
  }
  return job;
}

export const claimNext = mutation({
  args: {
    runtimeId: v.id("runtimes"),
    token: v.string(),
  },
  handler: async (ctx, args) => {
    await getRuntimeByToken(ctx, args.runtimeId, args.token);
    const now = Date.now();
    await recoverStaleJobs(ctx, args.runtimeId, now);
    const queued = await ctx.db
      .query("jobs")
      .withIndex("by_runtime_and_status", (q) =>
        q.eq("runtimeId", args.runtimeId).eq("status", "queued")
      )
      .order("asc")
      .take(1);
    const job = queued[0];
    if (!job) {
      return null;
    }
    const leaseId = randomToken(12);
    await ctx.db.patch("jobs", job._id, {
      attempt: (job.attempt ?? 0) + 1,
      claimedAt: now,
      lastHeartbeatAt: now,
      leaseId,
      status: "running",
    });
    await ctx.db.patch("runtimes", args.runtimeId, {
      lastSeenAt: now,
      status: "online",
    });
    const chat = await ctx.db.get("chats", job.chatId);
    const skills = chat ? await loadJobSkills(ctx, chat) : [];
    return {
      _id: job._id,
      assistantMessageId: job.assistantMessageId,
      chatId: job.chatId,
      contextJson: job.contextJson,
      driverKind: job.driverKind,
      leaseId,
      model: job.model,
      options: job.options,
      prompt: job.prompt,
      runtimeId: job.runtimeId,
      skills,
      status: "running" as const,
      triggerMessageId: job.triggerMessageId,
    };
  },
  returns: claimView,
});

export const heartbeat = mutation({
  args: {
    hostname: v.optional(v.string()),
    /* newer bridges identify themselves so the UI can tell an old bridge from a missing feature */
    bridgeVersion: v.optional(v.string()),
    capabilities: v.optional(v.array(v.string())),
    providers: v.optional(v.array(runtimeProviderReport)),
    runtimeId: v.id("runtimes"),
    token: v.string(),
  },
  handler: async (ctx, args) => {
    const runtime = await getRuntimeByToken(ctx, args.runtimeId, args.token);
    const now = Date.now();
    await recoverStaleJobs(ctx, runtime._id, now);
    await touchRunningJobs(ctx, runtime._id, now);
    const runtimePatch: {
      hostname: string | undefined;
      lastSeenAt: number;
      status: "online";
      bridgeVersion?: string;
      capabilities?: string[];
    } = {
      hostname: args.hostname?.slice(0, 120) ?? runtime.hostname,
      lastSeenAt: now,
      status: "online",
    };
    if (args.bridgeVersion !== undefined) {
      runtimePatch.bridgeVersion = args.bridgeVersion.slice(0, 40);
    }
    if (args.capabilities !== undefined) {
      runtimePatch.capabilities = args.capabilities
        .slice(0, 10)
        .map((item) => item.slice(0, 40));
    }
    await ctx.db.patch("runtimes", runtime._id, runtimePatch);
    await upsertProviderReports(ctx, runtime._id, args.providers ?? []);
    return null;
  },
  returns: v.null(),
});

export const appendEvent = mutation({
  args: {
    jobId: v.id("jobs"),
    leaseId: v.optional(v.string()),
    runtimeId: v.id("runtimes"),
    text: v.string(),
    token: v.string(),
    type: v.union(
      v.literal("thinking"),
      v.literal("tool"),
      v.literal("text"),
      v.literal("error"),
      v.literal("done")
    ),
  },
  handler: async (ctx, args) => {
    await getRuntimeByToken(ctx, args.runtimeId, args.token);
    const job = await requireJobLease(ctx, args);
    const text = args.text.slice(0, 20_000);
    await ctx.db.patch("jobs", job._id, { lastHeartbeatAt: Date.now() });
    await ctx.db.insert("jobEvents", {
      jobId: args.jobId,
      type: args.type,
      text,
    });
    if (
      args.type === "text" ||
      args.type === "tool" ||
      args.type === "thinking"
    ) {
      const message = await ctx.db.get("messages", job.assistantMessageId);
      if (message) {
        const next = `${message.body}${text}`.slice(-100_000);
        await ctx.db.patch("messages", message._id, {
          body: next,
          status: "streaming",
        });
      }
    }
    return null;
  },
  returns: v.null(),
});

export const complete = mutation({
  args: {
    error: v.optional(v.string()),
    finalText: v.optional(v.string()),
    jobId: v.id("jobs"),
    leaseId: v.optional(v.string()),
    runtimeId: v.id("runtimes"),
    token: v.string(),
  },
  handler: async (ctx, args) => {
    await getRuntimeByToken(ctx, args.runtimeId, args.token);
    const job = await requireJobLease(ctx, args);
    const failed = args.error !== undefined && args.error.length > 0;
    await ctx.db.patch("jobs", job._id, {
      status: failed ? "failed" : "done",
      error: args.error?.slice(0, 2000),
      completedAt: Date.now(),
    });
    const message = await ctx.db.get("messages", job.assistantMessageId);
    if (message) {
      if (args.finalText === undefined) {
        await ctx.db.patch("messages", message._id, {
          status: failed ? "error" : "done",
        });
      } else {
        await ctx.db.patch("messages", message._id, {
          body: args.finalText.slice(-100000),
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
  returns: v.null(),
});

export const get = authedQuery({
  args: {
    cursor: v.optional(v.union(v.string(), v.null())),
    jobId: v.id("jobs"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const job = await ctx.db.get("jobs", args.jobId);
    if (!job) {
      return null;
    }
    const chat = await ctx.db.get("chats", job.chatId);
    if (!chat) {
      return null;
    }
    const membership = await getMembership(ctx, chat.orgId, ctx.user._id);
    if (!membership) {
      return null;
    }
    try {
      await assertChatVisible(ctx, chat, ctx.user._id, membership.role);
    } catch {
      return null;
    }
    const limit = Math.min(Math.max(args.limit ?? 200, 1), 200);
    const eventPage = await ctx.db
      .query("jobEvents")
      .withIndex("by_job", (q) => q.eq("jobId", args.jobId))
      .order("desc")
      .paginate({ cursor: args.cursor ?? null, numItems: limit });
    const events = [...eventPage.page].reverse();
    return {
      continueCursor: eventPage.continueCursor,
      isDone: eventPage.isDone,
      job: {
        _id: job._id,
        chatId: job.chatId,
        triggerMessageId: job.triggerMessageId,
        assistantMessageId: job.assistantMessageId,
        runtimeId: job.runtimeId,
        driverKind: job.driverKind,
        model: job.model,
        options: job.options,
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
  returns: v.union(
    v.object({
      continueCursor: v.string(),
      events: v.array(
        v.object({
          _id: v.id("jobEvents"),
          text: v.string(),
          type: v.string(),
        })
      ),
      isDone: v.boolean(),
      job: jobView,
    }),
    v.null()
  ),
});

export const listByChat = authedQuery({
  args: { chatId: v.id("chats") },
  handler: async (ctx, args) => {
    const chat = await ctx.db.get("chats", args.chatId);
    if (!chat) {
      throw new Error("Chat not found");
    }
    const membership = await getMembership(ctx, chat.orgId, ctx.user._id);
    if (!membership) {
      throw new Error("Not a member of this organization");
    }
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
      model: job.model,
      options: job.options,
      status: job.status,
      prompt: job.prompt,
      error: job.error,
    }));
  },
  returns: v.array(jobView),
});
