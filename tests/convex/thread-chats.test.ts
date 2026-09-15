import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import schema from "../../convex/schema";

const modules = import.meta.glob("../../convex/**/*.*s");

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

describe("no-project thread chats (TAH-75)", () => {
  it("creates a fresh thread without reusing Personal DM", async () => {
    const t = fresh();
    const alice = await insertUser(t, { handle: "alice" });
    const aliceCtx = asUser(t, alice);
    const orgId = await aliceCtx.mutation(api.orgs.create, { name: "Acme" });
    const dmId = await aliceCtx.mutation(api.chats.ensureDm, { orgId });
    const first = await aliceCtx.mutation(api.chats.createThreadChat, {
      orgId,
      title: "こんに血は",
    });
    const second = await aliceCtx.mutation(api.chats.createThreadChat, {
      orgId,
      title: "続き",
    });
    expect(first).not.toBe(dmId);
    expect(second).not.toBe(dmId);
    expect(second).not.toBe(first);
    const listed = await aliceCtx.query(api.chats.list, { orgId });
    const kinds = listed.map((chat) => ({
      id: chat._id,
      kind: chat.kind,
      title: chat.title,
    }));
    expect(kinds).toStrictEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: dmId, kind: "dm" }),
        expect.objectContaining({
          id: first,
          kind: "thread",
          title: "こんに血は",
        }),
        expect.objectContaining({ id: second, kind: "thread", title: "続き" }),
      ])
    );
  });

  it("hides another member's thread", async () => {
    const t = fresh();
    const alice = await insertUser(t, { handle: "alice" });
    const aliceCtx = asUser(t, alice);
    const orgId = await aliceCtx.mutation(api.orgs.create, { name: "Acme" });
    const threadId = await aliceCtx.mutation(api.chats.createThreadChat, {
      orgId,
      title: "秘密",
    });
    const bob = await insertUser(t, { handle: "bob" });
    await t.run(async (ctx) => {
      await ctx.db.insert("orgMembers", {
        orgId,
        role: "member",
        userId: bob,
      });
    });
    const bobCtx = asUser(t, bob);
    await expect(
      bobCtx.query(api.chats.get, { chatId: threadId })
    ).resolves.toBeNull();
    const listed = await bobCtx.query(api.chats.list, { orgId });
    expect(listed.some((chat) => chat._id === threadId)).toBeFalsy();
  });
});
