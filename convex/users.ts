import { v } from "convex/values";

import { mutation, query } from "./_generated/server";
import { getCurrentUserId, getOptionalUser } from "./lib/auth";
import { authedMutation } from "./lib/customFunctions";
import { userSummary } from "./lib/validators";

export const me = query({
  args: {},
  handler: async (ctx) => {
    const user = await getOptionalUser(ctx);
    if (!user) {
      return null;
    }
    return {
      _id: user._id,
      name: user.name,
      email: user.email,
      handle: user.handle,
      image: user.image,
    };
  },
  returns: v.union(userSummary, v.null()),
});

export const updateProfile = authedMutation({
  args: {
    handle: v.optional(v.string()),
    name: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const patch: { name?: string; handle?: string } = {};
    if (args.name !== undefined) {
      const name = args.name.trim().slice(0, 80);
      if (name.length < 1) {
        throw new Error("Name is required");
      }
      patch.name = name;
    }
    if (args.handle !== undefined) {
      const handle = args.handle
        .trim()
        .toLowerCase()
        .replaceAll(/[^a-z0-9_]+/g, "")
        .slice(0, 30);
      if (handle.length >= 1) {
        const existing = await ctx.db
          .query("users")
          .withIndex("by_handle", (q) => q.eq("handle", handle))
          .unique();
        if (existing && String(existing._id) !== String(ctx.user._id)) {
          throw new Error("Handle is taken");
        }
        patch.handle = handle;
      }
    }
    if (Object.keys(patch).length > 0) {
      await ctx.db.patch("users", ctx.user._id, patch);
    }
    return null;
  },
  returns: v.null(),
});

export const ensureHandle = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getCurrentUserId(ctx);
    const user = await ctx.db.get("users", userId);
    if (!user) {
      throw new Error("User not found");
    }
    if (user.handle) {
      return user.handle;
    }
    const base = (user.name ?? user.email?.split("@")[0] ?? "member")
      .toLowerCase()
      .replaceAll(/[^a-z0-9_]+/g, "")
      .slice(0, 20);
    const handle = `${base || "member"}${Math.floor(1000 + Math.random() * 9000)}`;
    await ctx.db.patch("users", userId, { handle });
    return handle;
  },
  returns: v.string(),
});
