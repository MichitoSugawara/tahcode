import { v } from "convex/values";

import { resolveCompletedMessageBody } from "../shared/jobs.ts";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, mutation } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { assertChatVisible, getMembership } from "./lib/access";
import { authedMutation, authedQuery } from "./lib/customFunctions";
import { randomToken } from "./lib/ids";
import {
  canCancelJob,
  jobCancelDenial,
  markJobCancelled,
} from "./lib/jobCancel";
import { expireUnclaimedJob, expireUnclaimedJobs } from "./lib/jobExpire";
import { loadJobOpsBundle } from "./lib/jobOps";
import { getRuntimeByToken, requireJobLease } from "./lib/runtimeAuth";
import { MAX_JOB_ATTEMPTS, STALE_JOB_MS } from "./lib/runtimeHealth";
import { upsertProviderReports } from "./lib/runtimeReports";
import { loadJobSkills } from "./lib/skills";
import {
  jobOpsBundle,
  jobSkillPayload,
  jobStatus,
  optionSelection,
  providerKind,
  runtimeProviderReport,
} from "./lib/validators";

const jobView = v.object({
  _id: v.id("jobs"),
  assistantMessageId: v.id("messages"),
  canCancel: v.boolean(),
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

async function toJobView(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
  job: Doc<"jobs">
) {
  return {
    _id: job._id,
    assistantMessageId: job.assistantMessageId,
    canCancel: await canCancelJob(ctx, userId, job),
    chatId: job.chatId,
    driverKind: job.driverKind,
    error: job.error,
    model: job.model,
    options: job.options,
    prompt: job.prompt,
    runtimeId: job.runtimeId,
    status: job.status,
    triggerMessageId: job.triggerMessageId,
  };
}

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
    multicaTaskId: v.optional(v.string()),
    opsBundle: jobOpsBundle,
    skills: v.array(jobSkillPayload),
    toolChatId: v.optional(v.id("chats")),
  }),
  v.null()
);

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
    const opsBundle = await loadJobOpsBundle(ctx, job);
    return {
      _id: job._id,
      assistantMessageId: job.assistantMessageId,
      chatId: job.chatId,
      contextJson: job.contextJson,
      driverKind: job.driverKind,
      leaseId,
      model: job.model,
      multicaTaskId: job.multicaTaskId,
      opsBundle,
      options: job.options,
      prompt: job.prompt,
      runtimeId: job.runtimeId,
      skills,
      status: "running" as const,
      toolChatId: job.toolChatId,
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
    const existing = await ctx.db.get("jobs", args.jobId);
    if (!existing || existing.status === "cancelled") {
      return null;
    }
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
    const existing = await ctx.db.get("jobs", args.jobId);
    if (
      !existing ||
      existing.status === "cancelled" ||
      existing.status === "done" ||
      existing.status === "failed"
    ) {
      return null;
    }
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
          body: resolveCompletedMessageBody(message.body, args.finalText),
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
      job: await toJobView(ctx, ctx.user._id, job),
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
    const views = [];
    for (const job of jobs) {
      views.push(await toJobView(ctx, ctx.user._id, job));
    }
    return views;
  },
  returns: v.array(jobView),
});

const ACTIVE_STATUSES = ["running", "queued"] as const;

export const activeForChat = authedQuery({
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
    let latest: Doc<"jobs"> | null = null;
    for (const status of ACTIVE_STATUSES) {
      const page = await ctx.db
        .query("jobs")
        .withIndex("by_chat_and_status", (q) =>
          q.eq("chatId", args.chatId).eq("status", status)
        )
        .order("desc")
        .take(1);
      const candidate = page[0];
      if (!candidate) {
        continue;
      }
      if (!latest || candidate._creationTime > latest._creationTime) {
        latest = candidate;
      }
    }
    return latest ? await toJobView(ctx, ctx.user._id, latest) : null;
  },
  returns: v.union(jobView, v.null()),
});

export const failIfUnclaimed = internalMutation({
  args: { jobId: v.id("jobs") },
  handler: async (ctx, args) => {
    const job = await ctx.db.get("jobs", args.jobId);
    if (!job) {
      return null;
    }
    await expireUnclaimedJob(ctx, job, Date.now(), { force: true });
    return null;
  },
  returns: v.null(),
});

export const failUnclaimedSweep = internalMutation({
  args: {},
  handler: async (ctx) => await expireUnclaimedJobs(ctx, Date.now()),
  returns: v.number(),
});

export const cancel = authedMutation({
  args: { jobId: v.id("jobs") },
  handler: async (ctx, args) => {
    const job = await ctx.db.get("jobs", args.jobId);
    if (!job) {
      throw new Error("ジョブが見つかりません");
    }
    const allowed = await canCancelJob(ctx, ctx.user._id, job);
    if (!allowed) {
      const denial = await jobCancelDenial(ctx, ctx.user._id, job);
      throw new Error(
        denial === "hidden"
          ? "ジョブが見つかりません"
          : "このジョブを中断する権限がありません"
      );
    }
    if (job.status === "cancelled") {
      return null;
    }
    if (job.status === "done" || job.status === "failed") {
      throw new Error("このジョブはすでに終了しています");
    }
    await markJobCancelled(ctx, job);
    return null;
  },
  returns: v.null(),
});

export const shouldAbort = mutation({
  args: {
    jobId: v.id("jobs"),
    leaseId: v.optional(v.string()),
    runtimeId: v.id("runtimes"),
    token: v.string(),
  },
  handler: async (ctx, args) => {
    await getRuntimeByToken(ctx, args.runtimeId, args.token);
    const job = await ctx.db.get("jobs", args.jobId);
    if (!job) {
      return true;
    }
    if (String(job.runtimeId) !== String(args.runtimeId)) {
      throw new Error("Job belongs to another runtime");
    }
    if (
      job.leaseId &&
      args.leaseId !== undefined &&
      args.leaseId !== job.leaseId
    ) {
      return true;
    }
    return job.status === "cancelled";
  },
  returns: v.boolean(),
});
