import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

export type OrgRole = "owner" | "admin" | "member";

export function canSeeProject(input: {
  visibility: "org" | "private";
  isOrgMember: boolean;
  isProjectMember: boolean;
  isOwner: boolean;
}): boolean {
  if (!input.isOrgMember) {
    return false;
  }
  if (input.visibility === "org") {
    return true;
  }
  return input.isProjectMember || input.isOwner;
}

export function canUseRuntime(input: {
  actorUserId: string;
  runtimeOwnerUserId: string;
  actorRole: OrgRole;
  grants: readonly {
    targetType: "user" | "role";
    targetUserId?: string;
    targetRole?: OrgRole;
  }[];
}): boolean {
  if (input.actorUserId === input.runtimeOwnerUserId) {
    return true;
  }
  return input.grants.some((grant) => {
    if (grant.targetType === "user") {
      return grant.targetUserId === input.actorUserId;
    }
    return grant.targetType === "role" && grant.targetRole === input.actorRole;
  });
}

type Ctx = QueryCtx | MutationCtx;

export async function getMembership(
  ctx: Ctx,
  orgId: Id<"orgs">,
  userId: Id<"users">
) {
  return await ctx.db
    .query("orgMembers")
    .withIndex("by_org_and_user", (q) =>
      q.eq("orgId", orgId).eq("userId", userId)
    )
    .unique();
}

export async function requireMembership(
  ctx: Ctx,
  orgId: Id<"orgs">,
  userId: Id<"users">
) {
  const membership = await getMembership(ctx, orgId, userId);
  if (!membership) {
    throw new Error("Not a member of this organization");
  }
  return membership;
}

export async function requireRole(
  ctx: Ctx,
  orgId: Id<"orgs">,
  userId: Id<"users">,
  needed: OrgRole
) {
  const membership = await requireMembership(ctx, orgId, userId);
  const rank: Record<OrgRole, number> = { admin: 1, member: 0, owner: 2 };
  if (rank[membership.role] < rank[needed]) {
    throw new Error(
      needed === "owner" ? "Owner access required" : "Admin access required"
    );
  }
  return membership;
}

export async function isProjectMember(
  ctx: Ctx,
  projectId: Id<"projects">,
  userId: Id<"users">
) {
  const row = await ctx.db
    .query("projectMembers")
    .withIndex("by_project_and_user", (q) =>
      q.eq("projectId", projectId).eq("userId", userId)
    )
    .unique();
  return row !== null;
}

export async function assertProjectVisible(
  ctx: Ctx,
  project: Doc<"projects">,
  userId: Id<"users">,
  role: OrgRole
) {
  const member = await isProjectMember(ctx, project._id, userId);
  if (
    !canSeeProject({
      isOrgMember: true,
      isOwner: role === "owner" || project.createdBy === userId,
      isProjectMember: member,
      visibility: project.visibility,
    })
  ) {
    throw new Error("You cannot see this project");
  }
}

export async function assertChatVisible(
  ctx: Ctx,
  chat: Doc<"chats">,
  userId: Id<"users">,
  role: OrgRole
) {
  if (chat.kind === "dm") {
    if (chat.ownerId !== userId) {
      throw new Error("Personal DMs are owner-only in Phase 1");
    }
    return;
  }
  if (!chat.projectId) {
    throw new Error("Project chat is missing a project");
  }
  const project = await ctx.db.get(chat.projectId);
  if (!project) {
    throw new Error("Project not found");
  }
  await assertProjectVisible(ctx, project, userId, role);
  if (chat.visibility === "private") {
    const member = await ctx.db
      .query("chatMembers")
      .withIndex("by_chat_and_user", (q) =>
        q.eq("chatId", chat._id).eq("userId", userId)
      )
      .unique();
    if (!member) {
      throw new Error("This chat is private");
    }
  }
}

export async function listRuntimeGrants(ctx: Ctx, runtimeId: Id<"runtimes">) {
  return await ctx.db
    .query("runtimeGrants")
    .withIndex("by_runtime", (q) => q.eq("runtimeId", runtimeId))
    .take(200);
}

export async function assertCanUseRuntime(
  ctx: Ctx,
  runtime: Doc<"runtimes">,
  userId: Id<"users">,
  role: OrgRole
) {
  const grants = await listRuntimeGrants(ctx, runtime._id);
  if (
    !canUseRuntime({
      actorRole: role,
      actorUserId: userId,
      grants: grants.map((grant) => ({
        targetType: grant.targetType,
        targetUserId: grant.targetUserId,
        targetRole: grant.targetRole,
      })),
      runtimeOwnerUserId: runtime.ownerUserId,
    })
  ) {
    throw new Error("Runtime access denied");
  }
}
