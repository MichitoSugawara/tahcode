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

const TOKEN = "th_job_lease_compat_test";

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
    body: "@codex hello",
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
    leaseId: claimed.leaseId,
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

describe("jobs lease backward compat (tahcode@0.1.0)", () => {
  it("appends stream text when the published CLI omits leaseId", async () => {
    const t = fresh();
    const seed = await seedClaimedJob(t);
    await t.mutation(api.jobs.appendEvent, {
      jobId: seed.jobId,
      runtimeId: seed.runtimeId,
      text: "hello from 0.1.0",
      token: TOKEN,
      type: "text",
    });
    const agent = await agentBody(seed.aliceCtx, seed.chatId);
    expect(agent?.body).toContain("hello from 0.1.0");
    expect(agent?.status).toBe("streaming");
  });

  it("completes a job when the published CLI omits leaseId", async () => {
    const t = fresh();
    const seed = await seedClaimedJob(t);
    await t.mutation(api.jobs.complete, {
      finalText: "done without lease",
      jobId: seed.jobId,
      runtimeId: seed.runtimeId,
      token: TOKEN,
    });
    const jobs = await seed.aliceCtx.query(api.jobs.listByChat, {
      chatId: seed.chatId,
    });
    expect(jobs[0]?.status).toBe("done");
    const agent = await agentBody(seed.aliceCtx, seed.chatId);
    expect(agent?.body).toBe("done without lease");
    expect(agent?.status).toBe("done");
  });

  it("still rejects a provided but mismatched leaseId", async () => {
    const t = fresh();
    const seed = await seedClaimedJob(t);
    await expect(
      t.mutation(api.jobs.appendEvent, {
        jobId: seed.jobId,
        leaseId: "not-the-lease",
        runtimeId: seed.runtimeId,
        text: "should not land",
        token: TOKEN,
        type: "text",
      })
    ).rejects.toThrow(/lease expired/i);
    await expect(
      t.mutation(api.jobs.complete, {
        finalText: "should not complete",
        jobId: seed.jobId,
        leaseId: "not-the-lease",
        runtimeId: seed.runtimeId,
        token: TOKEN,
      })
    ).rejects.toThrow(/lease expired/i);
    const agent = await agentBody(seed.aliceCtx, seed.chatId);
    expect(agent?.body).not.toContain("should not land");
    const jobs = await seed.aliceCtx.query(api.jobs.listByChat, {
      chatId: seed.chatId,
    });
    expect(jobs[0]?.status).toBe("running");
  });
});
