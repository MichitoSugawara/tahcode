import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { sha256Hex } from "../../convex/lib/ids";
import schema from "../../convex/schema";

const modules = import.meta.glob("../../convex/**/*.*s");
const TOKEN = "th_fs_browse_test_token_value";

function fresh() {
  return convexTest(schema, modules);
}

async function insertUser(
  t: ReturnType<typeof fresh>,
  fields: { handle: string }
) {
  return await t.run(
    async (ctx) =>
      await ctx.db.insert("users", {
        handle: fields.handle,
        name: fields.handle,
      })
  );
}

function asUser(t: ReturnType<typeof fresh>, userId: Id<"users">) {
  return t.withIdentity({ subject: `${userId}|test-session` });
}

async function seedOrg(t: ReturnType<typeof fresh>) {
  const alice = await insertUser(t, { handle: "alice" });
  const aliceCtx = asUser(t, alice);
  const orgId = await aliceCtx.mutation(api.orgs.create, { name: "Acme" });
  const runtimeId = await t.run(
    async (ctx) =>
      await ctx.db.insert("runtimes", {
        lastSeenAt: Date.now(),
        name: "ローカル",
        orgId,
        ownerUserId: alice,
        slug: "local",
        status: "online",
        tokenHash: await sha256Hex(TOKEN),
      })
  );
  return { alice, aliceCtx, orgId, runtimeId };
}

describe("runtime filesystem browse", () => {
  it("lets a permitted member request and the bridge complete a listing", async () => {
    const t = fresh();
    const { aliceCtx, runtimeId } = await seedOrg(t);
    const requestId = await aliceCtx.mutation(api.runtimeFs.request, {
      path: "",
      runtimeId,
    });
    const claimed = await t.mutation(api.runtimeFs.claimNext, {
      runtimeId,
      token: TOKEN,
    });
    expect(claimed).toMatchObject({ _id: requestId, path: "" });
    await t.mutation(api.runtimeFs.complete, {
      requestId,
      result: {
        entries: [{ kind: "dir", name: "code", path: "/Users/ada/code" }],
        gitRemoteUrl: "https://github.com/acme/web",
        homePath: "/Users/ada",
        parentPath: null,
        path: "/Users/ada",
      },
      runtimeId,
      token: TOKEN,
    });
    const row = await aliceCtx.query(api.runtimeFs.get, { requestId });
    expect(row?.status).toBe("done");
    expect(row?.result?.gitRemoteUrl).toBe("https://github.com/acme/web");
    expect(row?.result?.entries[0]?.name).toBe("code");
  });

  it("hides browse from another organization", async () => {
    const t = fresh();
    const { aliceCtx, runtimeId } = await seedOrg(t);
    const requestId = await aliceCtx.mutation(api.runtimeFs.request, {
      path: "/tmp",
      runtimeId,
    });
    const bob = await insertUser(t, { handle: "bob" });
    await asUser(t, bob).mutation(api.orgs.create, { name: "Other" });
    await expect(
      asUser(t, bob).mutation(api.runtimeFs.request, {
        path: "/stolen",
        runtimeId,
      })
    ).rejects.toThrow(/not a member/i);
    const hidden = await asUser(t, bob).query(api.runtimeFs.get, {
      requestId,
    });
    expect(hidden).toBeNull();
  });
});
