import { v } from "convex/values";

import { query } from "./_generated/server";
import { PROVIDER_CATALOG } from "./lib/providers";
import { providerKind } from "./lib/validators";

/**
 * Provider catalog ported from t3code's BUILT_IN_DRIVERS
 * (pingdotgg/t3code `apps/server/src/provider/builtInDrivers.ts`), including
 * the model slugs each CLI accepts for `@provider/model` mentions.
 * Static data only — no user data, so no auth required.
 */
export const catalog = query({
  args: {},
  handler: async () =>
    PROVIDER_CATALOG.map((entry) => ({
      kind: entry.kind,
      displayName: entry.displayName,
      binaryNames: [...entry.binaryNames],
      mentionHandles: [...entry.mentionHandles],
      headlessSummary: entry.headlessSummary,
      modelFlag: entry.modelFlag,
      models: entry.models.map((model) => ({
        slug: model.slug,
        name: model.name,
        legacy: model.legacy,
      })),
    })),
  returns: v.array(
    v.object({
      kind: providerKind,
      displayName: v.string(),
      binaryNames: v.array(v.string()),
      mentionHandles: v.array(v.string()),
      headlessSummary: v.string(),
      modelFlag: v.union(v.string(), v.null()),
      models: v.array(
        v.object({
          slug: v.string(),
          name: v.string(),
          legacy: v.optional(v.boolean()),
        })
      ),
    })
  ),
});
