import { v } from "convex/values";

import { MAX_LIBRARY_SKILLS } from "../shared/skills.ts";
import { internalMutation } from "./_generated/server";
import { authedMutation, authedQuery } from "./lib/customFunctions";
import {
  findSkillBySlug,
  normalizeSkillFields,
  normalizeSourceUrl,
  requireOrgMember,
  requireSkillAdmin,
  summarizeLibrarySkill,
} from "./lib/skills";
import {
  librarySkillDoc,
  librarySkillSummary,
  skillSourceKind,
} from "./lib/validators";

export const listLibrary = authedQuery({
  args: { orgId: v.id("orgs") },
  handler: async (ctx, args) => {
    await requireOrgMember(ctx, args.orgId, ctx.user._id);
    const rows = await ctx.db
      .query("librarySkills")
      .withIndex("by_org", (q) => q.eq("orgId", args.orgId))
      .take(MAX_LIBRARY_SKILLS);
    return rows.map(summarizeLibrarySkill);
  },
  returns: v.array(librarySkillSummary),
});

export const get = authedQuery({
  args: { skillId: v.id("librarySkills") },
  handler: async (ctx, args) => {
    const skill = await ctx.db.get("librarySkills", args.skillId);
    if (!skill) {
      return null;
    }
    const membership = await requireOrgMember(
      ctx,
      skill.orgId,
      ctx.user._id
    ).catch(() => null);
    if (!membership) {
      return null;
    }
    return {
      _id: skill._id,
      body: skill.body,
      createdBy: skill.createdBy,
      description: skill.description,
      name: skill.name,
      orgId: skill.orgId,
      slug: skill.slug,
      sourceKind: skill.sourceKind,
      sourceUrl: skill.sourceUrl,
      updatedAt: skill.updatedAt,
    };
  },
  returns: v.union(librarySkillDoc, v.null()),
});

export const create = authedMutation({
  args: {
    body: v.string(),
    description: v.optional(v.string()),
    name: v.string(),
    orgId: v.id("orgs"),
    slug: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireSkillAdmin(ctx, args.orgId, ctx.user._id);
    const existing = await ctx.db
      .query("librarySkills")
      .withIndex("by_org", (q) => q.eq("orgId", args.orgId))
      .take(MAX_LIBRARY_SKILLS);
    if (existing.length >= MAX_LIBRARY_SKILLS) {
      throw new Error(`Library can hold at most ${MAX_LIBRARY_SKILLS} skills`);
    }
    const fields = normalizeSkillFields(args);
    const clash = await findSkillBySlug(ctx, args.orgId, fields.slug);
    if (clash) {
      throw new Error("A skill with this slug already exists");
    }
    const now = Date.now();
    return await ctx.db.insert("librarySkills", {
      body: fields.body,
      createdBy: ctx.user._id,
      description: fields.description,
      name: fields.name,
      orgId: args.orgId,
      slug: fields.slug,
      sourceKind: "manual",
      updatedAt: now,
    });
  },
  returns: v.id("librarySkills"),
});

export const update = authedMutation({
  args: {
    body: v.optional(v.string()),
    description: v.optional(v.string()),
    name: v.optional(v.string()),
    skillId: v.id("librarySkills"),
    slug: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const skill = await ctx.db.get("librarySkills", args.skillId);
    if (!skill) {
      throw new Error("Skill not found");
    }
    await requireSkillAdmin(ctx, skill.orgId, ctx.user._id);
    const fields = normalizeSkillFields({
      body: args.body ?? skill.body,
      description: args.description ?? skill.description,
      name: args.name ?? skill.name,
      slug: args.slug ?? skill.slug,
    });
    if (fields.slug !== skill.slug) {
      const clash = await findSkillBySlug(ctx, skill.orgId, fields.slug);
      if (clash) {
        throw new Error("A skill with this slug already exists");
      }
    }
    await ctx.db.patch("librarySkills", args.skillId, {
      body: fields.body,
      description: fields.description,
      name: fields.name,
      slug: fields.slug,
      updatedAt: Date.now(),
    });
    return null;
  },
  returns: v.null(),
});

export const remove = authedMutation({
  args: { skillId: v.id("librarySkills") },
  handler: async (ctx, args) => {
    const skill = await ctx.db.get("librarySkills", args.skillId);
    if (!skill) {
      throw new Error("Skill not found");
    }
    await requireSkillAdmin(ctx, skill.orgId, ctx.user._id);
    const items = await ctx.db
      .query("skillProfileItems")
      .withIndex("by_skill", (q) => q.eq("skillId", args.skillId))
      .take(MAX_LIBRARY_SKILLS);
    for (const item of items) {
      await ctx.db.delete("skillProfileItems", item._id);
    }
    await ctx.db.delete("librarySkills", args.skillId);
    return null;
  },
  returns: v.null(),
});

export const upsertImported = internalMutation({
  args: {
    body: v.string(),
    createdBy: v.id("users"),
    description: v.optional(v.string()),
    name: v.string(),
    orgId: v.id("orgs"),
    slug: v.optional(v.string()),
    sourceKind: skillSourceKind,
    sourceUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const fields = normalizeSkillFields(args);
    const sourceUrl = normalizeSourceUrl(args.sourceUrl);
    const existing = await findSkillBySlug(ctx, args.orgId, fields.slug);
    const now = Date.now();
    if (existing) {
      await ctx.db.patch("librarySkills", existing._id, {
        body: fields.body,
        description: fields.description,
        name: fields.name,
        sourceKind: args.sourceKind,
        sourceUrl,
        updatedAt: now,
      });
      return existing._id;
    }
    const count = await ctx.db
      .query("librarySkills")
      .withIndex("by_org", (q) => q.eq("orgId", args.orgId))
      .take(MAX_LIBRARY_SKILLS);
    if (count.length >= MAX_LIBRARY_SKILLS) {
      throw new Error(`Library can hold at most ${MAX_LIBRARY_SKILLS} skills`);
    }
    return await ctx.db.insert("librarySkills", {
      body: fields.body,
      createdBy: args.createdBy,
      description: fields.description,
      name: fields.name,
      orgId: args.orgId,
      slug: fields.slug,
      sourceKind: args.sourceKind,
      sourceUrl,
      updatedAt: now,
    });
  },
  returns: v.id("librarySkills"),
});
