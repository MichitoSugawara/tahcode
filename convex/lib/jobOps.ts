import { normalizeConnectorProvider } from "../../shared/connectors.ts";
import { buildJobOpsBundle } from "../../shared/opsMcp.ts";
import type {
  JobConnectorSnapshot,
  JobOpsBundle,
} from "../../shared/opsMcp.ts";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { getMembership } from "./access";
import {
  isVisibleConnectorConnection,
  listOrgConnectorConnections,
} from "./connectors";

export type ClaimJobOpsBundle = {
  connectors: {
    connectedAccountId: string;
    connectionId: Id<"connectorConnections">;
    displayLabel?: string;
    lastVerifiedAt?: number;
    orgId: Id<"orgs">;
    provider: string;
    scope: JobConnectorSnapshot["scope"];
    status: JobConnectorSnapshot["status"];
  }[];
  mcp: {
    attachment: JobOpsBundle["mcp"]["attachment"];
    servers: {
      connectionId?: Id<"connectorConnections">;
      inject: boolean;
      kind: "tahcode-ops" | "connector";
      name: string;
      provider?: string;
    }[];
  };
  mentionedConnectors: JobOpsBundle["mentionedConnectors"];
};

type Ctx = QueryCtx | MutationCtx;

export function toJobConnectorSnapshot(
  row: Doc<"connectorConnections">
): JobConnectorSnapshot {
  const snapshot: JobConnectorSnapshot = {
    connectedAccountId: row.connectedAccountId,
    connectionId: String(row._id),
    orgId: String(row.orgId),
    provider: row.provider,
    scope: row.scope,
    status: row.status,
  };
  if (row.displayLabel !== undefined) {
    snapshot.displayLabel = row.displayLabel;
  }
  if (row.lastVerifiedAt !== undefined) {
    snapshot.lastVerifiedAt = row.lastVerifiedAt;
  }
  return snapshot;
}

export function agentConnectorView(row: JobConnectorSnapshot) {
  return {
    connectionId: row.connectionId,
    displayLabel: row.displayLabel,
    lastVerifiedAt: row.lastVerifiedAt,
    orgId: row.orgId,
    provider: row.provider,
    scope: row.scope,
    status: row.status,
  };
}

export async function listVisibleJobConnectors(
  ctx: Ctx,
  input: {
    orgId: Id<"orgs">;
    provider?: string;
    userId: Id<"users">;
  }
): Promise<JobConnectorSnapshot[]> {
  const membership = await getMembership(ctx, input.orgId, input.userId);
  if (!membership) {
    throw new Error("Not a member of this organization");
  }
  const provider =
    input.provider === undefined
      ? undefined
      : normalizeConnectorProvider(input.provider);
  const rows = await listOrgConnectorConnections(ctx, input.orgId, provider);
  const visible: JobConnectorSnapshot[] = [];
  for (const row of rows) {
    if (
      !isVisibleConnectorConnection(row, {
        role: membership.role,
        userId: input.userId,
      })
    ) {
      continue;
    }
    visible.push(toJobConnectorSnapshot(row));
  }
  visible.sort((left, right) => {
    if (left.scope !== right.scope) {
      return left.scope === "org" ? -1 : 1;
    }
    if (left.provider !== right.provider) {
      return left.provider < right.provider ? -1 : 1;
    }
    return left.connectionId < right.connectionId ? -1 : 1;
  });
  return visible;
}

export async function loadJobOpsBundle(
  ctx: Ctx,
  job: Doc<"jobs">
): Promise<ClaimJobOpsBundle> {
  const actorId = await actingUserId(ctx, job);
  if (!actorId) {
    return toClaimJobOpsBundle(
      buildJobOpsBundle({
        connections: [],
        driverKind: job.driverKind,
        prompt: job.prompt,
      })
    );
  }
  try {
    const connections = await listVisibleJobConnectors(ctx, {
      orgId: job.orgId,
      userId: actorId,
    });
    return toClaimJobOpsBundle(
      buildJobOpsBundle({
        connections,
        driverKind: job.driverKind,
        prompt: job.prompt,
      })
    );
  } catch {
    return toClaimJobOpsBundle(
      buildJobOpsBundle({
        connections: [],
        driverKind: job.driverKind,
        prompt: job.prompt,
      })
    );
  }
}

export function toClaimJobOpsBundle(bundle: JobOpsBundle): ClaimJobOpsBundle {
  return {
    connectors: bundle.connectors.map((row) => {
      const next: ClaimJobOpsBundle["connectors"][number] = {
        connectedAccountId: row.connectedAccountId,
        connectionId: row.connectionId as Id<"connectorConnections">,
        orgId: row.orgId as Id<"orgs">,
        provider: row.provider,
        scope: row.scope,
        status: row.status,
      };
      if (row.displayLabel !== undefined) {
        next.displayLabel = row.displayLabel;
      }
      if (row.lastVerifiedAt !== undefined) {
        next.lastVerifiedAt = row.lastVerifiedAt;
      }
      return next;
    }),
    mcp: {
      attachment: bundle.mcp.attachment,
      servers: bundle.mcp.servers.map((server) => {
        const next: ClaimJobOpsBundle["mcp"]["servers"][number] = {
          inject: server.inject,
          kind: server.kind,
          name: server.name,
        };
        if (server.connectionId !== undefined) {
          next.connectionId = server.connectionId as Id<"connectorConnections">;
        }
        if (server.provider !== undefined) {
          next.provider = server.provider;
        }
        return next;
      }),
    },
    mentionedConnectors: bundle.mentionedConnectors,
  };
}

async function actingUserId(
  ctx: Ctx,
  job: Doc<"jobs">
): Promise<Id<"users"> | null> {
  if (job.requestedBy) {
    return job.requestedBy;
  }
  const trigger = await ctx.db.get("messages", job.triggerMessageId);
  return trigger?.authorId ?? null;
}
