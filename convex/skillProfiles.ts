import { v } from "convex/values";

import {
  MAX_PROFILE_SKILLS,
  MAX_PROFILES,
  MAX_SKILL_DESCRIPTION,
  MAX_SKILL_NAME,
} from "../shared/skills.ts";
import { authedMutation, authedQuery } from "./lib/customFunctions";
import {
  detachProfile,
  replaceProfileSkills,
  requireOrgMember,
  requireSkillAdmin,
  summarizeProfile,
} from "./lib/skills";
import { skillProfileSummary } from "./lib/validators";

function normalizeProfileName(name: string) {
  const trimmed = name.trim().slice(0, MAX_SKILL_NAME);
  if (trimmed.length < 1) {
    throw new Error("Profile name is required");
  }
  return trimmed;
}

function normalizeProfileDescription(description?: string) {
  const trimmed = description?.trim();
  if (!trimmed) {
    return;
  }
  return trimmed.slice(0, MAX_SKILL_DESCRIPTION);
}

export const list = authedQuery({
  args: { orgId: v.id("orgs") },
  handler: async (ctx, args) => {
    await requireOrgMember(ctx, args.orgId, ctx.user._id);
    const rows = await ctx.db
      .query("skillProfiles")
      .withIndex("by_org", (q) => q.eq("orgId", args.orgId))
      .take(MAX_PROFILES);
    const out = [];
    for (const row of rows) {
      out.push(await summarizeProfile(ctx, row));
    }
    return out;
  },
  returns: v.array(skillProfileSummary),
});

export const get = authedQuery({
  args: { profileId: v.id("skillProfiles") },
  handler: async (ctx, args) => {
    const profile = await ctx.db.get("skillProfiles", args.profileId);
    if (!profile) {
      return null;
    }
    const membership = await requireOrgMember(
      ctx,
      profile.orgId,
      ctx.user._id
    ).catch(() => null);
    if (!membership) {
      return null;
    }
    return await summarizeProfile(ctx, profile);
  },
  returns: v.union(skillProfileSummary, v.null()),
});

export const create = authedMutation({
  args: {
    description: v.optional(v.string()),
    name: v.string(),
    orgId: v.id("orgs"),
    skillIds: v.optional(v.array(v.id("librarySkills"))),
  },
  handler: async (ctx, args) => {
    await requireSkillAdmin(ctx, args.orgId, ctx.user._id);
    const existing = await ctx.db
      .query("skillProfiles")
      .withIndex("by_org", (q) => q.eq("orgId", args.orgId))
      .take(MAX_PROFILES);
    if (existing.length >= MAX_PROFILES) {
      throw new Error(
        `An organization can have at most ${MAX_PROFILES} profiles`
      );
    }
    const now = Date.now();
    const profileId = await ctx.db.insert("skillProfiles", {
      createdBy: ctx.user._id,
      description: normalizeProfileDescription(args.description),
      name: normalizeProfileName(args.name),
      orgId: args.orgId,
      updatedAt: now,
    });
    await replaceProfileSkills(ctx, {
      orgId: args.orgId,
      profileId,
      skillIds: args.skillIds ?? [],
    });
    return profileId;
  },
  returns: v.id("skillProfiles"),
});

export const update = authedMutation({
  args: {
    description: v.optional(v.string()),
    name: v.optional(v.string()),
    profileId: v.id("skillProfiles"),
    skillIds: v.optional(v.array(v.id("librarySkills"))),
  },
  handler: async (ctx, args) => {
    const profile = await ctx.db.get("skillProfiles", args.profileId);
    if (!profile) {
      throw new Error("Profile not found");
    }
    await requireSkillAdmin(ctx, profile.orgId, ctx.user._id);
    await ctx.db.patch("skillProfiles", args.profileId, {
      description:
        args.description === undefined
          ? profile.description
          : normalizeProfileDescription(args.description),
      name:
        args.name === undefined
          ? profile.name
          : normalizeProfileName(args.name),
      updatedAt: Date.now(),
    });
    if (args.skillIds) {
      await replaceProfileSkills(ctx, {
        orgId: profile.orgId,
        profileId: args.profileId,
        skillIds: args.skillIds,
      });
    }
    return null;
  },
  returns: v.null(),
});

export const remove = authedMutation({
  args: { profileId: v.id("skillProfiles") },
  handler: async (ctx, args) => {
    const profile = await ctx.db.get("skillProfiles", args.profileId);
    if (!profile) {
      throw new Error("Profile not found");
    }
    await requireSkillAdmin(ctx, profile.orgId, ctx.user._id);
    const items = await ctx.db
      .query("skillProfileItems")
      .withIndex("by_profile", (q) => q.eq("profileId", args.profileId))
      .take(MAX_PROFILE_SKILLS);
    for (const item of items) {
      await ctx.db.delete("skillProfileItems", item._id);
    }
    await detachProfile(ctx, args.profileId);
    await ctx.db.delete("skillProfiles", args.profileId);
    return null;
  },
  returns: v.null(),
});
