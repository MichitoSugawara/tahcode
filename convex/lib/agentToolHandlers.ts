import type { ChatVisibility } from "../../shared/access.ts";
import type { AgentToolName } from "../../shared/agentTools.ts";
import {
  optionalBoolean,
  optionalInteger,
  optionalString,
  requiredString,
} from "../../shared/agentTools.ts";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import {
  createProjectChatForUser,
  createThreadChatForUser,
  ensureDmForUser,
  summarizeChat,
} from "../chats";
import { summarizeProject } from "../projects";
import {
  assertChatVisible,
  assertProjectVisible,
  canSeeProject,
  canUseRuntime,
  getMembership,
  isProjectMember,
  listRuntimeGrants,
} from "./access";
import type { OrgRole } from "./access";
import { postConnectorCardMessage } from "./connectorCards";
import { isVisibleConnectorConnection } from "./connectors";
import {
  agentConnectorView,
  listVisibleJobConnectors,
  toJobConnectorSnapshot,
} from "./jobOps";
import { isProviderDriverKind } from "./providers";
import { STALE_RUNTIME_MS } from "./runtimeHealth";
import { sendUserMessage } from "./sendMessage";

export type AgentToolScope = {
  job: Doc<"jobs">;
  user: Doc<"users">;
};

export async function runAgentTool(
  ctx: MutationCtx,
  scope: AgentToolScope,
  name: AgentToolName,
  args: Record<string, unknown>
): Promise<unknown> {
  switch (name) {
    case "list_orgs":
      return await listOrgs(ctx, scope);
    case "list_projects":
      return await listProjects(ctx, scope, args);
    case "list_sessions":
      return await listSessions(ctx, scope, args);
    case "get_session":
      return await getSession(ctx, scope, args);
    case "create_session":
      return await createSession(ctx, scope, args);
    case "switch_session":
      return await switchSession(ctx, scope, args);
    case "send_message":
      return await sendMessage(ctx, scope, args);
    case "list_runtimes":
      return await listRuntimes(ctx, scope, args);
    case "get_runtime_status":
      return await getRuntimeStatus(ctx, scope, args);
    case "list_connectors":
      return await listConnectors(ctx, scope, args);
    case "get_connector_status":
      return await getConnectorStatus(ctx, scope, args);
    case "suggest_connector":
      return await suggestConnector(ctx, scope, args);
    default: {
      const _exhaustive: never = name;
      return _exhaustive;
    }
  }
}

async function listOrgs(ctx: MutationCtx, scope: AgentToolScope) {
  const memberships = await ctx.db
    .query("orgMembers")
    .withIndex("by_user", (q) => q.eq("userId", scope.user._id))
    .take(50);
  const orgs = [];
  for (const membership of memberships) {
    const org = await ctx.db.get("orgs", membership.orgId);
    if (!org) {
      continue;
    }
    orgs.push({
      _id: org._id,
      name: org.name,
      role: membership.role,
      slug: org.slug,
    });
  }
  return { orgs };
}

async function listProjects(
  ctx: MutationCtx,
  scope: AgentToolScope,
  args: Record<string, unknown>
) {
  const orgId = await requireOrgId(ctx, scope, optionalString(args, "orgId"));
  const membership = await requireActorMembership(ctx, orgId, scope.user._id);
  const projects = await ctx.db
    .query("projects")
    .withIndex("by_org", (q) => q.eq("orgId", orgId))
    .take(100);
  const visible = [];
  for (const project of projects) {
    if (await projectVisible(ctx, project, scope.user._id, membership.role)) {
      visible.push(summarizeProject(project));
    }
  }
  return { orgId, projects: visible };
}

async function listSessions(
  ctx: MutationCtx,
  scope: AgentToolScope,
  args: Record<string, unknown>
) {
  const orgId = await requireOrgId(ctx, scope, optionalString(args, "orgId"));
  const membership = await requireActorMembership(ctx, orgId, scope.user._id);
  const projectId = optionalString(args, "projectId");
  const kind = optionalString(args, "kind");
  if (kind && kind !== "dm" && kind !== "project") {
    throw new Error("kind must be dm or project");
  }
  if (projectId) {
    const project = await loadProject(ctx, projectId);
    if (String(project.orgId) !== String(orgId)) {
      throw new Error("Project is not in this organization");
    }
    await assertProjectVisible(ctx, project, scope.user._id, membership.role);
  }
  const chats = await ctx.db
    .query("chats")
    .withIndex("by_org", (q) => q.eq("orgId", orgId))
    .take(200);
  const visible = [];
  for (const chat of chats) {
    if (projectId && String(chat.projectId) !== projectId) {
      continue;
    }
    if (kind && chat.kind !== kind) {
      continue;
    }
    try {
      await assertChatVisible(ctx, chat, scope.user._id, membership.role);
      visible.push(summarizeChat(chat));
    } catch {
      continue;
    }
  }
  return {
    activeChatId: activeChatId(scope.job),
    orgId,
    sessions: visible,
  };
}

async function getSession(
  ctx: MutationCtx,
  scope: AgentToolScope,
  args: Record<string, unknown>
) {
  const chat = await loadVisibleChat(
    ctx,
    scope,
    optionalString(args, "chatId") ?? activeChatId(scope.job)
  );
  const limit = optionalInteger(args, "limit", 1, 80) ?? 30;
  const page = await ctx.db
    .query("messages")
    .withIndex("by_chat", (q) => q.eq("chatId", chat._id))
    .order("desc")
    .take(limit);
  const messages = [];
  for (const row of [...page].reverse()) {
    messages.push(await enrichMessage(ctx, row));
  }
  return {
    active: String(chat._id) === activeChatId(scope.job),
    session: summarizeChat(chat),
    messages,
  };
}

async function createSession(
  ctx: MutationCtx,
  scope: AgentToolScope,
  args: Record<string, unknown>
) {
  const kind = optionalString(args, "kind") ?? "project";
  if (kind !== "dm" && kind !== "project" && kind !== "thread") {
    throw new Error("kind must be dm, project, or thread");
  }
  if (kind === "dm") {
    const orgId = await requireOrgId(ctx, scope, optionalString(args, "orgId"));
    const chatId = await ensureDmForUser(ctx, scope.user, orgId);
    const chat = await ctx.db.get("chats", chatId);
    if (!chat) {
      throw new Error("Chat not found");
    }
    return { created: true, session: summarizeChat(chat) };
  }
  if (kind === "thread") {
    const orgId = await requireOrgId(ctx, scope, optionalString(args, "orgId"));
    const chatId = await createThreadChatForUser(ctx, scope.user, {
      orgId,
      title: optionalString(args, "title") ?? "Untitled chat",
    });
    const chat = await ctx.db.get("chats", chatId);
    if (!chat) {
      throw new Error("Chat not found");
    }
    return { created: true, session: summarizeChat(chat) };
  }
  const projectId = optionalString(args, "projectId");
  if (!projectId) {
    throw new Error("projectId is required unless kind is dm or thread");
  }
  const visibility = optionalString(args, "visibility") ?? "inherit";
  if (visibility !== "inherit" && visibility !== "private") {
    throw new Error("visibility must be inherit or private");
  }
  const driverKindRaw = optionalString(args, "driverKind");
  if (driverKindRaw && !isProviderDriverKind(driverKindRaw)) {
    throw new Error("Unknown provider");
  }
  const chatId = await createProjectChatForUser(ctx, scope.user, {
    driverKind:
      driverKindRaw && isProviderDriverKind(driverKindRaw)
        ? driverKindRaw
        : undefined,
    model: optionalString(args, "model"),
    projectId: asId(projectId),
    title: optionalString(args, "title") ?? "Untitled chat",
    visibility: visibility as ChatVisibility,
  });
  const chat = await ctx.db.get("chats", chatId);
  if (!chat) {
    throw new Error("Chat not found");
  }
  return { created: true, session: summarizeChat(chat) };
}

async function switchSession(
  ctx: MutationCtx,
  scope: AgentToolScope,
  args: Record<string, unknown>
) {
  const chat = await loadVisibleChat(
    ctx,
    scope,
    requiredString(args, "chatId")
  );
  const previousChatId = activeChatId(scope.job);
  await ctx.db.patch("jobs", scope.job._id, { toolChatId: chat._id });
  return {
    previousChatId,
    session: summarizeChat(chat),
  };
}

async function sendMessage(
  ctx: MutationCtx,
  scope: AgentToolScope,
  args: Record<string, unknown>
) {
  const chatId = asId<"chats">(
    optionalString(args, "chatId") ?? activeChatId(scope.job)
  );
  await loadVisibleChat(ctx, scope, chatId);
  const runtimeId = optionalString(args, "runtimeId");
  const sameJobChat = String(chatId) === String(scope.job.chatId);
  const dispatch =
    optionalBoolean(args, "dispatch") ?? (sameJobChat ? false : undefined);
  const sent = await sendUserMessage(ctx, scope.user, {
    body: requiredString(args, "body"),
    chatId,
    dispatch,
    runtimeId: runtimeId ? asId(runtimeId) : undefined,
  });
  return sent;
}

async function listRuntimes(
  ctx: MutationCtx,
  scope: AgentToolScope,
  args: Record<string, unknown>
) {
  const orgId = await requireOrgId(ctx, scope, optionalString(args, "orgId"));
  const membership = await requireActorMembership(ctx, orgId, scope.user._id);
  const runtimes = await ctx.db
    .query("runtimes")
    .withIndex("by_org", (q) => q.eq("orgId", orgId))
    .take(50);
  const out = [];
  for (const runtime of runtimes) {
    out.push(
      await runtimeStatusView(ctx, runtime, scope.user._id, membership.role)
    );
  }
  return { orgId, runtimes: out };
}

async function listConnectors(
  ctx: MutationCtx,
  scope: AgentToolScope,
  args: Record<string, unknown>
) {
  const orgId = await requireOrgId(ctx, scope, optionalString(args, "orgId"));
  const connectors = await listVisibleJobConnectors(ctx, {
    orgId,
    provider: optionalString(args, "provider"),
    userId: scope.user._id,
  });
  return {
    connectors: connectors.map(agentConnectorView),
    orgId,
  };
}

async function getConnectorStatus(
  ctx: MutationCtx,
  scope: AgentToolScope,
  args: Record<string, unknown>
) {
  const connectionId = optionalString(args, "connectionId");
  if (connectionId) {
    const row = await ctx.db.get(
      "connectorConnections",
      asId<"connectorConnections">(connectionId)
    );
    if (!row) {
      throw new Error("Connection not found");
    }
    const membership = await requireActorMembership(
      ctx,
      row.orgId,
      scope.user._id
    );
    if (
      !isVisibleConnectorConnection(row, {
        role: membership.role,
        userId: scope.user._id,
      })
    ) {
      throw new Error("Connection not found");
    }
    return { connection: agentConnectorView(toJobConnectorSnapshot(row)) };
  }
  const provider = optionalString(args, "provider");
  if (!provider) {
    throw new Error("connectionId or provider is required");
  }
  const orgId = await requireOrgId(ctx, scope, optionalString(args, "orgId"));
  const connections = await listVisibleJobConnectors(ctx, {
    orgId,
    provider,
    userId: scope.user._id,
  });
  return { connections: connections.map(agentConnectorView), orgId };
}

async function suggestConnector(
  ctx: MutationCtx,
  scope: AgentToolScope,
  args: Record<string, unknown>
) {
  const chatId = optionalString(args, "chatId") ?? activeChatId(scope.job);
  await loadVisibleChat(ctx, scope, chatId);
  return await postConnectorCardMessage(ctx, {
    chatId: asId<"chats">(chatId),
    provider: optionalString(args, "provider"),
    scope: optionalString(args, "scope"),
    userId: scope.user._id,
  });
}

async function getRuntimeStatus(
  ctx: MutationCtx,
  scope: AgentToolScope,
  args: Record<string, unknown>
) {
  const runtimeId =
    optionalString(args, "runtimeId") ?? String(scope.job.runtimeId);
  const runtime = await loadRuntime(ctx, runtimeId);
  const membership = await requireActorMembership(
    ctx,
    runtime.orgId,
    scope.user._id
  );
  return {
    runtime: await runtimeStatusView(
      ctx,
      runtime,
      scope.user._id,
      membership.role
    ),
  };
}

function activeChatId(job: Doc<"jobs">): string {
  return String(job.toolChatId ?? job.chatId);
}

async function requireOrgId(
  ctx: MutationCtx,
  scope: AgentToolScope,
  orgId: string | undefined
): Promise<Id<"orgs">> {
  const resolved = orgId ?? String(scope.job.orgId);
  const org = await ctx.db.get("orgs", asId(resolved));
  if (!org) {
    throw new Error("Organization not found");
  }
  await requireActorMembership(ctx, org._id, scope.user._id);
  return org._id;
}

async function requireActorMembership(
  ctx: MutationCtx,
  orgId: Id<"orgs">,
  userId: Id<"users">
) {
  const membership = await getMembership(ctx, orgId, userId);
  if (!membership) {
    throw new Error("Not a member of this organization");
  }
  return membership;
}

async function loadVisibleChat(
  ctx: MutationCtx,
  scope: AgentToolScope,
  chatId: string
): Promise<Doc<"chats">> {
  const chat = await ctx.db.get("chats", asId(chatId));
  if (!chat) {
    throw new Error("Chat not found");
  }
  const membership = await requireActorMembership(
    ctx,
    chat.orgId,
    scope.user._id
  );
  await assertChatVisible(ctx, chat, scope.user._id, membership.role);
  return chat;
}

async function loadProject(
  ctx: MutationCtx,
  projectId: string
): Promise<Doc<"projects">> {
  const project = await ctx.db.get("projects", asId(projectId));
  if (!project) {
    throw new Error("Project not found");
  }
  return project;
}

async function loadRuntime(
  ctx: MutationCtx,
  runtimeId: string
): Promise<Doc<"runtimes">> {
  const runtime = await ctx.db.get("runtimes", asId(runtimeId));
  if (!runtime) {
    throw new Error("Runtime not found");
  }
  return runtime;
}

async function projectVisible(
  ctx: MutationCtx,
  project: Doc<"projects">,
  userId: Id<"users">,
  role: OrgRole
): Promise<boolean> {
  const member = await isProjectMember(ctx, project._id, userId);
  return canSeeProject({
    isAdmin: role === "admin" || role === "owner",
    isOrgMember: true,
    isOwner: role === "owner" || project.createdBy === userId,
    isProjectMember: member,
    visibility: project.visibility,
  });
}

async function runtimeStatusView(
  ctx: MutationCtx,
  runtime: Doc<"runtimes">,
  userId: Id<"users">,
  role: OrgRole
) {
  const grants = await listRuntimeGrants(ctx, runtime._id);
  const providers = await ctx.db
    .query("runtimeProviders")
    .withIndex("by_runtime", (q) => q.eq("runtimeId", runtime._id))
    .take(10);
  const staleBefore = Date.now() - STALE_RUNTIME_MS;
  const stale =
    runtime.lastSeenAt === undefined || runtime.lastSeenAt <= staleBefore;
  return {
    _id: runtime._id,
    canUse: canUseRuntime({
      actorRole: role,
      actorUserId: String(userId),
      grants: grants.map((grant) => ({
        targetRole: grant.targetRole,
        targetType: grant.targetType,
        targetUserId: grant.targetUserId
          ? String(grant.targetUserId)
          : undefined,
      })),
      runtimeOwnerUserId: String(runtime.ownerUserId),
    }),
    capabilities: runtime.capabilities ?? [],
    cwd: runtime.cwd,
    hostname: runtime.hostname,
    lastSeenAt: runtime.lastSeenAt,
    name: runtime.name,
    orgId: runtime.orgId,
    providers: providers.map((provider) => ({
      available: provider.available,
      driverKind: provider.driverKind,
      version: provider.version,
    })),
    slug: runtime.slug,
    stale,
    status: runtime.status,
  };
}

async function enrichMessage(ctx: MutationCtx, row: Doc<"messages">) {
  let authorHandle: string | undefined;
  let authorName: string | undefined;
  if (row.authorId) {
    const author = await ctx.db.get("users", row.authorId);
    authorHandle = author?.handle;
    authorName = author?.name;
  }
  return {
    _creationTime: row._creationTime,
    _id: row._id,
    authorHandle,
    authorId: row.authorId,
    authorName,
    attachments: row.attachments,
    authorType: row.authorType,
    body: row.body,
    chatId: row.chatId,
    driverKind: row.driverKind,
    jobId: row.jobId,
    mentions: row.mentions,
    model: row.model,
    status: row.status,
  };
}

function asId<
  Table extends
    | "chats"
    | "connectorConnections"
    | "orgs"
    | "projects"
    | "runtimes"
    | "skillProfiles"
    | "users",
>(value: string): Id<Table> {
  return value as Id<Table>;
}
