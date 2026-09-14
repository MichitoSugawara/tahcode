import { v } from "convex/values";

import {
  normalizeConnectorProvider,
  pendingConnectorAccountId,
} from "../shared/connectors.ts";
import type { Id } from "./_generated/dataModel";
import { internalMutation, internalQuery } from "./_generated/server";
import {
  findConnectorConnection,
  requireCanUpsertConnector,
} from "./lib/connectors";
import { connectorScope } from "./lib/validators";

export const assertCanStartConnect = internalQuery({
  args: {
    orgId: v.id("orgs"),
    scope: connectorScope,
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    await requireCanUpsertConnector(ctx, args.orgId, args.userId, args.scope);
    return null;
  },
  returns: v.null(),
});

export const markNeedsAuth = internalMutation({
  args: {
    orgId: v.id("orgs"),
    provider: v.string(),
    scope: connectorScope,
    userId: v.id("users"),
  },
  handler: async (ctx, args): Promise<Id<"connectorConnections">> => {
    const provider = normalizeConnectorProvider(args.provider);
    const existing = await findConnectorConnection(ctx, {
      orgId: args.orgId,
      provider,
      scope: args.scope,
      userId: args.scope === "user" ? args.userId : undefined,
    });
    const now = Date.now();
    if (existing) {
      if (existing.status !== "connected") {
        await ctx.db.patch("connectorConnections", existing._id, {
          status: "needsAuth",
          updatedAt: now,
        });
      }
      return existing._id;
    }
    return await ctx.db.insert("connectorConnections", {
      connectedAccountId: pendingConnectorAccountId(provider),
      createdBy: args.userId,
      orgId: args.orgId,
      provider,
      scope: args.scope,
      status: "needsAuth",
      updatedAt: now,
      userId: args.scope === "user" ? args.userId : undefined,
    });
  },
  returns: v.id("connectorConnections"),
});
