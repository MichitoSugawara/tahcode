import { v } from "convex/values";

import {
  isAgentToolName,
  optionalString,
  parseAgentToolArgsJson,
} from "../shared/agentTools.ts";
import {
  connectorActionByToolName,
  connectorProviderLabel,
  isConnectorActionToolName,
} from "../shared/connectorActionCatalog.ts";
import type { ConnectorActionToolName } from "../shared/connectorActionCatalog.ts";
import { selectInjectedConnections } from "../shared/connectorMentions.ts";
import { mentionedConnectorsFromText } from "../shared/opsMcp.ts";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { action, internalMutation, mutation } from "./_generated/server";
import { getMembership } from "./lib/access";
import { runAgentTool } from "./lib/agentToolHandlers";
import { runConnectorAction } from "./lib/connectorActionTools";
import { isVisibleConnectorConnection } from "./lib/connectors";
import { listVisibleJobConnectors } from "./lib/jobOps";
import { getRuntimeByToken, requireJobLease } from "./lib/runtimeAuth";
import {
  gateResultJson,
  markToolApprovalExecuted,
  requireToolApproval,
} from "./lib/toolApprovals";
import {
  agentToolName,
  connectorActionToolName,
  toolInvokeApproval,
} from "./lib/validators";

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
    const gate = await requireToolApproval(ctx, {
      argsJson: args.argsJson,
      job,
      name: args.name,
      userId: user._id,
    });
    if (gate.status === "pending" || gate.status === "rejected") {
      return {
        approval: { id: gate.approvalId, status: gate.status },
        name: args.name,
        resultJson: gateResultJson(gate.status),
      };
    }
    const result = await runAgentTool(ctx, { job, user }, args.name, parsed);
    await markToolApprovalExecuted(ctx, gate.approvalId);
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
    approval: v.optional(toolInvokeApproval),
    name: agentToolName,
    resultJson: v.string(),
  }),
});

/**
 * Catalogued connector Actions (TAH-65). Same runtime token + job lease as
 * `invoke`. HTTP stays in this action so tokens never enter the prompt or
 * the MCP / `tahcode tool` catalog. Linear is the first catalog slice.
 */
type PreparedConnectorInvoke =
  | {
      approvalId: Id<"toolApprovals">;
      kind: "pending" | "rejected";
    }
  | {
      approvalId: Id<"toolApprovals"> | null;
      connectedAccountId: string;
      kind: "ready";
      oauthAlias: string | null;
    };

type ConnectorInvokeResult = {
  approval?: { id: Id<"toolApprovals">; status: "pending" | "rejected" };
  name: ConnectorActionToolName;
  resultJson: string;
};

export const invokeConnector = action({
  args: {
    argsJson: v.string(),
    jobId: v.id("jobs"),
    leaseId: v.string(),
    name: connectorActionToolName,
    runtimeId: v.id("runtimes"),
    token: v.string(),
  },
  handler: async (ctx, args): Promise<ConnectorInvokeResult> => {
    if (!isConnectorActionToolName(args.name)) {
      throw new Error("Unknown tool");
    }
    const parsed = parseAgentToolArgsJson(args.argsJson);
    const prepared: PreparedConnectorInvoke = await ctx.runMutation(
      internal.agentTools.prepareConnectorInvoke,
      {
        argsJson: args.argsJson,
        jobId: args.jobId,
        leaseId: args.leaseId,
        name: args.name,
        runtimeId: args.runtimeId,
        token: args.token,
      }
    );
    if (prepared.kind !== "ready") {
      return {
        approval: { id: prepared.approvalId, status: prepared.kind },
        name: args.name,
        resultJson: gateResultJson(prepared.kind),
      };
    }
    const result = await runConnectorAction({
      args: parsed,
      connectedAccountId: prepared.connectedAccountId,
      name: args.name,
      oauthAlias: prepared.oauthAlias,
    });
    await ctx.runMutation(internal.agentTools.finishConnectorInvoke, {
      approvalId: prepared.approvalId,
      jobId: args.jobId,
      name: args.name,
    });
    return {
      name: args.name,
      resultJson: JSON.stringify(result ?? {}),
    };
  },
  returns: v.object({
    approval: v.optional(toolInvokeApproval),
    name: connectorActionToolName,
    resultJson: v.string(),
  }),
});

export const prepareConnectorInvoke = internalMutation({
  args: {
    argsJson: v.string(),
    jobId: v.id("jobs"),
    leaseId: v.string(),
    name: connectorActionToolName,
    runtimeId: v.id("runtimes"),
    token: v.string(),
  },
  handler: async (ctx, args) => {
    const runtime = await getRuntimeByToken(ctx, args.runtimeId, args.token);
    const job = await requireJobLease(ctx, args);
    if (String(runtime.orgId) !== String(job.orgId)) {
      throw new Error("Job belongs to another organization");
    }
    const trigger = await ctx.db.get("messages", job.triggerMessageId);
    if (!trigger?.authorId) {
      throw new Error("Job has no acting user");
    }
    const user = await ctx.db.get("users", trigger.authorId);
    if (!user) {
      throw new Error("Acting user not found");
    }
    const action = connectorActionByToolName(args.name);
    if (!action) {
      throw new Error("Unknown tool");
    }
    const parsed = parseAgentToolArgsJson(args.argsJson);
    const visible = await listVisibleJobConnectors(ctx, {
      orgId: job.orgId,
      provider: action.provider,
      userId: user._id,
    });
    const requestedId = optionalString(parsed, "connectionId");
    const selected = requestedId
      ? visible.filter((row) => row.connectionId === requestedId)
      : selectInjectedConnections(
          visible,
          mentionedConnectorsFromText(job.prompt)
        );
    const label = connectorProviderLabel(action.provider);
    if (requestedId && selected.length < 1) {
      throw new Error("Connection not found");
    }
    if (!requestedId && selected.length > 1) {
      throw new Error(
        `connectionId is required when multiple ${label} accounts are mentioned`
      );
    }
    const snapshot = selected[0];
    if (!snapshot) {
      throw new Error(`No connected ${label} account is mentioned in this job`);
    }
    const row = await ctx.db.get(
      "connectorConnections",
      snapshot.connectionId as Id<"connectorConnections">
    );
    if (!row) {
      throw new Error("Connection not found");
    }
    const membership = await getMembership(ctx, row.orgId, user._id);
    if (
      !membership ||
      !isVisibleConnectorConnection(row, {
        role: membership.role,
        userId: user._id,
      })
    ) {
      throw new Error("Connection not found");
    }
    if (row.status !== "connected") {
      throw new Error(`${label} is not connected. Reconnect it from Plugins.`);
    }
    const gate = await requireToolApproval(ctx, {
      argsJson: args.argsJson,
      job,
      name: args.name,
      userId: user._id,
    });
    if (gate.status === "pending" || gate.status === "rejected") {
      return {
        approvalId: gate.approvalId,
        kind: gate.status,
      };
    }
    return {
      approvalId: gate.approvalId ?? null,
      connectedAccountId: row.connectedAccountId,
      kind: "ready" as const,
      oauthAlias: row.oauthAlias ?? null,
    };
  },
  returns: v.union(
    v.object({
      approvalId: v.id("toolApprovals"),
      kind: v.union(v.literal("pending"), v.literal("rejected")),
    }),
    v.object({
      approvalId: v.union(v.id("toolApprovals"), v.null()),
      connectedAccountId: v.string(),
      kind: v.literal("ready"),
      oauthAlias: v.union(v.string(), v.null()),
    })
  ),
});

export const finishConnectorInvoke = internalMutation({
  args: {
    approvalId: v.optional(v.union(v.id("toolApprovals"), v.null())),
    jobId: v.id("jobs"),
    name: connectorActionToolName,
  },
  handler: async (ctx, args) => {
    await markToolApprovalExecuted(ctx, args.approvalId ?? undefined);
    await ctx.db.patch("jobs", args.jobId, { lastHeartbeatAt: Date.now() });
    await ctx.db.insert("jobEvents", {
      jobId: args.jobId,
      text: `tahcode:${args.name}`,
      type: "tool",
    });
    return null;
  },
  returns: v.null(),
});
