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

async function seedOrg(t: ReturnType<typeof fresh>) {
  const alice = await insertUser(t, { handle: "alice" });
  const aliceCtx = asUser(t, alice);
  const orgId = await aliceCtx.mutation(api.orgs.create, { name: "Acme" });
  return { alice, aliceCtx, orgId };
}

describe("chat and project lifecycle (TAH-77)", () => {
  it("renames a thread and refuses to rename Personal DM", async () => {
    const t = fresh();
    const { aliceCtx, orgId } = await seedOrg(t);
    const dmId = await aliceCtx.mutation(api.chats.ensureDm, { orgId });
    const threadId = await aliceCtx.mutation(api.chats.createThreadChat, {
      orgId,
      title: "下書き",
    });
    await aliceCtx.mutation(api.chats.rename, {
      chatId: threadId,
      title: "  改名後  ",
    });
    const thread = await aliceCtx.query(api.chats.get, { chatId: threadId });
    expect(thread?.title).toBe("改名後");
    await expect(
      aliceCtx.mutation(api.chats.rename, { chatId: dmId, title: "Nope" })
    ).rejects.toThrow("Personal DMs cannot be renamed");
  });

  it("deletes a thread and keeps Personal DM", async () => {
    const t = fresh();
    const { aliceCtx, orgId } = await seedOrg(t);
    const dmId = await aliceCtx.mutation(api.chats.ensureDm, { orgId });
    const threadId = await aliceCtx.mutation(api.chats.createThreadChat, {
      orgId,
      title: "捨てる",
    });
    await aliceCtx.mutation(api.chats.remove, { chatId: threadId });
    await expect(
      aliceCtx.query(api.chats.get, { chatId: threadId })
    ).resolves.toBeNull();
    await expect(
      aliceCtx.query(api.chats.get, { chatId: dmId })
    ).resolves.toMatchObject({
      kind: "dm",
    });
    await expect(
      aliceCtx.mutation(api.chats.remove, { chatId: dmId })
    ).rejects.toThrow("Personal DMs cannot be deleted");
  });

  it("updates a project and deletes it with its chats", async () => {
    const t = fresh();
    const { aliceCtx, orgId } = await seedOrg(t);
    const projectId = await aliceCtx.mutation(api.projects.create, {
      name: "Alpha",
      orgId,
      visibility: "org",
    });
    const chatId = await aliceCtx.mutation(api.chats.createProjectChat, {
      projectId,
      title: "General",
      visibility: "inherit",
    });
    await aliceCtx.mutation(api.projects.update, {
      name: "Beta",
      projectId,
      repoUrl: "https://github.com/acme/web",
      visibility: "private",
    });
    const updated = await aliceCtx.query(api.projects.get, { projectId });
    expect(updated).toMatchObject({
      name: "Beta",
      repoUrl: "https://github.com/acme/web",
      visibility: "private",
    });
    await aliceCtx.mutation(api.projects.remove, { projectId });
    await expect(
      aliceCtx.query(api.projects.get, { projectId })
    ).resolves.toBeNull();
    await expect(aliceCtx.query(api.chats.get, { chatId })).resolves.toBeNull();
  });

  it("hides delete from another member who did not create the project", async () => {
    const t = fresh();
    const { aliceCtx, orgId } = await seedOrg(t);
    const projectId = await aliceCtx.mutation(api.projects.create, {
      name: "Shared",
      orgId,
      visibility: "org",
    });
    const bob = await insertUser(t, { handle: "bob" });
    await t.run(async (ctx) => {
      await ctx.db.insert("orgMembers", {
        orgId,
        role: "member",
        userId: bob,
      });
    });
    await expect(
      asUser(t, bob).mutation(api.projects.remove, { projectId })
    ).rejects.toThrow("Only the creator or an admin can delete this project");
  });
});
