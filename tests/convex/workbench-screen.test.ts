import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { sha256Hex } from "../../convex/lib/ids";
import schema from "../../convex/schema";

const modules = import.meta.glob("../../convex/**/*.*s");
const TOKEN = "th_screen_test_token_value";

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

async function seedOrg(
  t: ReturnType<typeof fresh>,
  capabilities: string[] = ["screen"]
) {
  const alice = await insertUser(t, { handle: "alice" });
  const aliceCtx = asUser(t, alice);
  const orgId = await aliceCtx.mutation(api.orgs.create, { name: "Acme" });
  const runtimeId = await t.run(
    async (ctx) =>
      await ctx.db.insert("runtimes", {
        capabilities,
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

describe("workbench screen", () => {
  it("opens, claims, and stores a real frame URL — never a fake connected flag", async () => {
    const t = fresh();
    const { aliceCtx, runtimeId } = await seedOrg(t);
    const sessionId = await aliceCtx.mutation(api.workbenchScreen.open, {
      runtimeId,
    });
    const empty = await aliceCtx.query(api.workbenchScreen.get, { sessionId });
    const claimed = await t.mutation(api.workbenchScreen.claimNext, {
      runtimeId,
      token: TOKEN,
    });
    const again = await t.mutation(api.workbenchScreen.claimNext, {
      runtimeId,
      token: TOKEN,
    });
    expect({
      again,
      claimedId: claimed?._id,
      connectedField: empty ? "connected" in empty : true,
      frameUrl: empty?.frameUrl,
      status: empty?.status,
    }).toStrictEqual({
      again: null,
      claimedId: sessionId,
      connectedField: false,
      frameUrl: null,
      status: "watching",
    });

    const storageId = await t.run(async (ctx) => {
      const blob = new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])], {
        type: "image/jpeg",
      });
      return await ctx.storage.store(blob);
    });
    await t.mutation(api.workbenchScreen.reportFrame, {
      bytes: 4,
      contentType: "image/jpeg",
      runtimeId,
      sessionId,
      storageId,
      token: TOKEN,
      width: 1280,
    });
    const row = await aliceCtx.query(api.workbenchScreen.get, { sessionId });
    expect({
      contentType: row?.contentType,
      hasUrl: Boolean(row?.frameUrl && row.frameUrl.length > 0),
      status: row?.status,
      width: row?.width,
    }).toStrictEqual({
      contentType: "image/jpeg",
      hasUrl: true,
      status: "watching",
      width: 1280,
    });
  });

  it("refuses an old bridge without the screen capability", async () => {
    const t = fresh();
    const { aliceCtx, runtimeId } = await seedOrg(t, ["pty", "preview"]);
    await expect(
      aliceCtx.mutation(api.workbenchScreen.open, { runtimeId })
    ).rejects.toThrow(/画面フレームに未対応/);
  });

  it("hides another organization's screen session", async () => {
    const t = fresh();
    const { aliceCtx, runtimeId } = await seedOrg(t);
    const sessionId = await aliceCtx.mutation(api.workbenchScreen.open, {
      runtimeId,
    });
    const bob = await insertUser(t, { handle: "bob" });
    await asUser(t, bob).mutation(api.orgs.create, { name: "Other" });
    const hidden = await asUser(t, bob).query(api.workbenchScreen.get, {
      sessionId,
    });
    expect(hidden).toBeNull();
  });

  it("keeps the last frame when capture fails and does not invent a URL", async () => {
    const t = fresh();
    const { aliceCtx, runtimeId } = await seedOrg(t);
    const sessionId = await aliceCtx.mutation(api.workbenchScreen.open, {
      runtimeId,
    });
    await t.mutation(api.workbenchScreen.reportError, {
      error: "ディスプレイがありません。",
      fatal: true,
      runtimeId,
      sessionId,
      token: TOKEN,
    });
    const row = await aliceCtx.query(api.workbenchScreen.get, { sessionId });
    expect(row).toMatchObject({
      error: "ディスプレイがありません。",
      frameUrl: null,
      status: "error",
    });
  });

  it("rejects a non-image content type before storing a frame", async () => {
    const t = fresh();
    const { aliceCtx, runtimeId } = await seedOrg(t);
    const sessionId = await aliceCtx.mutation(api.workbenchScreen.open, {
      runtimeId,
    });
    const storageId = await t.run(async (ctx) => {
      const blob = new Blob([new Uint8Array([1, 2, 3])], {
        type: "text/plain",
      });
      return await ctx.storage.store(blob);
    });
    await expect(
      t.mutation(api.workbenchScreen.reportFrame, {
        bytes: 3,
        contentType: "text/plain",
        runtimeId,
        sessionId,
        storageId,
        token: TOKEN,
      })
    ).rejects.toThrow(/Unsupported screen frame type/);
  });
});
