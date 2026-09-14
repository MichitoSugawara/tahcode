import {
  createAccount,
  modifyAccountCredentials,
  retrieveAccount,
} from "@convex-dev/auth/server";
import { v } from "convex/values";

import {
  PREVIEW_LOGIN_EMAIL,
  PREVIEW_LOGIN_NAME,
  PREVIEW_LOGIN_PASSWORD,
  previewLoginSeedAllowed,
} from "../shared/previewLogin.ts";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalAction } from "./_generated/server";
import type { ActionCtx } from "./_generated/server";

declare const process: { env: Record<string, string | undefined> };

async function existingPasswordAccount(ctx: ActionCtx, email: string) {
  try {
    return await retrieveAccount(ctx, {
      account: { id: email },
      provider: "password",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message === "InvalidAccountId") {
      return null;
    }
    throw error;
  }
}

/** Idempotent: create or reset `test@test.com` / `test1234` and a Preview org.
 * Refuses production (`SITE_URL=https://tahcode.com`) and empty SITE_URL. */
export const ensurePreviewLogin = internalAction({
  args: {},
  handler: async (
    ctx
  ): Promise<{
    created: boolean;
    email: string;
    orgSlug: string;
    passwordReset: boolean;
    userId: Id<"users">;
  }> => {
    if (!previewLoginSeedAllowed(process.env.SITE_URL ?? "")) {
      throw new Error(
        "Preview login seed is disabled on this deployment (missing SITE_URL or production origin)"
      );
    }

    const email = PREVIEW_LOGIN_EMAIL;
    const existing = await existingPasswordAccount(ctx, email);
    let userId: Id<"users">;
    let created = false;
    let passwordReset = false;

    if (existing) {
      await modifyAccountCredentials(ctx, {
        account: { id: email, secret: PREVIEW_LOGIN_PASSWORD },
        provider: "password",
      });
      userId = existing.user._id;
      passwordReset = true;
    } else {
      const createdAccount = await createAccount(ctx, {
        account: { id: email, secret: PREVIEW_LOGIN_PASSWORD },
        profile: {
          email,
          emailVerificationTime: Date.now(),
          name: PREVIEW_LOGIN_NAME,
        },
        provider: "password",
        shouldLinkViaEmail: true,
      });
      userId = createdAccount.user._id;
      created = true;
    }

    const workspace: { slug: string } = await ctx.runMutation(
      internal.seedHelpers.ensurePreviewWorkspace,
      { userId }
    );

    return {
      created,
      email,
      orgSlug: workspace.slug,
      passwordReset,
      userId,
    };
  },
  returns: v.object({
    created: v.boolean(),
    email: v.string(),
    orgSlug: v.string(),
    passwordReset: v.boolean(),
    userId: v.id("users"),
  }),
});
