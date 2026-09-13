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
  providers: readonly ProviderReport[]
): Promise<void> {
  for (const provider of providers) {
    const existing = await ctx.db
      .query("runtimeProviders")
      .withIndex("by_runtime_and_kind", (q) =>
        q.eq("runtimeId", runtimeId).eq("driverKind", provider.driverKind)
      )
      .unique();
    const patch: {
      available: boolean;
      version?: string;
      binaryPath?: string;
      installMethod?: ProviderReport["installMethod"];
      updateCommand?: string;
      models?: {
        slug: string;
        name?: string;
        default?: boolean;
        defaultReasoningLevel?: string;
        supportedReasoningLevels?: string[];
      }[];
      modelsCheckedAt?: number;
      modelsError?: string;
    } = {
      available: provider.available,
      version: provider.version?.slice(0, 80),
      binaryPath: provider.binaryPath?.slice(0, 500),
    };
    if (provider.installMethod !== undefined) {
      patch.installMethod = provider.installMethod;
    }
    if (provider.updateCommand !== undefined) {
      patch.updateCommand = provider.updateCommand.slice(0, 200);
    }
    if (provider.modelsCheckedAt !== undefined) {
      patch.models = (provider.models ?? [])
        .slice(0, MAX_MODELS)
        .map((model) => {
          const row: {
            slug: string;
            name?: string;
            default?: boolean;
            defaultReasoningLevel?: string;
            supportedReasoningLevels?: string[];
          } = { slug: model.slug.slice(0, 80) };
          if (model.name) {
            row.name = model.name.slice(0, 120);
          }
          if (model.default) {
            row.default = true;
          }
          if (model.defaultReasoningLevel) {
            row.defaultReasoningLevel = model.defaultReasoningLevel.slice(
              0,
              40
            );
          }
          if (model.supportedReasoningLevels) {
            row.supportedReasoningLevels = model.supportedReasoningLevels
              .slice(0, 20)
              .map((level) => level.slice(0, 40));
          }
          return row;
        });
      patch.modelsCheckedAt = provider.modelsCheckedAt;
      if (provider.modelsError !== undefined) {
        patch.modelsError = provider.modelsError.slice(0, 500);
      }
    }
    if (existing) {
      await ctx.db.patch("runtimeProviders", existing._id, patch);
    } else {
      await ctx.db.insert("runtimeProviders", {
        runtimeId,
        driverKind: provider.driverKind,
        ...patch,
      });
    }
  }
}
