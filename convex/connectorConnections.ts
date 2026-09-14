import { v } from "convex/values";

import {
  MAX_CONNECTOR_CONNECTIONS,
  normalizeConnectorProvider,
} from "../shared/connectors.ts";
import { requireMembership } from "./lib/access";
import {
  findConnectorConnectionByAccount,
  isVisibleConnectorConnection,
  listOrgConnectorConnections,
  normalizeConnectorUpsertInput,
  requireCanManageConnector,
  requireCanUpsertConnector,
  summarizeConnectorConnection,
} from "./lib/connectors";
import { authedMutation, authedQuery } from "./lib/customFunctions";
import {
  connectorConnectionSummary,
  connectorScope,
  connectorStatus,
} from "./lib/validators";

export const listByOrg = authedQuery({
  args: {
    orgId: v.id("orgs"),
    provider: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const membership = await requireMembership(ctx, args.orgId, ctx.user._id);
    const provider =
      args.provider === undefined
        ? undefined
        : normalizeConnectorProvider(args.provider);
    const rows = await listOrgConnectorConnections(ctx, args.orgId, provider);
    return rows
      .filter((row) =>
        isVisibleConnectorConnection(row, {
          role: membership.role,
          userId: ctx.user._id,
        })
      )
      .map(summarizeConnectorConnection)
      .sort((left, right) => {
        if (left.scope !== right.scope) {
          return left.scope === "org" ? -1 : 1;
        }
        if (left.provider !== right.provider) {
          return left.provider < right.provider ? -1 : 1;
        }
        return left._id < right._id ? -1 : 1;
      });
  },
  returns: v.array(connectorConnectionSummary),
});

export const upsert = authedMutation({
  args: {
    connectedAccountId: v.string(),
    displayLabel: v.optional(v.string()),
    lastVerifiedAt: v.optional(v.number()),
    orgId: v.id("orgs"),
    provider: v.string(),
    providerConfigId: v.optional(v.string()),
    scope: connectorScope,
    status: v.optional(connectorStatus),
  },
  handler: async (ctx, args) => {
    await requireCanUpsertConnector(ctx, args.orgId, ctx.user._id, args.scope);
    const fields = normalizeConnectorUpsertInput(args);
    const userId = args.scope === "user" ? ctx.user._id : undefined;
    const existing = await findConnectorConnectionByAccount(ctx, {
      connectedAccountId: fields.connectedAccountId,
      orgId: args.orgId,
      provider: fields.provider,
    });
    const now = Date.now();
    const lastVerifiedAt =
      args.lastVerifiedAt ??
      (fields.status === "connected" ? now : existing?.lastVerifiedAt);
    if (existing) {
      await requireCanManageConnector(ctx, existing, ctx.user._id);
      await ctx.db.patch("connectorConnections", existing._id, {
        displayLabel: fields.displayLabel ?? existing.displayLabel,
        lastVerifiedAt,
        providerConfigId: fields.providerConfigId ?? existing.providerConfigId,
        status: fields.status,
        updatedAt: now,
      });
      return existing._id;
    }
    const existingCount = (await listOrgConnectorConnections(ctx, args.orgId))
      .length;
    if (existingCount >= MAX_CONNECTOR_CONNECTIONS) {
      throw new Error("Connector connection limit reached");
    }
    return await ctx.db.insert("connectorConnections", {
      connectedAccountId: fields.connectedAccountId,
      createdBy: ctx.user._id,
      displayLabel: fields.displayLabel,
      lastVerifiedAt,
      orgId: args.orgId,
      provider: fields.provider,
      providerConfigId: fields.providerConfigId,
      scope: args.scope,
      status: fields.status,
      updatedAt: now,
      userId,
    });
  },
  returns: v.id("connectorConnections"),
});

export const disconnect = authedMutation({
  args: { connectionId: v.id("connectorConnections") },
  handler: async (ctx, args) => {
    const connection = await ctx.db.get(
      "connectorConnections",
      args.connectionId
    );
    if (!connection) {
      throw new Error("Connection not found");
    }
    await requireCanManageConnector(ctx, connection, ctx.user._id);
    if (connection.status === "disconnected") {
      return null;
    }
    await ctx.db.patch("connectorConnections", args.connectionId, {
      status: "disconnected",
      updatedAt: Date.now(),
    });
    return null;
  },
  returns: v.null(),
});
