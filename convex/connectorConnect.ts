import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";

import { normalizeConnectorProvider } from "../shared/connectors.ts";
import type { ConnectorScope } from "../shared/connectors.ts";
import {
  confirmLinearConnectionRequest,
  getLinearConnectionRequest,
  getLinearManagedConnection,
  healthCheckLinearConnection,
  isOpenConnectorConfigured,
  linearDisplayLabel,
  readOpenConnectorEnv,
  startLinearConnectionRequest,
} from "../shared/openConnector.ts";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { action } from "./_generated/server";
import type { ActionCtx } from "./_generated/server";
import { connectorScope } from "./lib/validators";

declare const process: { env: Record<string, string | undefined> };

const LINEAR_PROVIDER = "linear";

type StartLinearConnectResult = {
  authorizeUrl: string | null;
  connectionId: Id<"connectorConnections">;
  ready: boolean;
  reason: "oauth_not_configured" | "started";
};

type CompleteLinearConnectResult = {
  connectionId: Id<"connectorConnections"> | null;
  displayLabel: string | null;
  status: "pending" | "connected" | "failed" | "missing_request";
};

async function requireConnectUser(ctx: ActionCtx): Promise<Id<"users">> {
  const userId = await getAuthUserId(ctx);
  if (!userId) {
    throw new Error("Not authenticated");
  }
  return userId;
}

export const startLinearConnect = action({
  args: {
    connectionId: v.optional(v.id("connectorConnections")),
    orgId: v.id("orgs"),
    scope: connectorScope,
  },
  handler: async (ctx, args): Promise<StartLinearConnectResult> => {
    const userId = await requireConnectUser(ctx);
    const access: { orgSlug: string } = await ctx.runQuery(
      internal.connectorConnectHelpers.assertCanStartConnect,
      {
        orgId: args.orgId,
        scope: args.scope,
        userId,
      }
    );
    const provider = normalizeConnectorProvider(LINEAR_PROVIDER);
    const config = readOpenConnectorEnv(process.env);
    if (!isOpenConnectorConfigured(config)) {
      const connectionId: Id<"connectorConnections"> = await ctx.runMutation(
        internal.connectorConnectHelpers.markNeedsAuth,
        {
          connectionId: args.connectionId,
          orgId: args.orgId,
          provider,
          scope: args.scope,
          userId,
        }
      );
      return {
        authorizeUrl: null,
        connectionId,
        ready: false,
        reason: "oauth_not_configured",
      };
    }
    const connectionId: Id<"connectorConnections"> = await ctx.runMutation(
      internal.connectorConnectHelpers.markNeedsAuth,
      {
        connectionId: args.connectionId,
        orgId: args.orgId,
        provider,
        scope: args.scope,
        userId,
      }
    );
    const started = await startLinearConnectionRequest({
      config,
      connectionId,
      orgSlug: access.orgSlug,
      scope: args.scope,
    });
    await ctx.runMutation(internal.connectorConnectHelpers.markNeedsAuth, {
      connectionId,
      oauthRequestId: started.connectionRequestId,
      orgId: args.orgId,
      provider,
      scope: args.scope,
      userId,
    });
    return {
      authorizeUrl: started.authorizationUrl,
      connectionId,
      ready: true,
      reason: "started",
    };
  },
  returns: v.object({
    authorizeUrl: v.union(v.string(), v.null()),
    connectionId: v.id("connectorConnections"),
    ready: v.boolean(),
    reason: v.union(v.literal("oauth_not_configured"), v.literal("started")),
  }),
});

export const completeLinearConnect = action({
  args: {
    connectionId: v.optional(v.id("connectorConnections")),
    orgId: v.id("orgs"),
    scope: connectorScope,
  },
  handler: async (ctx, args): Promise<CompleteLinearConnectResult> => {
    const userId = await requireConnectUser(ctx);
    const provider = normalizeConnectorProvider(LINEAR_PROVIDER);
    const context = await ctx.runQuery(
      internal.connectorConnectHelpers.loadConnectContext,
      {
        connectionId: args.connectionId,
        orgId: args.orgId,
        provider,
        scope: args.scope,
        userId,
      }
    );
    if (!context.oauthRequestId) {
      if (context.status === "connected" && context.connectionId) {
        return {
          connectionId: context.connectionId,
          displayLabel: null,
          status: "connected",
        };
      }
      return {
        connectionId: context.connectionId,
        displayLabel: null,
        status: "missing_request",
      };
    }
    const config = readOpenConnectorEnv(process.env);
    if (!isOpenConnectorConfigured(config)) {
      return {
        connectionId: context.connectionId,
        displayLabel: null,
        status: "missing_request",
      };
    }
    return await confirmAndStoreLinearConnect(ctx, {
      connectionId: context.connectionId ?? undefined,
      orgId: args.orgId,
      provider,
      requestId: context.oauthRequestId,
      scope: args.scope,
      userId,
    });
  },
  returns: v.object({
    connectionId: v.union(v.id("connectorConnections"), v.null()),
    displayLabel: v.union(v.string(), v.null()),
    status: v.union(
      v.literal("pending"),
      v.literal("connected"),
      v.literal("failed"),
      v.literal("missing_request")
    ),
  }),
});

async function confirmAndStoreLinearConnect(
  ctx: ActionCtx,
  input: {
    connectionId?: Id<"connectorConnections">;
    orgId: Id<"orgs">;
    provider: string;
    requestId: string;
    scope: ConnectorScope;
    userId: Id<"users">;
  }
): Promise<CompleteLinearConnectResult> {
  const config = readOpenConnectorEnv(process.env);
  const request = await getLinearConnectionRequest({
    config,
    requestId: input.requestId,
  });
  const confirmed = confirmLinearConnectionRequest(request);
  if (confirmed.kind === "pending") {
    return {
      connectionId: input.connectionId ?? null,
      displayLabel: null,
      status: "pending",
    };
  }
  if (confirmed.kind === "failed") {
    const connectionId = await ctx.runMutation(
      internal.connectorConnectHelpers.applyConnectResult,
      {
        connectionId: input.connectionId,
        orgId: input.orgId,
        provider: input.provider,
        scope: input.scope,
        status: "error",
        userId: input.userId,
      }
    );
    return {
      connectionId,
      displayLabel: null,
      status: "failed",
    };
  }
  const connection = await getLinearManagedConnection({
    appId: confirmed.connectedAccountId,
    config,
  });
  if (connection.service !== "linear") {
    const connectionId = await ctx.runMutation(
      internal.connectorConnectHelpers.applyConnectResult,
      {
        connectedAccountId: confirmed.connectedAccountId,
        connectionId: input.connectionId,
        orgId: input.orgId,
        provider: input.provider,
        scope: input.scope,
        status: "error",
        userId: input.userId,
      }
    );
    return {
      connectionId,
      displayLabel: null,
      status: "failed",
    };
  }
  try {
    const health = await healthCheckLinearConnection({
      config,
      connectionAlias: connection.alias,
    });
    const displayLabel = linearDisplayLabel(health.viewer, connection);
    const connectionId = await ctx.runMutation(
      internal.connectorConnectHelpers.applyConnectResult,
      {
        connectedAccountId: confirmed.connectedAccountId,
        connectionId: input.connectionId,
        displayLabel,
        lastVerifiedAt: Date.now(),
        oauthAlias: connection.alias,
        orgId: input.orgId,
        provider: input.provider,
        scope: input.scope,
        status: "connected",
        userId: input.userId,
      }
    );
    return {
      connectionId,
      displayLabel: displayLabel ?? null,
      status: "connected",
    };
  } catch {
    const connectionId = await ctx.runMutation(
      internal.connectorConnectHelpers.applyConnectResult,
      {
        connectedAccountId: confirmed.connectedAccountId,
        connectionId: input.connectionId,
        displayLabel: linearDisplayLabel(undefined, connection),
        oauthAlias: connection.alias,
        orgId: input.orgId,
        provider: input.provider,
        scope: input.scope,
        status: "error",
        userId: input.userId,
      }
    );
    return {
      connectionId,
      displayLabel: null,
      status: "failed",
    };
  }
}
