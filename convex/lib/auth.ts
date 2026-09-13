import { getAuthUserId } from "@convex-dev/auth/server";

import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

export async function getCurrentUserId(
  ctx: QueryCtx | MutationCtx
): Promise<Id<"users">> {
  const userId = await getAuthUserId(ctx);
  if (!userId) {
    throw new Error("Not authenticated");
  }
  return userId;
}

export async function getCurrentUser(ctx: QueryCtx | MutationCtx) {
  const userId = await getCurrentUserId(ctx);
  const user = await ctx.db.get("users", userId);
  if (!user) {
    throw new Error("User not found");
  }
  return user;
}

export async function getOptionalUser(ctx: QueryCtx | MutationCtx) {
  const userId = await getAuthUserId(ctx);
  if (!userId) {
    return null;
  }
  return await ctx.db.get("users", userId);
}
