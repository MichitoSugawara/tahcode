import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { sha256Hex } from "../../convex/lib/ids";
import schema from "../../convex/schema";

const modules = import.meta.glob("../../convex/**/*.*s");
const TOKEN = "th_sidechat_test_token_value";

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

async function seedProjectChat(t: ReturnType<typeof fresh>) {
  const alice = await insertUser(t, { handle: "alice" });
  const aliceCtx = asUser(t, alice);
  const orgId = await aliceCtx.mutation(api.orgs.create, { name: "Acme" });
  const projectId = await aliceCtx.mutation(api.projects.create, {
    name: "Public",
    orgId,
    visibility: "org",
  });
  const chatId = await aliceCtx.mutation(api.chats.createProjectChat, {
    projectId,
    title: "Room",
    visibility: "inherit",
  });
  const runtimeId = await t.run(
    async (ctx) =>
      await ctx.db.insert("runtimes", {
        lastSeenAt: Date.now(),
        name: "box",
        orgId,
        ownerUserId: alice,
        slug: "box-1",
        status: "online",
        tokenHash: await sha256Hex(TOKEN),
      })
  );
  return { alice, aliceCtx, chatId, orgId, projectId, runtimeId };
}

async function countChatMessages(
  t: ReturnType<typeof fresh>,
  chatId: Id<"chats">
) {
  return await t.run(async (ctx) => {
    const rows = await ctx.db
      .query("messages")
      .withIndex("by_chat", (q) => q.eq("chatId", chatId))
      .take(50);
    return rows.length;
  });
}

async function countChatJobs(t: ReturnType<typeof fresh>, chatId: Id<"chats">) {
  return await t.run(async (ctx) => {
    const rows = await ctx.db
      .query("jobs")
      .withIndex("by_chat", (q) => q.eq("chatId", chatId))
      .take(50);
    return rows.length;
  });
}

async function mainPipelineCounts(
  t: ReturnType<typeof fresh>,
  chatId: Id<"chats">
) {
  return {
    jobs: await countChatJobs(t, chatId),
    messages: await countChatMessages(t, chatId),
  };
}

describe("workbench side chat", () => {
  it("stores a turn on the parent chat without touching messages or jobs", async () => {
    const t = fresh();
    const { alice, aliceCtx, chatId } = await seedProjectChat(t);
    const sent = await aliceCtx.mutation(api.workbenchSideChat.send, {
      body: "  検証メモ  ",
      chatId,
    });
    expect(sent).toMatchObject({ dispatched: false });
    const page = await aliceCtx.query(api.workbenchSideChat.list, { chatId });
    expect(page).toMatchObject({
      chatId,
      turns: [
        {
          authorHandle: "alice",
          authorId: alice,
          body: "検証メモ",
        },
      ],
    });
    await expect(mainPipelineCounts(t, chatId)).resolves.toStrictEqual({
      jobs: 0,
      messages: 0,
    });
  });

  it("does not launch a mention job even when the body would on the main chat", async () => {
    const t = fresh();
    const { aliceCtx, chatId } = await seedProjectChat(t);
    const mention = "@codex hello";
    const side = await aliceCtx.mutation(api.workbenchSideChat.send, {
      body: mention,
      chatId,
    });
    const page = await aliceCtx.query(api.workbenchSideChat.list, { chatId });
    expect({
      dispatched: side.dispatched,
      sideBodies: page?.turns.map((turn) => turn.body),
    }).toStrictEqual({ dispatched: false, sideBodies: [mention] });
    await expect(mainPipelineCounts(t, chatId)).resolves.toStrictEqual({
      jobs: 0,
      messages: 0,
    });

    const main = await aliceCtx.mutation(api.messages.send, {
      body: mention,
      chatId,
    });
    expect(main.dispatched && Boolean(main.jobId)).toBeTruthy();
    await expect(mainPipelineCounts(t, chatId)).resolves.toMatchObject({
      jobs: 1,
    });
  });

  it("hides another organization's side chat and refuses writes", async () => {
    const t = fresh();
    const { aliceCtx, chatId } = await seedProjectChat(t);
    await aliceCtx.mutation(api.workbenchSideChat.send, {
      body: "secret",
      chatId,
    });
    const bob = await insertUser(t, { handle: "bob" });
    await asUser(t, bob).mutation(api.orgs.create, { name: "Other" });
    const hidden = await asUser(t, bob).query(api.workbenchSideChat.list, {
      chatId,
    });
    expect(hidden).toBeNull();
    await expect(
      asUser(t, bob).mutation(api.workbenchSideChat.send, {
        body: "nope",
        chatId,
      })
    ).rejects.toThrow(/Not a member of this organization/);
  });

  it("hides another member's owner-only thread", async () => {
    const t = fresh();
    const { aliceCtx, orgId } = await seedProjectChat(t);
    const threadId = await aliceCtx.mutation(api.chats.createThreadChat, {
      orgId,
      title: "秘密",
    });
    await aliceCtx.mutation(api.workbenchSideChat.send, {
      body: "thread note",
      chatId: threadId,
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
      bobCtx.query(api.workbenchSideChat.list, { chatId: threadId })
    ).resolves.toBeNull();
    await expect(
      bobCtx.mutation(api.workbenchSideChat.send, {
        body: "intrude",
        chatId: threadId,
      })
    ).rejects.toThrow(/owner-only/i);
  });

  it("lets org members share a visible project chat thread", async () => {
    const t = fresh();
    const { aliceCtx, chatId, orgId } = await seedProjectChat(t);
    await aliceCtx.mutation(api.workbenchSideChat.send, {
      body: "shared",
      chatId,
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
    const page = await bobCtx.query(api.workbenchSideChat.list, { chatId });
    expect(page?.turns.map((turn) => turn.body)).toStrictEqual(["shared"]);
    const sent = await bobCtx.mutation(api.workbenchSideChat.send, {
      body: "ack",
      chatId,
    });
    expect(sent.dispatched).toBeFalsy();
    const next = await aliceCtx.query(api.workbenchSideChat.list, { chatId });
    expect(next?.turns.map((turn) => turn.body)).toStrictEqual([
      "shared",
      "ack",
    ]);
  });

  it("migrates leftover local drafts without dispatching jobs", async () => {
    const t = fresh();
    const { aliceCtx, chatId } = await seedProjectChat(t);
    const migrated = await aliceCtx.mutation(
      api.workbenchSideChat.migrateLocalDrafts,
      {
        bodies: ["  旧下書き  ", "   ", "@codex also leftover"],
        chatId,
      }
    );
    expect(migrated).toMatchObject({ dispatched: false, inserted: 2 });
    const page = await aliceCtx.query(api.workbenchSideChat.list, { chatId });
    expect(page?.turns.map((turn) => turn.body)).toStrictEqual([
      "旧下書き",
      "@codex also leftover",
    ]);
    await expect(mainPipelineCounts(t, chatId)).resolves.toStrictEqual({
      jobs: 0,
      messages: 0,
    });
  });

  it("drops side turns when the parent chat is deleted", async () => {
    const t = fresh();
    const { aliceCtx, orgId } = await seedProjectChat(t);
    const threadId = await aliceCtx.mutation(api.chats.createThreadChat, {
      orgId,
      title: "捨てる",
    });
    await aliceCtx.mutation(api.workbenchSideChat.send, {
      body: "gone",
      chatId: threadId,
    });
    await aliceCtx.mutation(api.chats.remove, { chatId: threadId });
    const leftover = await t.run(async (ctx) => {
      const rows = await ctx.db
        .query("sideChatTurns")
        .withIndex("by_chat", (q) => q.eq("chatId", threadId))
        .take(10);
      return rows.length;
    });
    expect(leftover).toBe(0);
  });
});
