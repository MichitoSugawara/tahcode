import {
  canSeeProject,
  canUseRuntime,
  roleAtLeast,
} from "../../shared/access.ts";
import type { OrgRole } from "../../shared/access.ts";
import { isOwnerScopedChat } from "../../shared/chatKind.ts";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

export type { OrgRole };
export { canSeeProject, canUseRuntime, roleAtLeast };

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
  if (!roleAtLeast(membership.role, needed)) {
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
      isAdmin: role === "admin" || role === "owner",
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
  if (isOwnerScopedChat(chat.kind)) {
    if (chat.ownerId !== userId) {
      throw new Error(
        chat.kind === "dm"
          ? "Personal DMs are owner-only in Phase 1"
          : "No-project threads are owner-only"
      );
    }
    return;
  }
  if (!chat.projectId) {
    throw new Error("Project chat is missing a project");
  }
  const project = await ctx.db.get("projects", chat.projectId);
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
