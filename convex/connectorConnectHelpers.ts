import { v } from "convex/values";

import {
  MAX_CONNECTOR_OAUTH_ALIAS,
  MAX_CONNECTOR_OAUTH_REQUEST_ID,
  normalizeConnectorProvider,
  normalizeOptionalConnectorText,
  pendingConnectorAccountId,
} from "../shared/connectors.ts";
import type { ConnectorStatus } from "../shared/connectors.ts";
import type { Id } from "./_generated/dataModel";
import { internalMutation, internalQuery } from "./_generated/server";
import {
  findConnectorConnection,
  normalizeConnectorUpsertInput,
  requireCanUpsertConnector,
} from "./lib/connectors";
import { connectorScope, connectorStatus } from "./lib/validators";

const connectContext = v.object({
  connectedAccountId: v.union(v.string(), v.null()),
  connectionId: v.union(v.id("connectorConnections"), v.null()),
  oauthAlias: v.union(v.string(), v.null()),
  oauthRequestId: v.union(v.string(), v.null()),
  orgSlug: v.string(),
  status: v.union(connectorStatus, v.null()),
});

export const assertCanStartConnect = internalQuery({
  args: {
    orgId: v.id("orgs"),
    scope: connectorScope,
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    await requireCanUpsertConnector(ctx, args.orgId, args.userId, args.scope);
    const org = await ctx.db.get("orgs", args.orgId);
    if (!org) {
      throw new Error("Organization not found");
    }
    return { orgSlug: org.slug };
  },
  returns: v.object({ orgSlug: v.string() }),
});

export const loadConnectContext = internalQuery({
  args: {
    orgId: v.id("orgs"),
    provider: v.string(),
    scope: connectorScope,
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    await requireCanUpsertConnector(ctx, args.orgId, args.userId, args.scope);
    const org = await ctx.db.get("orgs", args.orgId);
    if (!org) {
      throw new Error("Organization not found");
    }
    const existing = await findConnectorConnection(ctx, {
      orgId: args.orgId,
      provider: normalizeConnectorProvider(args.provider),
      scope: args.scope,
      userId: args.scope === "user" ? args.userId : undefined,
    });
    return {
      connectedAccountId: existing?.connectedAccountId ?? null,
      connectionId: existing?._id ?? null,
      oauthAlias: existing?.oauthAlias ?? null,
      oauthRequestId: existing?.oauthRequestId ?? null,
      orgSlug: org.slug,
      status: existing?.status ?? null,
    };
  },
  returns: connectContext,
});

export const markNeedsAuth = internalMutation({
  args: {
    oauthRequestId: v.optional(v.string()),
    orgId: v.id("orgs"),
    provider: v.string(),
    scope: connectorScope,
    userId: v.id("users"),
  },
  handler: async (ctx, args): Promise<Id<"connectorConnections">> => {
    const provider = normalizeConnectorProvider(args.provider);
    const oauthRequestId = normalizeOptionalConnectorText(
      args.oauthRequestId,
      MAX_CONNECTOR_OAUTH_REQUEST_ID,
      "OAuth request id"
    );
    const existing = await findConnectorConnection(ctx, {
      orgId: args.orgId,
      provider,
      scope: args.scope,
      userId: args.scope === "user" ? args.userId : undefined,
    });
    const now = Date.now();
    if (existing) {
      const patch: {
        oauthRequestId?: string;
        status?: ConnectorStatus;
        updatedAt: number;
      } = { updatedAt: now };
      if (oauthRequestId !== undefined) {
        patch.oauthRequestId = oauthRequestId;
      }
      if (existing.status !== "connected") {
        patch.status = "needsAuth";
      }
      await ctx.db.patch("connectorConnections", existing._id, patch);
      return existing._id;
    }
    return await ctx.db.insert("connectorConnections", {
      connectedAccountId: pendingConnectorAccountId(provider),
      createdBy: args.userId,
      oauthRequestId,
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

export const applyConnectResult = internalMutation({
  args: {
    connectedAccountId: v.optional(v.string()),
    displayLabel: v.optional(v.string()),
    lastVerifiedAt: v.optional(v.number()),
    oauthAlias: v.optional(v.string()),
    orgId: v.id("orgs"),
    provider: v.string(),
    scope: connectorScope,
    status: connectorStatus,
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
    const oauthAlias = normalizeOptionalConnectorText(
      args.oauthAlias,
      MAX_CONNECTOR_OAUTH_ALIAS,
      "OAuth alias"
    );
    if (args.connectedAccountId === undefined) {
      if (!existing) {
        throw new Error("Connection not found");
      }
      await ctx.db.patch("connectorConnections", existing._id, {
        oauthAlias: oauthAlias ?? existing.oauthAlias,
        status: args.status,
        updatedAt: now,
      });
      return existing._id;
    }
    const fields = normalizeConnectorUpsertInput({
      connectedAccountId: args.connectedAccountId,
      displayLabel: args.displayLabel,
      provider,
      status: args.status,
    });
    const lastVerifiedAt =
      args.lastVerifiedAt ??
      (fields.status === "connected" ? now : existing?.lastVerifiedAt);
    if (existing) {
      await ctx.db.patch("connectorConnections", existing._id, {
        connectedAccountId: fields.connectedAccountId,
        displayLabel: fields.displayLabel ?? existing.displayLabel,
        lastVerifiedAt,
        oauthAlias: oauthAlias ?? existing.oauthAlias,
        status: fields.status,
        updatedAt: now,
      });
      return existing._id;
    }
    return await ctx.db.insert("connectorConnections", {
      connectedAccountId: fields.connectedAccountId,
      createdBy: args.userId,
      displayLabel: fields.displayLabel,
      lastVerifiedAt,
      oauthAlias,
      orgId: args.orgId,
      provider: fields.provider,
      scope: args.scope,
      status: fields.status,
      updatedAt: now,
      userId: args.scope === "user" ? args.userId : undefined,
    });
  },
  returns: v.id("connectorConnections"),
});
