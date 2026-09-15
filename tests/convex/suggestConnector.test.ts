import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { sha256Hex } from "../../convex/lib/ids";
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

describe("messages.suggestConnector", () => {
  it("posts a Linear org card on a visible chat", async () => {
    const t = fresh();
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
    const posted = await aliceCtx.mutation(api.messages.suggestConnector, {
      chatId,
    });
    expect(posted).toMatchObject({
      provider: "linear",
      scope: "org",
    });
    const page = await aliceCtx.query(api.messages.list, {
      chatId,
      limit: 20,
    });
    const card = page.messages.find(
      (message) => message._id === posted.messageId
    );
    expect(card).toMatchObject({
      attachments: [{ kind: "connector", provider: "linear", scope: "org" }],
      authorType: "system",
      body: expect.stringContaining("Linear"),
    });
    expect(JSON.stringify(card)).not.toMatch(
      /OpenConnector|OOMOL|workers\.dev/i
    );
  });

  it("rejects an outsider and an unknown provider", async () => {
    const t = fresh();
    const alice = await insertUser(t, { handle: "alice" });
    const bob = await insertUser(t, { handle: "bob" });
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
    await expect(
      asUser(t, bob).mutation(api.messages.suggestConnector, { chatId })
    ).rejects.toThrow(/not a member of this organization/i);
    const github = await aliceCtx.mutation(api.messages.suggestConnector, {
      chatId,
      provider: "github",
    });
    expect(github).toMatchObject({ provider: "github", scope: "org" });
    await expect(
      aliceCtx.mutation(api.messages.suggestConnector, {
        chatId,
        provider: "slack",
      })
    ).rejects.toThrow(/unknown connector/i);
  });
});

describe("suggest_connector agent tool", () => {
  it("posts the same attachment from a running job", async () => {
    const t = fresh();
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
    const token = "th_suggest_connector";
    const runtimeId = await t.run(
      async (ctx) =>
        await ctx.db.insert("runtimes", {
          lastSeenAt: Date.now(),
          name: "box",
          orgId,
          ownerUserId: alice,
          slug: "box-1",
          status: "online",
          tokenHash: await sha256Hex(token),
        })
    );
    await aliceCtx.mutation(api.messages.send, {
      body: "@codex hello",
      chatId,
    });
    const claimed = await t.mutation(api.jobs.claimNext, {
      runtimeId,
      token,
    });
    if (!claimed) {
      throw new Error("expected a claimed job");
    }
    const result = await t.mutation(api.agentTools.invoke, {
      argsJson: JSON.stringify({ scope: "org" }),
      jobId: claimed._id,
      leaseId: claimed.leaseId,
      name: "suggest_connector",
      runtimeId,
      token,
    });
    const parsed = JSON.parse(result.resultJson) as {
      provider: string;
      scope: string;
    };
    expect(parsed).toMatchObject({ provider: "linear", scope: "org" });
    const page = await aliceCtx.query(api.messages.list, {
      chatId,
      limit: 20,
    });
    expect(
      page.messages.some((message) =>
        message.attachments?.some(
          (attachment) =>
            attachment.kind === "connector" && attachment.provider === "linear"
        )
      )
    ).toBeTruthy();
  });
});
