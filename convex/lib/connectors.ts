import {
  MAX_CONNECTOR_CONFIG_ID,
  MAX_CONNECTOR_CONNECTIONS,
  MAX_CONNECTOR_DISPLAY_LABEL,
  canManageConnectorConnection,
  canUpsertConnectorConnection,
  canViewConnectorConnection,
  normalizeConnectorProvider,
  normalizeOpaqueConnectorId,
  normalizeOptionalConnectorText,
} from "../../shared/connectors.ts";
import type {
  ConnectorScope,
  ConnectorStatus,
} from "../../shared/connectors.ts";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { requireMembership } from "./access";
import type { OrgRole } from "./access";

type Ctx = QueryCtx | MutationCtx;

export function summarizeConnectorConnection(row: Doc<"connectorConnections">) {
  return {
    _id: row._id,
    connectedAccountId: row.connectedAccountId,
    createdBy: row.createdBy,
    displayLabel: row.displayLabel,
    lastVerifiedAt: row.lastVerifiedAt,
    orgId: row.orgId,
    provider: row.provider,
    providerConfigId: row.providerConfigId,
    scope: row.scope,
    status: row.status,
    updatedAt: row.updatedAt,
    userId: row.userId,
  };
}

export function normalizeConnectorUpsertInput(input: {
  connectedAccountId: string;
  displayLabel?: string;
  provider: string;
  providerConfigId?: string;
  status?: ConnectorStatus;
}) {
  return {
    connectedAccountId: normalizeOpaqueConnectorId(input.connectedAccountId),
    displayLabel: normalizeOptionalConnectorText(
      input.displayLabel,
      MAX_CONNECTOR_DISPLAY_LABEL,
      "Display label"
    ),
    provider: normalizeConnectorProvider(input.provider),
    providerConfigId: normalizeOptionalConnectorText(
      input.providerConfigId,
      MAX_CONNECTOR_CONFIG_ID,
      "Provider config id"
    ),
    status: input.status ?? "connected",
  };
}

export async function listOrgConnectorConnections(
  ctx: Ctx,
  orgId: Id<"orgs">,
  provider?: string
) {
  if (provider !== undefined) {
    return await ctx.db
      .query("connectorConnections")
      .withIndex("by_org_and_provider", (q) =>
        q.eq("orgId", orgId).eq("provider", provider)
      )
      .take(MAX_CONNECTOR_CONNECTIONS);
  }
  return await ctx.db
    .query("connectorConnections")
    .withIndex("by_org", (q) => q.eq("orgId", orgId))
    .take(MAX_CONNECTOR_CONNECTIONS);
}

export async function findConnectorConnectionByAccount(
  ctx: Ctx,
  input: {
    connectedAccountId: string;
    orgId: Id<"orgs">;
    provider: string;
  }
) {
  return await ctx.db
    .query("connectorConnections")
    .withIndex("by_org_provider_account", (q) =>
      q
        .eq("orgId", input.orgId)
        .eq("provider", input.provider)
        .eq("connectedAccountId", input.connectedAccountId)
    )
    .first();
}

function matchesConnectScope(
  row: Doc<"connectorConnections">,
  input: { scope: ConnectorScope; userId?: Id<"users"> }
) {
  if (row.scope !== input.scope) {
    return false;
  }
  if (input.scope === "org") {
    return row.userId === undefined;
  }
  return row.userId === input.userId;
}

export async function findInFlightConnectorConnection(
  ctx: Ctx,
  input: {
    connectionId?: Id<"connectorConnections">;
    orgId: Id<"orgs">;
    provider: string;
    scope: ConnectorScope;
    userId?: Id<"users">;
  }
) {
  if (input.connectionId !== undefined) {
    const row = await ctx.db.get("connectorConnections", input.connectionId);
    if (
      row &&
      row.orgId === input.orgId &&
      row.provider === input.provider &&
      matchesConnectScope(row, input)
    ) {
      return row;
    }
    return null;
  }
  const rows = await listOrgConnectorConnections(
    ctx,
    input.orgId,
    input.provider
  );
  const matches = rows.filter(
    (row) => row.oauthRequestId !== undefined && matchesConnectScope(row, input)
  );
  matches.sort((left, right) => right.updatedAt - left.updatedAt);
  return matches[0] ?? null;
}

export async function findLatestConnectedConnector(
  ctx: Ctx,
  input: {
    orgId: Id<"orgs">;
    provider: string;
    scope: ConnectorScope;
    userId?: Id<"users">;
  }
) {
  const rows = await listOrgConnectorConnections(
    ctx,
    input.orgId,
    input.provider
  );
  const matches = rows.filter(
    (row) => row.status === "connected" && matchesConnectScope(row, input)
  );
  matches.sort((left, right) => right.updatedAt - left.updatedAt);
  return matches[0] ?? null;
}

export function isVisibleConnectorConnection(
  row: Doc<"connectorConnections">,
  actor: { role: OrgRole; userId: Id<"users"> }
) {
  return canViewConnectorConnection({
    actorRole: actor.role,
    actorUserId: actor.userId,
    connectionUserId: row.userId,
    scope: row.scope,
  });
}

export async function requireCanUpsertConnector(
  ctx: Ctx,
  orgId: Id<"orgs">,
  userId: Id<"users">,
  scope: ConnectorScope
) {
  const membership = await requireMembership(ctx, orgId, userId);
  if (
    !canUpsertConnectorConnection({
      actorRole: membership.role,
      scope,
    })
  ) {
    throw new Error("Admin access required");
  }
  return membership;
}

export async function requireCanManageConnector(
  ctx: Ctx,
  connection: Doc<"connectorConnections">,
  userId: Id<"users">
) {
  const membership = await requireMembership(ctx, connection.orgId, userId);
  if (
    !canManageConnectorConnection({
      actorRole: membership.role,
      actorUserId: userId,
      connectionUserId: connection.userId,
      scope: connection.scope,
    })
  ) {
    throw new Error(
      connection.scope === "org"
        ? "Admin access required"
        : "You cannot disconnect this connection"
    );
  }
  return membership;
}
