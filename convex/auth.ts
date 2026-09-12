import Google from "@auth/core/providers/google";
import { Password } from "@convex-dev/auth/providers/Password";
import { convexAuth, type ConvexCredentialsConfig } from "@convex-dev/auth/server";
import { v } from "convex/values";
import type { DataModel } from "./_generated/dataModel";
import { query } from "./_generated/server";
import { authError, isAcceptablePassword, isValidEmail, toConvexAuthError } from "./lib/authErrors";

declare const process: { env: Record<string, string | undefined> };

function normalizeHandle(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9_]+/g, "");
}

const password = Password<DataModel>({
  profile(params) {
    const email = String(params.email ?? "").trim().toLowerCase();
    if (!isValidEmail(email)) {
      throw authError("INVALID_EMAIL");
    }
    const name = String(params.name ?? "").trim() || email.split("@")[0] || "member";
    const handle = normalizeHandle(String(params.handle ?? "")) || normalizeHandle(name);
    return { email, name, handle };
  },
  validatePasswordRequirements(value) {
    if (!isAcceptablePassword(value)) {
      throw authError("WEAK_PASSWORD");
    }
  },
});

type AuthorizeFn = NonNullable<ConvexCredentialsConfig["authorize"]>;

/* @convex-dev/auth reports wrong password / unknown account / duplicate
 * sign-up as plain `Error`s, which Convex redacts to "Server Error" on prod.
 * The real `authorize` lives on the provider's internal `options`; wrap it so
 * the client receives a ConvexError with a stable `code` instead. */
function withAuthErrorCodes(provider: ConvexCredentialsConfig): ConvexCredentialsConfig {
  const internal = provider as ConvexCredentialsConfig & { options?: { authorize?: AuthorizeFn } };
  const authorize = internal.options?.authorize;
  if (!authorize) return provider;
  const guarded: AuthorizeFn = async (params, ctx) => {
    try {
      return await authorize(params, ctx);
    } catch (error) {
      throw toConvexAuthError(error);
    }
  };
  return { ...internal, options: { ...internal.options, authorize: guarded } } as ConvexCredentialsConfig;
}

/* Google reads AUTH_GOOGLE_ID / AUTH_GOOGLE_SECRET from the deployment env.
 * Redirect URI to register in Google Cloud Console:
 *   https://<deployment>.convex.site/api/auth/callback/google
 * Convex Auth treats OAuth emails as verified, so a Google sign-in links to an
 * existing user only if that user's email is verified too. */
export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [withAuthErrorCodes(password), Google],
});

/* Public, unauthenticated: lets the login page disable the Google button
 * instead of bouncing users to a Google "client not found" page when the
 * operator has not configured the OAuth client yet. */
export const providers = query({
  args: {},
  returns: v.object({ password: v.boolean(), google: v.boolean() }),
  handler: async () => ({
    password: true,
    google: Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET),
  }),
});
