import { Password } from "@convex-dev/auth/providers/Password";
import { convexAuth } from "@convex-dev/auth/server";

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    Password({
      profile(params) {
        const email = String(params.email ?? "").trim().toLowerCase();
        if (!email.includes("@")) {
          throw new Error("A valid email is required");
        }
        const name = String(params.name ?? "").trim() || email.split("@")[0] || "member";
        const handle =
          String(params.handle ?? "")
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9_]+/g, "") || name.toLowerCase().replace(/[^a-z0-9_]+/g, "");
        return { email, name, handle };
      },
    }),
  ],
});
