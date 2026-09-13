import {
  customMutation,
  customQuery,
} from "convex-helpers/server/customFunctions";

import { mutation, query } from "../_generated/server";
import { getCurrentUser } from "./auth";

export const authedQuery = customQuery(query, {
  args: {},
  input: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    return { args, ctx: { ...ctx, user } };
  },
});

export const authedMutation = customMutation(mutation, {
  args: {},
  input: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    return { args, ctx: { ...ctx, user } };
  },
});
