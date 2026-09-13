import { JOB_CANCELLED_MESSAGE } from "../../shared/jobs.ts";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { assertChatVisible, getMembership } from "./access";

type Ctx = QueryCtx | MutationCtx;

export async function resolveJobRequester(
  ctx: Ctx,
  job: Doc<"jobs">
): Promise<Id<"users"> | null> {
  if (job.requestedBy) {
    return job.requestedBy;
  }
  const trigger = await ctx.db.get("messages", job.triggerMessageId);
  return trigger?.authorId ?? null;
}

export async function canCancelJob(
  ctx: Ctx,
  userId: Id<"users">,
  job: Doc<"jobs">
): Promise<boolean> {
  const chat = await ctx.db.get("chats", job.chatId);
  if (!chat) {
    return false;
  }
  const membership = await getMembership(ctx, chat.orgId, userId);
  if (!membership) {
    return false;
  }
  try {
    await assertChatVisible(ctx, chat, userId, membership.role);
  } catch {
    return false;
  }
  if (membership.role === "owner" || membership.role === "admin") {
    return true;
  }
  const requester = await resolveJobRequester(ctx, job);
  if (requester && String(requester) === String(userId)) {
    return true;
  }
  if (chat.ownerId && String(chat.ownerId) === String(userId)) {
    return true;
  }
  if (String(chat.createdBy) === String(userId)) {
    return true;
  }
  const runtime = await ctx.db.get("runtimes", job.runtimeId);
  return runtime !== null && String(runtime.ownerUserId) === String(userId);
}

/** Visible chat but not allowed to cancel — vs hidden (treat as not found). */
export async function jobCancelDenial(
  ctx: Ctx,
  userId: Id<"users">,
  job: Doc<"jobs">
): Promise<"hidden" | "forbidden"> {
  const chat = await ctx.db.get("chats", job.chatId);
  if (!chat) {
    return "hidden";
  }
  const membership = await getMembership(ctx, chat.orgId, userId);
  if (!membership) {
    return "hidden";
  }
  try {
    await assertChatVisible(ctx, chat, userId, membership.role);
  } catch {
    return "hidden";
  }
  return "forbidden";
}

export async function markJobCancelled(
  ctx: MutationCtx,
  job: Doc<"jobs">
): Promise<void> {
  const now = Date.now();
  await ctx.db.patch("jobs", job._id, {
    completedAt: now,
    error: JOB_CANCELLED_MESSAGE,
    status: "cancelled",
  });
  const message = await ctx.db.get("messages", job.assistantMessageId);
  if (message) {
    const live = message.status === "streaming" || message.status === undefined;
    if (live) {
      await ctx.db.patch("messages", message._id, {
        body:
          message.body.trim().length > 0 ? message.body : JOB_CANCELLED_MESSAGE,
        status: "cancelled",
      });
    }
  }
  await ctx.db.insert("jobEvents", {
    jobId: job._id,
    text: JOB_CANCELLED_MESSAGE,
    type: "cancelled",
  });
}
