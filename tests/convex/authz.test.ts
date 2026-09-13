import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { api, internal } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import schema from "../../convex/schema";

const modules = import.meta.glob("../../convex/**/*.*s");

function fresh() {
  return convexTest(schema, modules);
}

async function insertUser(
  t: ReturnType<typeof fresh>,
  fields: {
    email?: string;
    emailVerificationTime?: number;
    handle: string;
    name?: string;
  }
) {
  return await t.run(
    async (ctx) =>
      await ctx.db.insert("users", {
        email: fields.email,
        emailVerificationTime: fields.emailVerificationTime,
        handle: fields.handle,
        name: fields.name ?? fields.handle,
      })
  );
}

function asUser(t: ReturnType<typeof fresh>, userId: Id<"users">) {
  return t.withIdentity({ subject: `${userId}|test-session` });
}

async function seedOrgChat(t: ReturnType<typeof fresh>) {
  const alice = await insertUser(t, {
    email: "alice@example.com",
    emailVerificationTime: 1,
    handle: "alice",
  });
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
  return { alice, aliceCtx, chatId, orgId, projectId };
}

describe("authz denials", () => {
  it("blocks chat creation on a private project the caller cannot see", async () => {
    const t = fresh();
    const { aliceCtx, orgId } = await seedOrgChat(t);
    const secretId = await aliceCtx.mutation(api.projects.create, {
      name: "Secret",
      orgId,
      visibility: "private",
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
      asUser(t, bob).mutation(api.chats.createProjectChat, {
        projectId: secretId,
        title: "Nope",
        visibility: "inherit",
      })
    ).rejects.toThrow(/cannot see this project/i);

    const admin = await insertUser(t, { handle: "orgadmin" });
    await t.run(async (ctx) => {
      await ctx.db.insert("orgMembers", {
        orgId,
        role: "admin",
        userId: admin,
      });
    });
    const chatId = await asUser(t, admin).mutation(
      api.chats.createProjectChat,
      {
        projectId: secretId,
        title: "Admin room",
        visibility: "inherit",
      }
    );
    expect(chatId).toBeTruthy();
  });

  it("rejects memberIds that are not in the org", async () => {
    const t = fresh();
    const { aliceCtx, projectId } = await seedOrgChat(t);
    const outsider = await insertUser(t, { handle: "outsider" });
    await expect(
      aliceCtx.mutation(api.chats.createProjectChat, {
        memberIds: [outsider],
        projectId,
        title: "Leak",
        visibility: "inherit",
      })
    ).rejects.toThrow(/must belong to this organization/i);
  });

  it("rejects addMember for a user from another org", async () => {
    const t = fresh();
    const { aliceCtx, chatId } = await seedOrgChat(t);
    const outsider = await insertUser(t, { handle: "outsider2" });
    await expect(
      aliceCtx.mutation(api.chats.addMember, {
        chatId,
        userId: outsider,
      })
    ).rejects.toThrow(/not in this organization/i);
  });

  it("rejects file metadata for a forged key or the wrong org", async () => {
    const t = fresh();
    const { aliceCtx, chatId, orgId } = await seedOrgChat(t);
    await expect(
      aliceCtx.mutation(api.files.record, {
        chatId,
        contentType: "text/plain",
        key: "forged-key",
        name: "x.txt",
        orgId,
        size: 4,
      })
    ).rejects.toThrow(/unauthorized file key/i);

    const orgB = await aliceCtx.mutation(api.orgs.create, { name: "Beta" });
    await expect(
      aliceCtx.mutation(api.files.record, {
        chatId,
        contentType: "text/plain",
        key: "forged-key",
        name: "x.txt",
        orgId: orgB,
        size: 4,
      })
    ).rejects.toThrow(/does not belong to this organization/i);
  });

  it("records a file only after the upload ticket is consumed", async () => {
    const t = fresh();
    const { aliceCtx, chatId, orgId } = await seedOrgChat(t);
    const prepared = await aliceCtx.mutation(api.files.prepareUpload, {
      chatId,
      contentType: "text/plain",
      name: "note.txt",
      orgId,
      size: 4,
    });
    await expect(
      aliceCtx.mutation(api.files.record, {
        chatId,
        contentType: "text/plain",
        key: prepared.key,
        name: "note.txt",
        orgId,
        size: 4,
      })
    ).rejects.toThrow(/unauthorized file key/i);
    await t.mutation(internal.files.consumeUploadTicket, {
      ticket: prepared.ticket,
    });
    const fileId = await aliceCtx.mutation(api.files.record, {
      chatId,
      contentType: "text/plain",
      key: prepared.key,
      name: "note.txt",
      orgId,
      size: 4,
    });
    expect(fileId).toBeTruthy();
  });

  it("requires a verified email to accept an email invite", async () => {
    const t = fresh();
    const { aliceCtx, orgId } = await seedOrgChat(t);
    const { token } = await aliceCtx.mutation(api.orgs.createInvite, {
      email: "invitee@example.com",
      orgId,
      role: "member",
    });
    const invitee = await insertUser(t, {
      email: "invitee@example.com",
      handle: "invitee",
    });
    await expect(
      asUser(t, invitee).mutation(api.orgs.acceptInvite, { token })
    ).rejects.toThrow(/verify your email/i);
  });

  it("hides messages from outsiders and from non-members of a private chat", async () => {
    const t = fresh();
    const { aliceCtx, chatId, projectId } = await seedOrgChat(t);
    const outsider = await insertUser(t, { handle: "eve" });
    await expect(
      asUser(t, outsider).query(api.messages.list, { chatId, limit: 10 })
    ).rejects.toThrow(/not a member of this organization/i);
    await expect(
      t.query(api.messages.list, { chatId, limit: 10 })
    ).rejects.toThrow(/not authenticated/i);

    const bob = await insertUser(t, { handle: "bob2" });
    const privateChat = await aliceCtx.mutation(api.chats.createProjectChat, {
      projectId,
      title: "Private",
      visibility: "private",
    });
    await t.run(async (ctx) => {
      const chat = await ctx.db.get("chats", privateChat);
      if (!chat) {
        throw new Error("missing chat");
      }
      await ctx.db.insert("orgMembers", {
        orgId: chat.orgId,
        role: "member",
        userId: bob,
      });
    });
    await expect(
      asUser(t, bob).query(api.messages.list, {
        chatId: privateChat,
        limit: 10,
      })
    ).rejects.toThrow(/private/i);
  });
});
