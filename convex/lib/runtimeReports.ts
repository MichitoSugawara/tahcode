import type { Infer } from "convex/values";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import type { runtimeProviderReport } from "./validators";

export type ProviderReport = Infer<typeof runtimeProviderReport>;

const MAX_MODELS = 200;

/**
 * Upsert what a bridge reported about the provider CLIs on its machine.
 * Shared by the token-authed heartbeat and the owner-authed `runtimes:report`
 * so both write the same shape. Live-model fields are only overwritten when
 * the report carries them: an older bridge that does not discover models must
 * not erase a list a newer one wrote.
 */
export async function upsertProviderReports(
  ctx: MutationCtx,
  runtimeId: Id<"runtimes">,
  providers: readonly ProviderReport[],
): Promise<void> {
  for (const provider of providers) {
    const existing = await ctx.db
      .query("runtimeProviders")
      .withIndex("by_runtime_and_kind", (q) =>
        q.eq("runtimeId", runtimeId).eq("driverKind", provider.driverKind),
      )
      .unique();
    const base = {
      available: provider.available,
      version: provider.version?.slice(0, 80),
      binaryPath: provider.binaryPath?.slice(0, 500),
    };
    const maintenance = {
      ...(provider.installMethod !== undefined ? { installMethod: provider.installMethod } : {}),
      ...(provider.updateCommand !== undefined ? { updateCommand: provider.updateCommand.slice(0, 200) } : {}),
      ...(provider.modelsCheckedAt !== undefined
        ? {
            models: (provider.models ?? []).slice(0, MAX_MODELS).map((model) => ({
              slug: model.slug.slice(0, 80),
              ...(model.name ? { name: model.name.slice(0, 120) } : {}),
              ...(model.default ? { default: true } : {}),
            })),
            modelsCheckedAt: provider.modelsCheckedAt,
            modelsError: provider.modelsError?.slice(0, 500),
          }
        : {}),
    };
    if (existing) {
      await ctx.db.patch("runtimeProviders", existing._id, { ...base, ...maintenance });
    } else {
      await ctx.db.insert("runtimeProviders", {
        runtimeId,
        driverKind: provider.driverKind,
        ...base,
        ...maintenance,
      });
    }
  }
}
