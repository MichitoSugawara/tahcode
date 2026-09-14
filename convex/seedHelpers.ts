import { v } from "convex/values";

import {
  PREVIEW_LOGIN_EMAIL,
  PREVIEW_LOGIN_NAME,
  PREVIEW_ORG_NAME,
  PREVIEW_ORG_SLUG,
} from "../shared/previewLogin.ts";
import { internalMutation } from "./_generated/server";

export const ensurePreviewWorkspace = internalMutation({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const user = await ctx.db.get("users", args.userId);
    if (!user) {
      throw new Error("Preview login user not found");
    }
    const userPatch: {
      email?: string;
      emailVerificationTime?: number;
      name?: string;
    } = {};
    if (user.email !== PREVIEW_LOGIN_EMAIL) {
      userPatch.email = PREVIEW_LOGIN_EMAIL;
    }
    if (user.emailVerificationTime === undefined) {
      userPatch.emailVerificationTime = Date.now();
    }
    if (!user.name) {
      userPatch.name = PREVIEW_LOGIN_NAME;
    }
    if (Object.keys(userPatch).length > 0) {
      await ctx.db.patch("users", args.userId, userPatch);
    }

    const memberships = await ctx.db
      .query("orgMembers")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .take(20);
    for (const membership of memberships) {
      const org = await ctx.db.get("orgs", membership.orgId);
      if (!org) {
        continue;
      }
      if (membership.role !== "owner") {
        await ctx.db.patch("orgMembers", membership._id, { role: "owner" });
      }
      return { created: false, orgId: org._id, slug: org.slug };
    }

    const existing = await ctx.db
      .query("orgs")
      .withIndex("by_slug", (q) => q.eq("slug", PREVIEW_ORG_SLUG))
      .unique();
    if (existing) {
      await ctx.db.insert("orgMembers", {
        orgId: existing._id,
        role: "owner",
        userId: args.userId,
      });
      return { created: false, orgId: existing._id, slug: existing.slug };
    }

    const orgId = await ctx.db.insert("orgs", {
      createdBy: args.userId,
      name: PREVIEW_ORG_NAME,
      slug: PREVIEW_ORG_SLUG,
    });
    await ctx.db.insert("orgMembers", {
      orgId,
      role: "owner",
      userId: args.userId,
    });
    return { created: true, orgId, slug: PREVIEW_ORG_SLUG };
  },
  returns: v.object({
    created: v.boolean(),
    orgId: v.id("orgs"),
    slug: v.string(),
  }),
});
