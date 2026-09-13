import { v } from "convex/values";

import { assertProjectVisible, getMembership, requireRole } from "./lib/access";
import { authedMutation, authedQuery } from "./lib/customFunctions";
import { slugify } from "./lib/ids";
import { projectSummary, userSummary, visibility } from "./lib/validators";

export const create = authedMutation({
  args: {
    cwd: v.optional(v.string()),
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
    const name = args.name.trim().slice(0, 80);
    if (name.length < 1) {
      throw new Error("Project name is required");
    }
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
          q.eq("projectId", project._id).eq("userId", ctx.user._id)
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
