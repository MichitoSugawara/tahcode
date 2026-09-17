import { runtimeHasPreview } from "../../shared/workbenchPreview.ts";
import { runtimeHasScreen } from "../../shared/workbenchScreen.ts";
import { runtimeHasPty } from "../../shared/workbenchTerminal.ts";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { assertCanUseRuntime, getMembership } from "./access";

type Ctx = QueryCtx | MutationCtx;

export async function requireUsableRuntime(
  ctx: Ctx,
  runtimeId: Id<"runtimes">,
  userId: Id<"users">
): Promise<{ membership: Doc<"orgMembers">; runtime: Doc<"runtimes"> }> {
  const runtime = await ctx.db.get("runtimes", runtimeId);
  if (!runtime) {
    throw new Error("Runtime not found");
  }
  const membership = await getMembership(ctx, runtime.orgId, userId);
  if (!membership) {
    throw new Error("Not a member of this organization");
  }
  await assertCanUseRuntime(ctx, runtime, userId, membership.role);
  return { membership, runtime };
}

export async function requirePtyRuntime(
  ctx: Ctx,
  runtimeId: Id<"runtimes">,
  userId: Id<"users">
) {
  const loaded = await requireUsableRuntime(ctx, runtimeId, userId);
  if (!runtimeHasPty(loaded.runtime.capabilities)) {
    throw new Error(
      "このブリッジはターミナルに未対応です。npm i -g tahcode@latest && tahcode restart を実行してください。"
    );
  }
  return loaded;
}

export async function requirePreviewRuntime(
  ctx: Ctx,
  runtimeId: Id<"runtimes">,
  userId: Id<"users">
) {
  const loaded = await requireUsableRuntime(ctx, runtimeId, userId);
  if (!runtimeHasPreview(loaded.runtime.capabilities)) {
    throw new Error(
      "このブリッジはプレビューに未対応です。npm i -g tahcode@latest && tahcode restart を実行してください。"
    );
  }
  return loaded;
}

export async function requireScreenRuntime(
  ctx: Ctx,
  runtimeId: Id<"runtimes">,
  userId: Id<"users">
) {
  const loaded = await requireUsableRuntime(ctx, runtimeId, userId);
  if (!runtimeHasScreen(loaded.runtime.capabilities)) {
    throw new Error(
      "このブリッジは画面フレームに未対応です。npm i -g tahcode@latest && tahcode restart を実行してください。"
    );
  }
  return loaded;
}

export async function canSeeWorkbenchSession(
  ctx: Ctx,
  orgId: Id<"orgs">,
  runtimeId: Id<"runtimes">,
  requestedBy: Id<"users">,
  userId: Id<"users">
): Promise<boolean> {
  if (requestedBy === userId) {
    const membership = await getMembership(ctx, orgId, userId);
    return membership !== null;
  }
  try {
    await requireUsableRuntime(ctx, runtimeId, userId);
    return true;
  } catch {
    return false;
  }
}
