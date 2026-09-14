import {
  isLiveRuntime,
  shouldFailUnclaimedJob,
  unclaimedJobError,
} from "../../shared/runtimeHealth.ts";
import type { Doc } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

const SWEEP_LIMIT = 50;

export async function expireUnclaimedJob(
  ctx: MutationCtx,
  job: Doc<"jobs">,
  now: number,
  opts?: { force?: boolean }
): Promise<boolean> {
  if (job.status !== "queued") {
    return false;
  }
  const runtime = await ctx.db.get("runtimes", job.runtimeId);
  if (!opts?.force) {
    const assignedLive = runtime ? isLiveRuntime(runtime, now) : false;
    if (
      !shouldFailUnclaimedJob({
        assignedLive,
        now,
        queuedAt: job._creationTime,
      })
    ) {
      return false;
    }
  }
  const error = unclaimedJobError(runtime?.name);
  await ctx.db.patch("jobs", job._id, {
    completedAt: now,
    error,
    status: "failed",
  });
  const message = await ctx.db.get("messages", job.assistantMessageId);
  if (message) {
    const live = message.status === "streaming" || message.status === undefined;
    if (live) {
      await ctx.db.patch("messages", message._id, {
        body: message.body.trim().length > 0 ? message.body : error,
        status: "error",
      });
    }
  }
  await ctx.db.insert("jobEvents", {
    jobId: job._id,
    text: error,
    type: "error",
  });
  return true;
}

export async function expireUnclaimedJobs(
  ctx: MutationCtx,
  now: number
): Promise<number> {
  const queued = await ctx.db
    .query("jobs")
    .withIndex("by_status", (q) => q.eq("status", "queued"))
    .take(SWEEP_LIMIT);
  let expired = 0;
  for (const job of queued) {
    if (await expireUnclaimedJob(ctx, job, now)) {
      expired += 1;
    }
  }
  return expired;
}
