import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { sha256Hex } from "../../convex/lib/ids";
import schema from "../../convex/schema";

const modules = import.meta.glob("../../convex/**/*.*s");
const TOKEN = "th_preview_test_token_value";

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
        capabilities: ["preview"],
        lastSeenAt: Date.now(),
        name: "ローカル",
        orgId,
        ownerUserId: alice,
        slug: "local",
        status: "online",
        tokenHash: await sha256Hex(TOKEN),
      })
  );
  return { aliceCtx, runtimeId };
}

describe("workbench preview", () => {
  it("navigates a URL and stores the machine-fetched snapshot", async () => {
    const t = fresh();
    const { aliceCtx, runtimeId } = await seedOrg(t);
    const sessionId = await aliceCtx.mutation(api.workbenchPreview.open, {
      runtimeId,
    });
    await aliceCtx.mutation(api.workbenchPreview.navigate, {
      sessionId,
      url: "http://localhost:3000",
    });
    const claimed = await t.mutation(api.workbenchPreview.claimNext, {
      runtimeId,
      token: TOKEN,
    });
    expect(claimed).toMatchObject({
      _id: sessionId,
      url: "http://localhost:3000/",
    });
    await t.mutation(api.workbenchPreview.complete, {
      body: "<html><title>App</title></html>",
      contentType: "text/html",
      httpStatus: 200,
      requestId: sessionId,
      runtimeId,
      title: "App",
      token: TOKEN,
      url: "http://localhost:3000/",
    });
    const row = await aliceCtx.query(api.workbenchPreview.get, { sessionId });
    expect(row).toMatchObject({
      contentType: "text/html",
      status: "success",
      title: "App",
      url: "http://localhost:3000/",
    });
    expect(row?.body).toContain("<title>App</title>");
  });

  it("rejects an unsupported protocol before the bridge sees it", async () => {
    const t = fresh();
    const { aliceCtx, runtimeId } = await seedOrg(t);
    const sessionId = await aliceCtx.mutation(api.workbenchPreview.open, {
      runtimeId,
    });
    await expect(
      aliceCtx.mutation(api.workbenchPreview.navigate, {
        sessionId,
        url: "file:///etc/passwd",
      })
    ).rejects.toThrow(/http/);
  });
});
