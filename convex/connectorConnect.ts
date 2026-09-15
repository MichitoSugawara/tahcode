import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";

import {
  isKnownConnectorProvider,
  normalizeConnectorProvider,
} from "../shared/connectors.ts";
import type { ConnectorScope } from "../shared/connectors.ts";
import {
  confirmConnectorConnectionRequest,
  connectorDisplayLabel,
  getLinearConnectionRequest,
  getLinearManagedConnection,
  healthCheckGithubConnection,
  healthCheckLinearConnection,
  isOpenConnectorConfigured,
  readOpenConnectorEnv,
  resolveLinearReturnSiteUrl,
  startConnectorConnectionRequest,
} from "../shared/openConnector.ts";
import type { LinearViewer } from "../shared/openConnector.ts";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { action } from "./_generated/server";
import type { ActionCtx } from "./_generated/server";
import { connectorScope } from "./lib/validators";

declare const process: { env: Record<string, string | undefined> };

const CONNECT_USER_ERROR = "認証を開始できません。管理者に連絡してください。";

function throwConnectUserError(): never {
  throw new Error(CONNECT_USER_ERROR);
}

type StartConnectResult = {
  authorizeUrl: string | null;
  connectionId: Id<"connectorConnections"> | null;
  ready: boolean;
  reason: "oauth_not_configured" | "started";
};

type CompleteConnectResult = {
  connectionId: Id<"connectorConnections"> | null;
  displayLabel: string | null;
  status: "pending" | "connected" | "failed" | "missing_request";
};

const startConnectReturns = v.object({
  authorizeUrl: v.union(v.string(), v.null()),
  connectionId: v.union(v.id("connectorConnections"), v.null()),
  ready: v.boolean(),
  reason: v.union(v.literal("oauth_not_configured"), v.literal("started")),
});

const completeConnectReturns = v.object({
  connectionId: v.union(v.id("connectorConnections"), v.null()),
  displayLabel: v.union(v.string(), v.null()),
  status: v.union(
    v.literal("pending"),
    v.literal("connected"),
    v.literal("failed"),
    v.literal("missing_request")
  ),
});

const connectStartArgs = {
  connectionId: v.optional(v.id("connectorConnections")),
  orgId: v.id("orgs"),
  returnOrigin: v.optional(v.string()),
  returnPath: v.optional(v.string()),
  scope: connectorScope,
};

const connectCompleteArgs = {
  connectionId: v.optional(v.id("connectorConnections")),
  orgId: v.id("orgs"),
  scope: connectorScope,
};

async function requireConnectUser(ctx: ActionCtx): Promise<Id<"users">> {
  const userId = await getAuthUserId(ctx);
  if (!userId) {
    throw new Error("Not authenticated");
  }
  return userId;
}

function requireKnownProvider(provider: string): string {
  const normalized = normalizeConnectorProvider(provider);
  if (!isKnownConnectorProvider(normalized)) {
    throw new Error("Unknown connector");
  }
  return normalized;
}

async function healthCheckProviderConnection(input: {
  connectionAlias: string;
  provider: string;
}): Promise<{ viewer?: LinearViewer }> {
  const config = readOpenConnectorEnv(process.env);
  if (input.provider === "github") {
    return await healthCheckGithubConnection({
      config,
      connectionAlias: input.connectionAlias,
    });
  }
  return await healthCheckLinearConnection({
    config,
    connectionAlias: input.connectionAlias,
  });
}

async function startConnectForProvider(
  ctx: ActionCtx,
  args: {
    connectionId?: Id<"connectorConnections">;
    orgId: Id<"orgs">;
    returnOrigin?: string;
    returnPath?: string;
    scope: ConnectorScope;
  },
  providerInput: string
): Promise<StartConnectResult> {
  const userId = await requireConnectUser(ctx);
  const access: { orgSlug: string } = await ctx.runQuery(
    internal.connectorConnectHelpers.assertCanStartConnect,
    {
      orgId: args.orgId,
      scope: args.scope,
      userId,
    }
  );
  const provider = requireKnownProvider(providerInput);
  const envConfig = readOpenConnectorEnv(process.env);
  const siteUrl = resolveLinearReturnSiteUrl({
    envSiteUrl: envConfig.siteUrl,
    requestedOrigin: args.returnOrigin,
  });
  const config = siteUrl ? { ...envConfig, siteUrl } : envConfig;
  if (!isOpenConnectorConfigured(config)) {
    return {
      authorizeUrl: null,
      connectionId: null,
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
  let started: Awaited<ReturnType<typeof startConnectorConnectionRequest>>;
  try {
    started = await startConnectorConnectionRequest({
      config,
      connectionId,
      orgSlug: access.orgSlug,
      returnPath: args.returnPath,
      scope: args.scope,
      service: provider,
    });
  } catch {
    throwConnectUserError();
  }
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
}

async function completeConnectForProvider(
  ctx: ActionCtx,
  args: {
    connectionId?: Id<"connectorConnections">;
    orgId: Id<"orgs">;
    scope: ConnectorScope;
  },
  providerInput: string
): Promise<CompleteConnectResult> {
  const userId = await requireConnectUser(ctx);
  const provider = requireKnownProvider(providerInput);
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
  try {
    return await confirmAndStoreConnect(ctx, {
      connectionId: context.connectionId ?? undefined,
      orgId: args.orgId,
      provider,
      requestId: context.oauthRequestId,
      scope: args.scope,
      userId,
    });
  } catch {
    throwConnectUserError();
  }
}

export const startLinearConnect = action({
  args: connectStartArgs,
  handler: async (ctx, args): Promise<StartConnectResult> =>
    await startConnectForProvider(ctx, args, "linear"),
  returns: startConnectReturns,
});

export const completeLinearConnect = action({
  args: connectCompleteArgs,
  handler: async (ctx, args): Promise<CompleteConnectResult> =>
    await completeConnectForProvider(ctx, args, "linear"),
  returns: completeConnectReturns,
});

export const startGithubConnect = action({
  args: connectStartArgs,
  handler: async (ctx, args): Promise<StartConnectResult> =>
    await startConnectForProvider(ctx, args, "github"),
  returns: startConnectReturns,
});

export const completeGithubConnect = action({
  args: connectCompleteArgs,
  handler: async (ctx, args): Promise<CompleteConnectResult> =>
    await completeConnectForProvider(ctx, args, "github"),
  returns: completeConnectReturns,
});

async function confirmAndStoreConnect(
  ctx: ActionCtx,
  input: {
    connectionId?: Id<"connectorConnections">;
    orgId: Id<"orgs">;
    provider: string;
    requestId: string;
    scope: ConnectorScope;
    userId: Id<"users">;
  }
): Promise<CompleteConnectResult> {
  const config = readOpenConnectorEnv(process.env);
  const request = await getLinearConnectionRequest({
    config,
    requestId: input.requestId,
  });
  const confirmed = confirmConnectorConnectionRequest(request, input.provider);
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
  if (connection.service !== input.provider) {
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
    const health = await healthCheckProviderConnection({
      connectionAlias: connection.alias,
      provider: input.provider,
    });
    const displayLabel = connectorDisplayLabel(
      input.provider,
      health.viewer,
      connection
    );
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
        displayLabel: connectorDisplayLabel(
          input.provider,
          undefined,
          connection
        ),
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
