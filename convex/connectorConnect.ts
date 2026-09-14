import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";

import { normalizeConnectorProvider } from "../shared/connectors.ts";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { action } from "./_generated/server";
import { connectorScope } from "./lib/validators";

const LINEAR_PROVIDER = "linear";

/**
 * Starts Linear connect for an org or user mapping.
 * TAH-42 fills authorizeUrl by talking to the OpenConnector worker.
 * This stub never persists OAuth tokens — only an opaque mapping row.
 */
export const startLinearConnect = action({
  args: {
    orgId: v.id("orgs"),
    scope: connectorScope,
  },
  handler: async (
    ctx,
    args
  ): Promise<{
    authorizeUrl: string | null;
    connectionId: Id<"connectorConnections">;
    ready: boolean;
    reason: "oauth_not_configured" | "started";
  }> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Not authenticated");
    }
    await ctx.runQuery(internal.connectorConnectHelpers.assertCanStartConnect, {
      orgId: args.orgId,
      scope: args.scope,
      userId,
    });
    const connectionId: Id<"connectorConnections"> = await ctx.runMutation(
      internal.connectorConnectHelpers.markNeedsAuth,
      {
        orgId: args.orgId,
        provider: normalizeConnectorProvider(LINEAR_PROVIDER),
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
  },
  returns: v.object({
    authorizeUrl: v.union(v.string(), v.null()),
    connectionId: v.id("connectorConnections"),
    ready: v.boolean(),
    reason: v.union(v.literal("oauth_not_configured"), v.literal("started")),
  }),
});
