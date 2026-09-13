import {
  MAX_PROFILE_SKILLS,
  MAX_SKILL_BODY,
  MAX_SKILL_DESCRIPTION,
  MAX_SKILL_NAME,
  MAX_SKILL_SLUG,
  MAX_SKILL_SOURCE_URL,
  buildSkillMarkdown,
  isValidSkillSlug,
  parseSkillMarkdown,
  skillSlugFromName,
} from "../../shared/skills.ts";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { getMembership, requireRole } from "./access";

type Ctx = QueryCtx | MutationCtx;

export type JobSkill = {
  body: string;
  description: string;
  name: string;
  slug: string;
};

export async function requireOrgMember(
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

export async function requireSkillAdmin(
  ctx: Ctx,
  orgId: Id<"orgs">,
  userId: Id<"users">
) {
  return await requireRole(ctx, orgId, userId, "admin");
}

export function normalizeSkillFields(input: {
  body: string;
  description?: string;
  name: string;
  slug?: string;
}) {
  const parsed = parseSkillMarkdown(input.body);
  const name = (input.name.trim() || parsed.name).slice(0, MAX_SKILL_NAME);
  const description = (input.description?.trim() || parsed.description).slice(
    0,
    MAX_SKILL_DESCRIPTION
  );
  const slug = (input.slug?.trim() || skillSlugFromName(name)).slice(
    0,
    MAX_SKILL_SLUG
  );
  if (name.length < 1) {
    throw new Error("Skill name is required");
  }
  if (!isValidSkillSlug(slug)) {
    throw new Error(
      "Skill slug must be 1-64 characters of lowercase letters, digits, or hyphens"
    );
  }
  const body = buildSkillMarkdown({
    body: parsed.body || input.body,
    description,
    name,
  });
  if (body.length > MAX_SKILL_BODY) {
    throw new Error(`Skill body must be at most ${MAX_SKILL_BODY} characters`);
  }
  return { body, description, name, slug };
}

export function normalizeSourceUrl(url?: string) {
  const trimmed = url?.trim();
  if (!trimmed) {
    return;
  }
  if (trimmed.length > MAX_SKILL_SOURCE_URL) {
    throw new Error("Source URL is too long");
  }
  return trimmed;
}

export async function findSkillBySlug(
  ctx: Ctx,
  orgId: Id<"orgs">,
  slug: string
) {
  return await ctx.db
    .query("librarySkills")
    .withIndex("by_org_and_slug", (q) => q.eq("orgId", orgId).eq("slug", slug))
    .unique();
}

export async function requireOrgSkill(
  ctx: Ctx,
  orgId: Id<"orgs">,
  skillId: Id<"librarySkills">
) {
  const skill = await ctx.db.get("librarySkills", skillId);
  if (!skill || String(skill.orgId) !== String(orgId)) {
    throw new Error("Skill not found in this organization");
  }
  return skill;
}

export async function requireOrgProfile(
  ctx: Ctx,
  orgId: Id<"orgs">,
  profileId: Id<"skillProfiles">
) {
  const profile = await ctx.db.get("skillProfiles", profileId);
  if (!profile || String(profile.orgId) !== String(orgId)) {
    throw new Error("Profile not found in this organization");
  }
  return profile;
}

export async function listProfileSkillIds(
  ctx: Ctx,
  profileId: Id<"skillProfiles">
) {
  const rows = await ctx.db
    .query("skillProfileItems")
    .withIndex("by_profile", (q) => q.eq("profileId", profileId))
    .take(MAX_PROFILE_SKILLS);
  return rows.map((row) => row.skillId);
}

export async function replaceProfileSkills(
  ctx: MutationCtx,
  input: {
    orgId: Id<"orgs">;
    profileId: Id<"skillProfiles">;
    skillIds: Id<"librarySkills">[];
  }
) {
  if (input.skillIds.length > MAX_PROFILE_SKILLS) {
    throw new Error(
      `A profile can include at most ${MAX_PROFILE_SKILLS} skills`
    );
  }
  const unique: Id<"librarySkills">[] = [];
  const seen = new Set<string>();
  for (const skillId of input.skillIds) {
    const key = String(skillId);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    await requireOrgSkill(ctx, input.orgId, skillId);
    unique.push(skillId);
  }
  const existing = await ctx.db
    .query("skillProfileItems")
    .withIndex("by_profile", (q) => q.eq("profileId", input.profileId))
    .take(MAX_PROFILE_SKILLS);
  for (const row of existing) {
    await ctx.db.delete("skillProfileItems", row._id);
  }
  for (const skillId of unique) {
    await ctx.db.insert("skillProfileItems", {
      orgId: input.orgId,
      profileId: input.profileId,
      skillId,
    });
  }
  return unique;
}

export async function summarizeProfile(
  ctx: Ctx,
  profile: Doc<"skillProfiles">
) {
  const skillIds = await listProfileSkillIds(ctx, profile._id);
  return {
    _id: profile._id,
    description: profile.description,
    name: profile.name,
    orgId: profile.orgId,
    skillCount: skillIds.length,
    skillIds,
    updatedAt: profile.updatedAt,
  };
}

export function summarizeLibrarySkill(skill: Doc<"librarySkills">) {
  return {
    _id: skill._id,
    description: skill.description,
    name: skill.name,
    orgId: skill.orgId,
    slug: skill.slug,
    sourceKind: skill.sourceKind,
    sourceUrl: skill.sourceUrl,
    updatedAt: skill.updatedAt,
  };
}

export async function resolveAttachedProfileId(
  ctx: Ctx,
  chat: Doc<"chats">
): Promise<Id<"skillProfiles"> | null> {
  if (chat.profileId) {
    const profile = await ctx.db.get("skillProfiles", chat.profileId);
    if (profile && String(profile.orgId) === String(chat.orgId)) {
      return profile._id;
    }
  }
  if (!chat.projectId) {
    return null;
  }
  const project = await ctx.db.get("projects", chat.projectId);
  if (!project?.profileId) {
    return null;
  }
  const profile = await ctx.db.get("skillProfiles", project.profileId);
  if (profile && String(profile.orgId) === String(chat.orgId)) {
    return profile._id;
  }
  return null;
}

export async function loadJobSkills(
  ctx: Ctx,
  chat: Doc<"chats">
): Promise<JobSkill[]> {
  const profileId = await resolveAttachedProfileId(ctx, chat);
  if (!profileId) {
    return [];
  }
  const skillIds = await listProfileSkillIds(ctx, profileId);
  const skills: JobSkill[] = [];
  for (const skillId of skillIds) {
    const skill = await ctx.db.get("librarySkills", skillId);
    if (!skill || String(skill.orgId) !== String(chat.orgId)) {
      continue;
    }
    skills.push({
      body: skill.body,
      description: skill.description,
      name: skill.name,
      slug: skill.slug,
    });
  }
  return skills;
}

const DETACH_CHAT_BATCH = 200;
const DETACH_PROJECT_BATCH = 100;
const DETACH_MAX_ROUNDS = 20;

export async function detachProfile(
  ctx: MutationCtx,
  profileId: Id<"skillProfiles">
) {
  for (let round = 0; round < DETACH_MAX_ROUNDS; round++) {
    const chats = await ctx.db
      .query("chats")
      .withIndex("by_profile", (q) => q.eq("profileId", profileId))
      .take(DETACH_CHAT_BATCH);
    if (chats.length === 0) {
      break;
    }
    for (const chat of chats) {
      await ctx.db.patch("chats", chat._id, { profileId: undefined });
    }
    if (chats.length < DETACH_CHAT_BATCH) {
      break;
    }
  }
  for (let round = 0; round < DETACH_MAX_ROUNDS; round++) {
    const projects = await ctx.db
      .query("projects")
      .withIndex("by_profile", (q) => q.eq("profileId", profileId))
      .take(DETACH_PROJECT_BATCH);
    if (projects.length === 0) {
      break;
    }
    for (const project of projects) {
      await ctx.db.patch("projects", project._id, { profileId: undefined });
    }
    if (projects.length < DETACH_PROJECT_BATCH) {
      break;
    }
  }
}
