import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { sha256Hex } from "./ids";

export async function getRuntimeByToken(
  ctx: MutationCtx,
  runtimeId: Id<"runtimes">,
  token: string
): Promise<Doc<"runtimes">> {
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

export async function requireJobLease(
  ctx: MutationCtx,
  args: { jobId: Id<"jobs">; leaseId?: string; runtimeId: Id<"runtimes"> }
): Promise<Doc<"jobs">> {
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
  // Published tahcode@0.1.0 omits leaseId on appendEvent/complete. Token +
  // runtimeId already prove this runtime owns the job; only reject a
  // provided lease that does not match the current claim.
  if (
    job.leaseId &&
    args.leaseId !== undefined &&
    args.leaseId !== job.leaseId
  ) {
    throw new Error("Job lease expired");
  }
  return job;
}
