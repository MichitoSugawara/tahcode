import { v } from "convex/values";

import {
  MAX_CONNECTOR_CONNECTIONS,
  MAX_CONNECTOR_OAUTH_ALIAS,
  MAX_CONNECTOR_OAUTH_REQUEST_ID,
  isPendingConnectorAccountId,
  normalizeConnectorProvider,
  normalizeOptionalConnectorText,
  pendingConnectorAccountId,
} from "../shared/connectors.ts";
import type { ConnectorStatus } from "../shared/connectors.ts";
import type { Id } from "./_generated/dataModel";
import { internalMutation, internalQuery } from "./_generated/server";
import {
  findConnectorConnectionByAccount,
  findInFlightConnectorConnection,
  findLatestConnectedConnector,
  listOrgConnectorConnections,
  matchesConnectScope,
  normalizeConnectorUpsertInput,
  requireCanManageConnector,
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
    connectionId: v.optional(v.id("connectorConnections")),
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
    const provider = normalizeConnectorProvider(args.provider);
    const scopeUserId = args.scope === "user" ? args.userId : undefined;
    if (args.connectionId !== undefined) {
      const row = await ctx.db.get("connectorConnections", args.connectionId);
      if (
        !row ||
        row.orgId !== args.orgId ||
        row.provider !== provider ||
        !matchesConnectScope(row, { scope: args.scope, userId: scopeUserId })
      ) {
        return {
          connectedAccountId: null,
          connectionId: null,
          oauthAlias: null,
          oauthRequestId: null,
          orgSlug: org.slug,
          status: null,
        };
      }
      return {
        connectedAccountId: row.connectedAccountId,
        connectionId: row._id,
        oauthAlias: row.oauthAlias ?? null,
        oauthRequestId: row.oauthRequestId ?? null,
        orgSlug: org.slug,
        status: row.status,
      };
    }
    const inflight = await findInFlightConnectorConnection(ctx, {
      orgId: args.orgId,
      provider,
      scope: args.scope,
      userId: scopeUserId,
    });
    const existing =
      inflight ??
      (await findLatestConnectedConnector(ctx, {
        orgId: args.orgId,
        provider,
        scope: args.scope,
        userId: scopeUserId,
      }));
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
    connectionId: v.optional(v.id("connectorConnections")),
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
    const now = Date.now();
    if (args.connectionId !== undefined) {
      const existing = await ctx.db.get(
        "connectorConnections",
        args.connectionId
      );
      if (
        !existing ||
        existing.orgId !== args.orgId ||
        existing.provider !== provider
      ) {
        throw new Error("Connection not found");
      }
      await requireCanManageConnector(ctx, existing, args.userId);
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
    const existingCount = (await listOrgConnectorConnections(ctx, args.orgId))
      .length;
    if (existingCount >= MAX_CONNECTOR_CONNECTIONS) {
      throw new Error("Connector connection limit reached");
    }
    return await ctx.db.insert("connectorConnections", {
      connectedAccountId: pendingConnectorAccountId(
        provider,
        oauthRequestId ?? `new-${now}`
      ),
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
    connectionId: v.optional(v.id("connectorConnections")),
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
    const inflight = await findInFlightConnectorConnection(ctx, {
      connectionId: args.connectionId,
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
      if (!inflight) {
        throw new Error("Connection not found");
      }
      await ctx.db.patch("connectorConnections", inflight._id, {
        oauthAlias: oauthAlias ?? inflight.oauthAlias,
        status: args.status,
        updatedAt: now,
      });
      return inflight._id;
    }
    const fields = normalizeConnectorUpsertInput({
      connectedAccountId: args.connectedAccountId,
      displayLabel: args.displayLabel,
      provider,
      status: args.status,
    });
    const byAccount = await findConnectorConnectionByAccount(ctx, {
      connectedAccountId: fields.connectedAccountId,
      orgId: args.orgId,
      provider,
    });
    const lastVerifiedAt =
      args.lastVerifiedAt ??
      (fields.status === "connected" ? now : byAccount?.lastVerifiedAt);
    if (byAccount) {
      await ctx.db.patch("connectorConnections", byAccount._id, {
        displayLabel: byAccount.displayLabel ?? fields.displayLabel,
        lastVerifiedAt,
        oauthAlias: oauthAlias ?? byAccount.oauthAlias,
        status: fields.status,
        updatedAt: now,
      });
      if (
        inflight &&
        inflight._id !== byAccount._id &&
        isPendingConnectorAccountId(inflight.connectedAccountId)
      ) {
        await ctx.db.delete("connectorConnections", inflight._id);
      }
      return byAccount._id;
    }
    if (inflight) {
      await ctx.db.patch("connectorConnections", inflight._id, {
        connectedAccountId: fields.connectedAccountId,
        displayLabel: inflight.displayLabel ?? fields.displayLabel,
        lastVerifiedAt,
        oauthAlias: oauthAlias ?? inflight.oauthAlias,
        status: fields.status,
        updatedAt: now,
      });
      return inflight._id;
    }
    const existingCount = (await listOrgConnectorConnections(ctx, args.orgId))
      .length;
    if (existingCount >= MAX_CONNECTOR_CONNECTIONS) {
      throw new Error("Connector connection limit reached");
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
