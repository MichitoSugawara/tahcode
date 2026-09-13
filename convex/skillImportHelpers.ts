import { v } from "convex/values";

import { internalQuery } from "./_generated/server";
import { requireSkillAdmin } from "./lib/skills";

export const assertCanImport = internalQuery({
  args: {
    orgId: v.id("orgs"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    await requireSkillAdmin(ctx, args.orgId, args.userId);
    return null;
  },
  returns: v.null(),
});
