import { v } from "convex/values";

import {
  isAgentToolName,
  parseAgentToolArgsJson,
} from "../shared/agentTools.ts";
import { mutation } from "./_generated/server";
import { runAgentTool } from "./lib/agentToolHandlers";
import { getRuntimeByToken, requireJobLease } from "./lib/runtimeAuth";
import { agentToolName } from "./lib/validators";

/**
 * Runtime-authenticated dispatcher for in-job tahcode tools.
 * Acts as the user who triggered the job; every handler re-checks org
 * membership and the existing project / chat / runtime access helpers.
 */
export const invoke = mutation({
  args: {
    argsJson: v.string(),
    jobId: v.id("jobs"),
    leaseId: v.string(),
    name: agentToolName,
    runtimeId: v.id("runtimes"),
    token: v.string(),
  },
  handler: async (ctx, args) => {
    const runtime = await getRuntimeByToken(ctx, args.runtimeId, args.token);
    const job = await requireJobLease(ctx, args);
    if (String(runtime.orgId) !== String(job.orgId)) {
      throw new Error("Job belongs to another organization");
    }
    if (!isAgentToolName(args.name)) {
      throw new Error("Unknown tool");
    }
    const trigger = await ctx.db.get("messages", job.triggerMessageId);
    if (!trigger?.authorId) {
      throw new Error("Job has no acting user");
    }
    const user = await ctx.db.get("users", trigger.authorId);
    if (!user) {
      throw new Error("Acting user not found");
    }
    const parsed = parseAgentToolArgsJson(args.argsJson);
    const result = await runAgentTool(ctx, { job, user }, args.name, parsed);
    await ctx.db.patch("jobs", job._id, { lastHeartbeatAt: Date.now() });
    await ctx.db.insert("jobEvents", {
      jobId: job._id,
      text: `tahcode:${args.name}`,
      type: "tool",
    });
    return {
      name: args.name,
      resultJson: JSON.stringify(result ?? {}),
    };
  },
  returns: v.object({
    name: agentToolName,
    resultJson: v.string(),
  }),
});
