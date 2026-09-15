import { v } from "convex/values";

import { CONNECTOR_ACTION_CATALOG } from "../../shared/connectorActionCatalog.ts";

export const orgRole = v.union(
  v.literal("owner"),
  v.literal("admin"),
  v.literal("member")
);

export const visibility = v.union(v.literal("org"), v.literal("private"));

export const chatKind = v.union(v.literal("dm"), v.literal("project"));

export const chatVisibility = v.union(
  v.literal("inherit"),
  v.literal("private")
);

export const grantTarget = v.union(v.literal("user"), v.literal("role"));

export const providerKind = v.union(
  v.literal("codex"),
  v.literal("claudeAgent"),
  v.literal("cursor"),
  v.literal("grok"),
  v.literal("opencode"),
  v.literal("antigravity")
);

export const installMethod = v.union(
  v.literal("npm"),
  v.literal("brew"),
  v.literal("installer"),
  v.literal("unknown")
);

export const liveModel = v.object({
  slug: v.string(),
  name: v.optional(v.string()),
  default: v.optional(v.boolean()),
  /** From `codex debug models` JSON — used to size the effort picker. */
  defaultReasoningLevel: v.optional(v.string()),
  supportedReasoningLevels: v.optional(v.array(v.string())),
});

/** t3code `ProviderOptionSelection` — `{ id, value }` persisted with the agent binding. */
export const optionSelection = v.object({
  id: v.string(),
  value: v.union(v.string(), v.boolean()),
});

export const maintenanceKind = v.union(
  v.literal("updateCli"),
  v.literal("refreshModels")
);

export const maintenanceStatus = v.union(
  v.literal("queued"),
  v.literal("running"),
  v.literal("done"),
  v.literal("failed"),
  v.literal("cancelled")
);

/** What a bridge reports about one provider CLI on its machine (heartbeat + owner report). */
export const runtimeProviderReport = v.object({
  driverKind: providerKind,
  available: v.boolean(),
  version: v.optional(v.string()),
  binaryPath: v.optional(v.string()),
  installMethod: v.optional(installMethod),
  /** Live catalog from the CLI's own `models` command; absent = static catalog applies. */
  models: v.optional(v.array(liveModel)),
  modelsCheckedAt: v.optional(v.number()),
  /** Why live discovery produced nothing (command missing, timeout, unparsable output). */
  modelsError: v.optional(v.string()),
  /** Display form of the update the bridge would run (`agent update`), absent = manual only. */
  updateCommand: v.optional(v.string()),
});

export const messageAuthorType = v.union(
  v.literal("user"),
  v.literal("agent"),
  v.literal("system")
);

export const agentToolName = v.union(
  v.literal("list_orgs"),
  v.literal("list_projects"),
  v.literal("list_sessions"),
  v.literal("get_session"),
  v.literal("create_session"),
  v.literal("switch_session"),
  v.literal("send_message"),
  v.literal("list_runtimes"),
  v.literal("get_runtime_status"),
  v.literal("list_connectors"),
  v.literal("get_connector_status"),
  v.literal("suggest_connector")
);

function connectorActionToolNameValidator() {
  const names = CONNECTOR_ACTION_CATALOG.map((row) => row.toolName);
  const first = names[0];
  const second = names[1];
  if (!first || !second) {
    throw new Error("connector action catalog must list at least two tools");
  }
  return v.union(
    v.literal(first),
    v.literal(second),
    ...names.slice(2).map((name) => v.literal(name))
  );
}

/** Catalog-derived — adding a connector Action updates this union automatically. */
export const connectorActionToolName = connectorActionToolNameValidator();
export const linearAgentToolName = connectorActionToolName;

export const jobStatus = v.union(
  v.literal("queued"),
  v.literal("running"),
  v.literal("done"),
  v.literal("failed"),
  v.literal("cancelled")
);

export const userSummary = v.object({
  _id: v.id("users"),
  email: v.optional(v.string()),
  handle: v.optional(v.string()),
  image: v.optional(v.string()),
  name: v.optional(v.string()),
});

export const orgSummary = v.object({
  _id: v.id("orgs"),
  name: v.string(),
  role: orgRole,
  slug: v.string(),
});

export const skillSourceKind = v.union(
  v.literal("manual"),
  v.literal("url"),
  v.literal("skills_sh")
);

export const librarySkillSummary = v.object({
  _id: v.id("librarySkills"),
  description: v.string(),
  name: v.string(),
  orgId: v.id("orgs"),
  slug: v.string(),
  sourceKind: skillSourceKind,
  sourceUrl: v.optional(v.string()),
  updatedAt: v.number(),
});

export const librarySkillDoc = v.object({
  _id: v.id("librarySkills"),
  body: v.string(),
  createdBy: v.id("users"),
  description: v.string(),
  name: v.string(),
  orgId: v.id("orgs"),
  slug: v.string(),
  sourceKind: skillSourceKind,
  sourceUrl: v.optional(v.string()),
  updatedAt: v.number(),
});

export const skillProfileSummary = v.object({
  _id: v.id("skillProfiles"),
  description: v.optional(v.string()),
  name: v.string(),
  orgId: v.id("orgs"),
  skillCount: v.number(),
  skillIds: v.array(v.id("librarySkills")),
  updatedAt: v.number(),
});

export const jobSkillPayload = v.object({
  body: v.string(),
  description: v.string(),
  name: v.string(),
  slug: v.string(),
});

export const projectRuntimeFolder = v.object({
  cwd: v.string(),
  runtimeId: v.id("runtimes"),
});

export const projectSummary = v.object({
  _id: v.id("projects"),
  cwd: v.optional(v.string()),
  folders: v.array(projectRuntimeFolder),
  name: v.string(),
  orgId: v.id("orgs"),
  profileId: v.optional(v.id("skillProfiles")),
  repoUrl: v.optional(v.string()),
  slug: v.string(),
  visibility,
});

export const chatSummary = v.object({
  _id: v.id("chats"),
  driverKind: v.optional(providerKind),
  kind: chatKind,
  model: v.optional(v.string()),
  orgId: v.id("orgs"),
  ownerId: v.optional(v.id("users")),
  profileId: v.optional(v.id("skillProfiles")),
  projectId: v.optional(v.id("projects")),
  title: v.string(),
  visibility: chatVisibility,
  options: v.optional(v.array(optionSelection)),
});

export const connectorScope = v.union(v.literal("org"), v.literal("user"));

export const connectorCardAttachment = v.object({
  kind: v.literal("connector"),
  provider: v.string(),
  scope: connectorScope,
});

export const connectorStatus = v.union(
  v.literal("connected"),
  v.literal("needsAuth"),
  v.literal("disconnected"),
  v.literal("error")
);

export const connectorConnectionSummary = v.object({
  _id: v.id("connectorConnections"),
  connectedAccountId: v.string(),
  createdBy: v.id("users"),
  displayLabel: v.optional(v.string()),
  lastVerifiedAt: v.optional(v.number()),
  orgId: v.id("orgs"),
  provider: v.string(),
  providerConfigId: v.optional(v.string()),
  scope: connectorScope,
  status: connectorStatus,
  updatedAt: v.number(),
  userId: v.optional(v.id("users")),
});

/** Claim payload for the TAH-55 ops MCP plan (no secrets). */
export const jobConnectorSnapshot = v.object({
  connectedAccountId: v.string(),
  connectionId: v.id("connectorConnections"),
  displayLabel: v.optional(v.string()),
  lastVerifiedAt: v.optional(v.number()),
  orgId: v.id("orgs"),
  provider: v.string(),
  scope: connectorScope,
  status: connectorStatus,
});

export const jobMcpServerPlan = v.object({
  connectionId: v.optional(v.id("connectorConnections")),
  inject: v.boolean(),
  kind: v.union(v.literal("tahcode-ops"), v.literal("connector")),
  name: v.string(),
  provider: v.optional(v.string()),
});

export const jobOpsBundle = v.object({
  connectors: v.array(jobConnectorSnapshot),
  mcp: v.object({
    attachment: v.union(
      v.literal("mcp-config"),
      v.literal("cli"),
      v.literal("unsupported")
    ),
    servers: v.array(jobMcpServerPlan),
  }),
  mentionedConnectors: v.array(
    v.object({
      handle: v.string(),
      provider: v.string(),
    })
  ),
});

export const messageDoc = v.object({
  _creationTime: v.number(),
  _id: v.id("messages"),
  attachments: v.optional(v.array(connectorCardAttachment)),
  authorHandle: v.optional(v.string()),
  authorId: v.optional(v.id("users")),
  authorName: v.optional(v.string()),
  authorType: messageAuthorType,
  body: v.string(),
  chatId: v.id("chats"),
  driverKind: v.optional(providerKind),
  jobId: v.optional(v.id("jobs")),
  mentions: v.array(v.string()),
  model: v.optional(v.string()),
  runtimeId: v.optional(v.id("runtimes")),
  status: v.optional(
    v.union(
      v.literal("streaming"),
      v.literal("done"),
      v.literal("error"),
      v.literal("cancelled")
    )
  ),
});
