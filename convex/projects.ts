import { v } from "convex/values";
import {
  assertProjectVisible,
  getMembership,
  requireRole,
} from "./lib/access";
import { authedMutation, authedQuery } from "./lib/customFunctions";
import { slugify } from "./lib/ids";
import { projectSummary, userSummary, visibility } from "./lib/validators";

export const create = authedMutation({
  args: {
    orgId: v.id("orgs"),
    name: v.string(),
    visibility: visibility,
    cwd: v.optional(v.string()),
    repoUrl: v.optional(v.string()),
  },
  returns: v.id("projects"),
  handler: async (ctx, args) => {
    const membership = await getMembership(ctx, args.orgId, ctx.user._id);
    if (!membership) throw new Error("Not a member of this organization");
    const name = args.name.trim().slice(0, 80);
    if (name.length < 1) throw new Error("Project name is required");
    const projectId = await ctx.db.insert("projects", {
      orgId: args.orgId,
      name,
      slug: `${slugify(name)}-${Math.floor(1000 + Math.random() * 9000)}`,
      visibility: args.visibility,
      cwd: args.cwd,
      repoUrl: args.repoUrl,
      createdBy: ctx.user._id,
    });
    await ctx.db.insert("projectMembers", {
      projectId,
      userId: ctx.user._id,
    });
    return projectId;
  },
});

export const list = authedQuery({
  args: { orgId: v.id("orgs") },
  returns: v.array(projectSummary),
  handler: async (ctx, args) => {
    const membership = await getMembership(ctx, args.orgId, ctx.user._id);
    if (!membership) throw new Error("Not a member of this organization");
    const projects = await ctx.db
      .query("projects")
      .withIndex("by_org", (q) => q.eq("orgId", args.orgId))
      .take(100);
    const visible = [];
    for (const project of projects) {
      if (project.visibility === "org") {
        visible.push(project);
        continue;
      }
      if (membership.role === "owner" || membership.role === "admin") {
        visible.push(project);
        continue;
      }
      const member = await ctx.db
        .query("projectMembers")
        .withIndex("by_project_and_user", (q) =>
          q.eq("projectId", project._id).eq("userId", ctx.user._id),
        )
        .unique();
      if (member || String(project.createdBy) === String(ctx.user._id)) {
        visible.push(project);
      }
    }
    return visible.map((project) => ({
      _id: project._id,
      orgId: project.orgId,
      name: project.name,
      slug: project.slug,
      visibility: project.visibility,
      cwd: project.cwd,
      repoUrl: project.repoUrl,
    }));
  },
});

export const get = authedQuery({
  args: { projectId: v.id("projects") },
  returns: v.union(projectSummary, v.null()),
  handler: async (ctx, args) => {
    const project = await ctx.db.get("projects", args.projectId);
    if (!project) return null;
    const membership = await getMembership(ctx, project.orgId, ctx.user._id);
    if (!membership) return null;
    try {
      await assertProjectVisible(ctx, project, ctx.user._id, membership.role);
    } catch {
      return null;
    }
    return {
      _id: project._id,
      orgId: project.orgId,
      name: project.name,
      slug: project.slug,
      visibility: project.visibility,
      cwd: project.cwd,
      repoUrl: project.repoUrl,
    };
  },
});

export const members = authedQuery({
  args: { projectId: v.id("projects") },
  returns: v.array(userSummary),
  handler: async (ctx, args) => {
    const project = await ctx.db.get("projects", args.projectId);
    if (!project) throw new Error("Project not found");
    const membership = await getMembership(ctx, project.orgId, ctx.user._id);
    if (!membership) throw new Error("Not a member of this organization");
    await assertProjectVisible(ctx, project, ctx.user._id, membership.role);
    const rows = await ctx.db
      .query("projectMembers")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .take(200);
    const users = [];
    for (const row of rows) {
      const user = await ctx.db.get("users", row.userId);
      if (!user) continue;
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
});

export const addMember = authedMutation({
  args: {
    projectId: v.id("projects"),
    userId: v.id("users"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const project = await ctx.db.get("projects", args.projectId);
    if (!project) throw new Error("Project not found");
    await requireRole(ctx, project.orgId, ctx.user._id, "admin");
    const targetMembership = await getMembership(ctx, project.orgId, args.userId);
    if (!targetMembership) throw new Error("Target is not in this organization");
    const existing = await ctx.db
      .query("projectMembers")
      .withIndex("by_project_and_user", (q) =>
        q.eq("projectId", args.projectId).eq("userId", args.userId),
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
});
