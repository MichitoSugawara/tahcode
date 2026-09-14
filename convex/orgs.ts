import { v } from "convex/values";

import { isValidEmail } from "../shared/auth.ts";
import { getMembership, requireRole } from "./lib/access";
import type { OrgRole } from "./lib/access";
import { getCurrentUser } from "./lib/auth";
import { authedMutation, authedQuery } from "./lib/customFunctions";
import { randomToken, slugify } from "./lib/ids";
import { orgRole, orgSummary, userSummary } from "./lib/validators";

const memberView = v.object({
  role: orgRole,
  user: userSummary,
});

export const create = authedMutation({
  args: { name: v.string() },
  handler: async (ctx, args) => {
    const name = args.name.trim().slice(0, 80);
    if (name.length < 1) {
      throw new Error("Organization name is required");
    }
    const slug = `${slugify(name)}-${randomToken(4).slice(0, 6)}`;
    const orgId = await ctx.db.insert("orgs", {
      name,
      slug,
      createdBy: ctx.user._id,
    });
    await ctx.db.insert("orgMembers", {
      orgId,
      userId: ctx.user._id,
      role: "owner",
    });
    return orgId;
  },
  returns: v.id("orgs"),
});

export const listMine = authedQuery({
  args: {},
  handler: async (ctx) => {
    const memberships = await ctx.db
      .query("orgMembers")
      .withIndex("by_user", (q) => q.eq("userId", ctx.user._id))
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
        slug: org.slug,
        role: membership.role,
      });
    }
    return orgs;
  },
  returns: v.array(orgSummary),
});

export const get = authedQuery({
  args: { orgId: v.id("orgs") },
  handler: async (ctx, args) => {
    const membership = await getMembership(ctx, args.orgId, ctx.user._id);
    if (!membership) {
      return null;
    }
    const org = await ctx.db.get("orgs", args.orgId);
    if (!org) {
      return null;
    }
    return {
      _id: org._id,
      name: org.name,
      slug: org.slug,
      role: membership.role,
    };
  },
  returns: v.union(
    v.object({
      _id: v.id("orgs"),
      name: v.string(),
      slug: v.string(),
      role: orgRole,
    }),
    v.null()
  ),
});

export const members = authedQuery({
  args: { orgId: v.id("orgs") },
  handler: async (ctx, args) => {
    const membership = await getMembership(ctx, args.orgId, ctx.user._id);
    if (!membership) {
      throw new Error("Not a member of this organization");
    }
    const rows = await ctx.db
      .query("orgMembers")
      .withIndex("by_org", (q) => q.eq("orgId", args.orgId))
      .take(200);
    const out: {
      user: {
        _id: typeof ctx.user._id;
        name?: string;
        email?: string;
        handle?: string;
        image?: string;
      };
      role: OrgRole;
    }[] = [];
    for (const row of rows) {
      const user = await ctx.db.get("users", row.userId);
      if (!user) {
        continue;
      }
      out.push({
        user: {
          _id: user._id,
          name: user.name,
          email: user.email,
          handle: user.handle,
          image: user.image,
        },
        role: row.role,
      });
    }
    return out;
  },
  returns: v.array(memberView),
});

export const setRole = authedMutation({
  args: {
    orgId: v.id("orgs"),
    role: orgRole,
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const actor = await requireRole(ctx, args.orgId, ctx.user._id, "admin");
    const target = await getMembership(ctx, args.orgId, args.userId);
    if (!target) {
      throw new Error("Target is not a member");
    }
    // Only owners may grant or revoke the owner role (admins would otherwise
    // be able to escalate themselves via a colluding member).
    if (
      (args.role === "owner" || target.role === "owner") &&
      actor.role !== "owner"
    ) {
      throw new Error("Only an owner can change owner roles");
    }
    if (target.role === "owner" && args.role !== "owner") {
      const owners = await ctx.db
        .query("orgMembers")
        .withIndex("by_org", (q) => q.eq("orgId", args.orgId))
        .take(200);
      const ownerCount = owners.filter((row) => row.role === "owner").length;
      if (ownerCount <= 1) {
        throw new Error("Cannot demote the last owner");
      }
    }
    await ctx.db.patch("orgMembers", target._id, { role: args.role });
    return null;
  },
  returns: v.null(),
});

export const createInvite = authedMutation({
  args: {
    email: v.optional(v.string()),
    orgId: v.id("orgs"),
    role: orgRole,
  },
  handler: async (ctx, args) => {
    const actor = await requireRole(ctx, args.orgId, ctx.user._id, "admin");
    if (args.role === "owner" && actor.role !== "owner") {
      throw new Error("Only an owner can invite owners");
    }
    const email = args.email?.trim().toLowerCase();
    if (email && !isValidEmail(email)) {
      throw new Error("メールアドレスの形式が正しくありません");
    }
    const token = randomToken(18);
    await ctx.db.insert("invites", {
      orgId: args.orgId,
      email: email || undefined,
      role: args.role,
      token,
      createdBy: ctx.user._id,
      expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
    });
    return { token };
  },
  returns: v.object({ token: v.string() }),
});

export const acceptInvite = authedMutation({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const invite = await ctx.db
      .query("invites")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .unique();
    if (!invite) {
      throw new Error("Invite not found");
    }
    if (invite.expiresAt < Date.now()) {
      throw new Error("Invite expired");
    }
    if (invite.acceptedBy) {
      throw new Error("Invite already used");
    }
    const user = await getCurrentUser(ctx);
    if (invite.email) {
      if (user.email?.toLowerCase() !== invite.email.toLowerCase()) {
        throw new Error("This invite is for a different email");
      }
      if (user.emailVerificationTime === undefined) {
        throw new Error("Verify your email before accepting this invite");
      }
    }
    const existing = await getMembership(ctx, invite.orgId, user._id);
    if (!existing) {
      await ctx.db.insert("orgMembers", {
        orgId: invite.orgId,
        userId: user._id,
        role: invite.role,
      });
    }
    await ctx.db.patch("invites", invite._id, { acceptedBy: user._id });
    return invite.orgId;
  },
  returns: v.id("orgs"),
});
