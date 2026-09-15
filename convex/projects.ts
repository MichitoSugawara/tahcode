import { v } from "convex/values";

import { canDeleteOwnedEntity } from "../shared/access.ts";
import { normalizeProjectName } from "../shared/chatKind.ts";
import type { Doc } from "./_generated/dataModel";
import {
  assertProjectVisible,
  canSeeProject,
  getMembership,
  isProjectMember,
  requireRole,
} from "./lib/access";
import { authedMutation, authedQuery } from "./lib/customFunctions";
import { deleteProjectTree } from "./lib/entityCleanup";
import { slugify } from "./lib/ids";
import type { ProjectFolderRow } from "./lib/projectFolders";
import {
  assertRuntimeInOrg,
  foldersByProject,
  listFoldersForOrg,
  listFoldersForProject,
  upsertProjectRuntimeFolder,
} from "./lib/projectFolders";
import { requireOrgProfile } from "./lib/skills";
import {
  projectRuntimeFolder,
  projectSummary,
  userSummary,
  visibility,
} from "./lib/validators";

export function summarizeProject(
  project: Doc<"projects">,
  folders: ProjectFolderRow[] = []
) {
  return {
    _id: project._id,
    cwd: project.cwd,
    folders,
    name: project.name,
    orgId: project.orgId,
    profileId: project.profileId,
    repoUrl: project.repoUrl,
    slug: project.slug,
    visibility: project.visibility,
  };
}

export const create = authedMutation({
  args: {
    cwd: v.optional(v.string()),
    folders: v.optional(v.array(projectRuntimeFolder)),
    name: v.string(),
    orgId: v.id("orgs"),
    repoUrl: v.optional(v.string()),
    visibility,
  },
  handler: async (ctx, args) => {
    const membership = await getMembership(ctx, args.orgId, ctx.user._id);
    if (!membership) {
      throw new Error("Not a member of this organization");
    }
    const name = normalizeProjectName(args.name);
    if (name.length < 1) {
      throw new Error("Project name is required");
    }
    const folders = args.folders ?? [];
    if (folders.length > 50) {
      throw new Error("Too many machine folders");
    }
    for (const folder of folders) {
      await assertRuntimeInOrg(ctx, folder.runtimeId, args.orgId);
    }
    const firstMapped = folders[0]?.cwd.trim();
    const projectId = await ctx.db.insert("projects", {
      orgId: args.orgId,
      name,
      slug: `${slugify(name)}-${Math.floor(1000 + Math.random() * 9000)}`,
      visibility: args.visibility,
      cwd: args.cwd ?? (firstMapped || undefined),
      repoUrl: args.repoUrl,
      createdBy: ctx.user._id,
    });
    await ctx.db.insert("projectMembers", {
      projectId,
      userId: ctx.user._id,
    });
    for (const folder of folders) {
      await upsertProjectRuntimeFolder(ctx, {
        cwd: folder.cwd,
        mappedBy: ctx.user._id,
        orgId: args.orgId,
        projectId,
        runtimeId: folder.runtimeId,
      });
    }
    return projectId;
  },
  returns: v.id("projects"),
});

export const list = authedQuery({
  args: { orgId: v.id("orgs") },
  handler: async (ctx, args) => {
    const membership = await getMembership(ctx, args.orgId, ctx.user._id);
    if (!membership) {
      throw new Error("Not a member of this organization");
    }
    const projects = await ctx.db
      .query("projects")
      .withIndex("by_org", (q) => q.eq("orgId", args.orgId))
      .take(100);
    const visible = [];
    for (const project of projects) {
      const member = await isProjectMember(ctx, project._id, ctx.user._id);
      if (
        canSeeProject({
          isAdmin: membership.role === "admin" || membership.role === "owner",
          isOrgMember: true,
          isOwner:
            membership.role === "owner" || project.createdBy === ctx.user._id,
          isProjectMember: member,
          visibility: project.visibility,
        })
      ) {
        visible.push(project);
      }
    }
    const folderRows = await listFoldersForOrg(ctx, args.orgId);
    const grouped = foldersByProject(folderRows);
    return visible.map((project) =>
      summarizeProject(project, grouped.get(String(project._id)) ?? [])
    );
  },
  returns: v.array(projectSummary),
});

export const get = authedQuery({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const project = await ctx.db.get("projects", args.projectId);
    if (!project) {
      return null;
    }
    const membership = await getMembership(ctx, project.orgId, ctx.user._id);
    if (!membership) {
      return null;
    }
    try {
      await assertProjectVisible(ctx, project, ctx.user._id, membership.role);
    } catch {
      return null;
    }
    return summarizeProject(
      project,
      await listFoldersForProject(ctx, args.projectId)
    );
  },
  returns: v.union(projectSummary, v.null()),
});

export const members = authedQuery({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const project = await ctx.db.get("projects", args.projectId);
    if (!project) {
      throw new Error("Project not found");
    }
    const membership = await getMembership(ctx, project.orgId, ctx.user._id);
    if (!membership) {
      throw new Error("Not a member of this organization");
    }
    await assertProjectVisible(ctx, project, ctx.user._id, membership.role);
    const rows = await ctx.db
      .query("projectMembers")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .take(200);
    const users = [];
    for (const row of rows) {
      const user = await ctx.db.get("users", row.userId);
      if (!user) {
        continue;
      }
      users.push({
        _id: user._id,
        name: user.name,
        email: user.email,
        handle: user.handle,
        image: user.image,
      });
    }
    return users;
  },
  returns: v.array(userSummary),
});

export const addMember = authedMutation({
  args: {
    projectId: v.id("projects"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const project = await ctx.db.get("projects", args.projectId);
    if (!project) {
      throw new Error("Project not found");
    }
    await requireRole(ctx, project.orgId, ctx.user._id, "admin");
    const targetMembership = await getMembership(
      ctx,
      project.orgId,
      args.userId
    );
    if (!targetMembership) {
      throw new Error("Target is not in this organization");
    }
    const existing = await ctx.db
      .query("projectMembers")
      .withIndex("by_project_and_user", (q) =>
        q.eq("projectId", args.projectId).eq("userId", args.userId)
      )
      .unique();
    if (!existing) {
      await ctx.db.insert("projectMembers", {
        projectId: args.projectId,
        userId: args.userId,
      });
    }
    return null;
  },
  returns: v.null(),
});

export const setProfile = authedMutation({
  args: {
    profileId: v.union(v.id("skillProfiles"), v.null()),
    projectId: v.id("projects"),
  },
  handler: async (ctx, args) => {
    const project = await ctx.db.get("projects", args.projectId);
    if (!project) {
      throw new Error("Project not found");
    }
    const membership = await getMembership(ctx, project.orgId, ctx.user._id);
    if (!membership) {
      throw new Error("Not a member of this organization");
    }
    await assertProjectVisible(ctx, project, ctx.user._id, membership.role);
    if (args.profileId) {
      await requireOrgProfile(ctx, project.orgId, args.profileId);
    }
    await ctx.db.patch("projects", args.projectId, {
      profileId: args.profileId ?? undefined,
    });
    return null;
  },
  returns: v.null(),
});

export const setRuntimeFolder = authedMutation({
  args: {
    cwd: v.string(),
    projectId: v.id("projects"),
    runtimeId: v.id("runtimes"),
  },
  handler: async (ctx, args) => {
    const project = await ctx.db.get("projects", args.projectId);
    if (!project) {
      throw new Error("Project not found");
    }
    const membership = await getMembership(ctx, project.orgId, ctx.user._id);
    if (!membership) {
      throw new Error("Not a member of this organization");
    }
    await assertProjectVisible(ctx, project, ctx.user._id, membership.role);
    await assertRuntimeInOrg(ctx, args.runtimeId, project.orgId);
    const cwd = await upsertProjectRuntimeFolder(ctx, {
      cwd: args.cwd,
      mappedBy: ctx.user._id,
      orgId: project.orgId,
      projectId: args.projectId,
      runtimeId: args.runtimeId,
    });
    if (!project.cwd) {
      await ctx.db.patch("projects", args.projectId, { cwd });
    }
    return { cwd };
  },
  returns: v.object({ cwd: v.string() }),
});

export const update = authedMutation({
  args: {
    cwd: v.optional(v.union(v.string(), v.null())),
    name: v.optional(v.string()),
    projectId: v.id("projects"),
    repoUrl: v.optional(v.union(v.string(), v.null())),
    visibility: v.optional(visibility),
  },
  handler: async (ctx, args) => {
    const project = await ctx.db.get("projects", args.projectId);
    if (!project) {
      throw new Error("Project not found");
    }
    const membership = await getMembership(ctx, project.orgId, ctx.user._id);
    if (!membership) {
      throw new Error("Not a member of this organization");
    }
    await assertProjectVisible(ctx, project, ctx.user._id, membership.role);
    const name = normalizeProjectName(args.name ?? project.name);
    if (name.length < 1) {
      throw new Error("Project name is required");
    }
    const optionalText = (value: string | null | undefined) => {
      const trimmed = value?.trim();
      return trimmed || undefined;
    };
    const nextOrKeep = (
      next: string | null | undefined,
      current: string | undefined
    ) => {
      if (next === undefined) {
        return current;
      }
      return optionalText(next);
    };
    await ctx.db.replace("projects", args.projectId, {
      createdBy: project.createdBy,
      cwd: nextOrKeep(args.cwd, project.cwd),
      name,
      orgId: project.orgId,
      profileId: project.profileId,
      repoUrl: nextOrKeep(args.repoUrl, project.repoUrl),
      slug: project.slug,
      visibility: args.visibility ?? project.visibility,
    });
    return null;
  },
  returns: v.null(),
});

export const remove = authedMutation({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const project = await ctx.db.get("projects", args.projectId);
    if (!project) {
      throw new Error("Project not found");
    }
    const membership = await getMembership(ctx, project.orgId, ctx.user._id);
    if (!membership) {
      throw new Error("Not a member of this organization");
    }
    await assertProjectVisible(ctx, project, ctx.user._id, membership.role);
    const isAdmin = membership.role === "owner" || membership.role === "admin";
    if (
      !canDeleteOwnedEntity({
        actorUserId: ctx.user._id,
        createdBy: project.createdBy,
        isAdmin,
      })
    ) {
      throw new Error("Only the creator or an admin can delete this project");
    }
    await deleteProjectTree(ctx, args.projectId);
    return null;
  },
  returns: v.null(),
});
