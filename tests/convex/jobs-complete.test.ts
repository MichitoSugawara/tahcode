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

const TOKEN = "th_job_complete_body_test";

async function seedClaimedJob(t: ReturnType<typeof fresh>) {
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
  const tokenHash = await sha256Hex(TOKEN);
  const runtimeId = await t.run(
    async (ctx) =>
      await ctx.db.insert("runtimes", {
        lastSeenAt: Date.now(),
        name: "box",
        orgId,
        ownerUserId: alice,
        slug: "box-1",
        status: "online",
        tokenHash,
      })
  );
  const sent = await aliceCtx.mutation(api.messages.send, {
    body: "@cursor hello",
    chatId,
  });
  if (!sent.jobId) {
    throw new Error("expected a dispatched job");
  }
  const claimed = await t.mutation(api.jobs.claimNext, {
    runtimeId,
    token: TOKEN,
  });
  if (!claimed) {
    throw new Error("expected a claimed job");
  }
  return {
    aliceCtx,
    chatId,
    jobId: sent.jobId,
    runtimeId,
  };
}

async function agentBody(
  ctx: ReturnType<ReturnType<typeof fresh>["withIdentity"]>,
  chatId: Id<"chats">
) {
  const listed = await ctx.query(api.messages.list, { chatId, limit: 10 });
  return listed.messages.find((message) => message.authorType === "agent");
}

describe("jobs.complete message body", () => {
  it("replaces streamed text with finalText instead of concatenating", async () => {
    const t = fresh();
    const seed = await seedClaimedJob(t);
    const greeting = "こんにちは！今日はどんなお手伝いをしましょうか？";
    await t.mutation(api.jobs.appendEvent, {
      jobId: seed.jobId,
      runtimeId: seed.runtimeId,
      text: `${greeting}\n`,
      token: TOKEN,
      type: "text",
    });
    const finalText = `${greeting}\n\n_Cursor · auto · 15.4s · /Users/me/.local/bin/agent_`;
    await t.mutation(api.jobs.complete, {
      finalText,
      jobId: seed.jobId,
      runtimeId: seed.runtimeId,
      token: TOKEN,
    });
    const agent = await agentBody(seed.aliceCtx, seed.chatId);
    expect(agent?.body).toBe(finalText);
    expect(agent?.body.split(greeting)).toHaveLength(2);
    expect(agent?.status).toBe("done");
  });

  it("keeps thinking / MCP attach notes off the assistant body (TAH-76)", async () => {
    const t = fresh();
    const seed = await seedClaimedJob(t);
    await t.mutation(api.jobs.appendEvent, {
      jobId: seed.jobId,
      runtimeId: seed.runtimeId,
      text: "tahcode ops MCP attached (--mcp-config). connectors: 1 listed, 0 injected.",
      token: TOKEN,
      type: "thinking",
    });
    const agent = await agentBody(seed.aliceCtx, seed.chatId);
    expect(agent?.body).toBe("");
    expect(agent?.body).not.toContain("tahcode ops MCP attached");
  });
});
