import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { sha256Hex } from "../../convex/lib/ids";
import schema from "../../convex/schema";

const modules = import.meta.glob("../../convex/**/*.*s");
const TOKEN = "th_pty_test_token_value";

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
  capabilities: string[] = ["pty", "preview"]
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

describe("workbench pty", () => {
  it("opens a session, drains input, and appends output like t3code write/output", async () => {
    const t = fresh();
    const { aliceCtx, runtimeId } = await seedOrg(t);
    const sessionId = await aliceCtx.mutation(api.workbenchPty.open, {
      cwd: "/Users/ada/code",
      runtimeId,
    });
    const claimed = await t.mutation(api.workbenchPty.claimNextOpen, {
      runtimeId,
      token: TOKEN,
    });
    expect(claimed).toMatchObject({
      _id: sessionId,
      cwd: "/Users/ada/code",
      terminalId: "term-1",
    });
    await t.mutation(api.workbenchPty.reportStarted, {
      pid: 4242,
      runtimeId,
      sessionId,
      token: TOKEN,
    });
    await aliceCtx.mutation(api.workbenchPty.write, {
      data: "ls\r",
      sessionId,
    });
    const input = await t.mutation(api.workbenchPty.takeInput, {
      runtimeId,
      sessionId,
      token: TOKEN,
    });
    expect(input).toMatchObject({ close: false, data: "ls\r" });
    await t.mutation(api.workbenchPty.appendOutput, {
      data: "README.md\n",
      runtimeId,
      sessionId,
      token: TOKEN,
    });
    const row = await aliceCtx.query(api.workbenchPty.get, { sessionId });
    expect(row).toMatchObject({
      history: "README.md\n",
      pid: 4242,
      status: "running",
    });
  });

  it("claims a starting session only once until the helper reports started", async () => {
    const t = fresh();
    const { aliceCtx, runtimeId } = await seedOrg(t);
    const sessionId = await aliceCtx.mutation(api.workbenchPty.open, {
      runtimeId,
    });
    const first = await t.mutation(api.workbenchPty.claimNextOpen, {
      runtimeId,
      token: TOKEN,
    });
    const second = await t.mutation(api.workbenchPty.claimNextOpen, {
      runtimeId,
      token: TOKEN,
    });
    expect(first?._id).toBe(sessionId);
    expect(second).toBeNull();
  });

  it("refuses an old bridge without the pty capability", async () => {
    const t = fresh();
    const { aliceCtx, runtimeId } = await seedOrg(t, ["maintenance"]);
    await expect(
      aliceCtx.mutation(api.workbenchPty.open, { runtimeId })
    ).rejects.toThrow(/ターミナルに未対応/);
  });

  it("hides another organization's terminal", async () => {
    const t = fresh();
    const { aliceCtx, runtimeId } = await seedOrg(t);
    const sessionId = await aliceCtx.mutation(api.workbenchPty.open, {
      runtimeId,
    });
    const bob = await insertUser(t, { handle: "bob" });
    await asUser(t, bob).mutation(api.orgs.create, { name: "Other" });
    const hidden = await asUser(t, bob).query(api.workbenchPty.get, {
      sessionId,
    });
    expect(hidden).toBeNull();
  });
});
