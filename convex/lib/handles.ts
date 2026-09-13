import {
  HANDLE_MAX_LENGTH,
  isReservedHandle,
  normalizeHandle,
} from "../../shared/handles.ts";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

export { isReservedHandle, normalizeHandle };

export async function handleTaken(
  ctx: QueryCtx | MutationCtx,
  handle: string,
  excludeUserId?: Id<"users">
): Promise<boolean> {
  const rows = await ctx.db
    .query("users")
    .withIndex("by_handle", (q) => q.eq("handle", handle))
    .take(2);
  return rows.some(
    (row) => !excludeUserId || String(row._id) !== String(excludeUserId)
  );
}

export async function allocateUniqueHandle(
  ctx: MutationCtx,
  desired: string,
  excludeUserId?: Id<"users">
): Promise<string> {
  const base = normalizeHandle(desired) || "member";
  const tryHandle = async (candidate: string) =>
    !isReservedHandle(candidate) &&
    !(await handleTaken(ctx, candidate, excludeUserId));

  if (await tryHandle(base)) {
    return base;
  }
  for (let attempt = 0; attempt < 24; attempt += 1) {
    const suffix = String(1000 + Math.floor(Math.random() * 9000));
    const candidate = `${base.slice(0, HANDLE_MAX_LENGTH - suffix.length)}${suffix}`;
    if (await tryHandle(candidate)) {
      return candidate;
    }
  }
  throw new Error("Could not allocate a unique handle");
}
