import { convexTest } from "convex-test";
import { describe, expect, it, vi } from "vitest";

import { api, internal } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { sha256Hex } from "../../convex/lib/ids";
import schema from "../../convex/schema";
import {
  QUEUED_CLAIM_TIMEOUT_MS,
  unclaimedJobError,
} from "../../shared/runtimeHealth.ts";

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

const TOKEN = "th_job_unclaimed_test";

async function seedQueuedJob(t: ReturnType<typeof fresh>) {
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
        name: "mac-0914",
        orgId,
        ownerUserId: alice,
        slug: "mac-0914",
        status: "online",
        tokenHash,
      })
  );
  const sent = await aliceCtx.mutation(api.messages.send, {
    body: "@cursor hello @linear",
    chatId,
  });
  if (!sent.jobId) {
    throw new Error("expected a dispatched job");
  }
  return { aliceCtx, chatId, jobId: sent.jobId, runtimeId };
}

async function agentMessage(
  ctx: ReturnType<ReturnType<typeof fresh>["withIdentity"]>,
  chatId: Id<"chats">
) {
  const listed = await ctx.query(api.messages.list, { chatId, limit: 10 });
  return listed.messages.find((message) => message.authorType === "agent");
}

describe("unclaimed queued jobs", () => {
  it("fails a queued job when the claim timeout fires", async () => {
    const t = fresh();
    const { aliceCtx, chatId, jobId } = await seedQueuedJob(t);
    await t.mutation(internal.jobs.failIfUnclaimed, { jobId });
    const jobs = await aliceCtx.query(api.jobs.listByChat, { chatId });
    expect(jobs[0]?.status).toBe("failed");
    expect(jobs[0]?.error).toBe(unclaimedJobError("mac-0914"));
    const agent = await agentMessage(aliceCtx, chatId);
    expect(agent?.status).toBe("error");
    expect(agent?.body).toContain("mac-0914");
    expect(agent?.body).not.toMatch(
      /OpenConnector|OOMOL|workers\.dev|gateway/i
    );
  });

  it("does not fail a job that the runtime already claimed", async () => {
    const t = fresh();
    const { aliceCtx, chatId, jobId, runtimeId } = await seedQueuedJob(t);
    const claimed = await t.mutation(api.jobs.claimNext, {
      runtimeId,
      token: TOKEN,
    });
    expect(claimed?._id).toBe(jobId);
    await t.mutation(internal.jobs.failIfUnclaimed, { jobId });
    const jobs = await aliceCtx.query(api.jobs.listByChat, { chatId });
    expect(jobs[0]?.status).toBe("running");
  });

  it("sweeps a queued job after the claim window", async () => {
    vi.useFakeTimers();
    try {
      const t = fresh();
      const { aliceCtx, chatId } = await seedQueuedJob(t);
      await expect(
        t.mutation(internal.jobs.failUnclaimedSweep, {})
      ).resolves.toBe(0);
      vi.advanceTimersByTime(QUEUED_CLAIM_TIMEOUT_MS);
      await expect(
        t.mutation(internal.jobs.failUnclaimedSweep, {})
      ).resolves.toBe(1);
      const jobs = await aliceCtx.query(api.jobs.listByChat, { chatId });
      expect(jobs[0]?.status).toBe("failed");
    } finally {
      vi.useRealTimers();
    }
  });

  it("runs the scheduled failIfUnclaimed after the claim window", async () => {
    vi.useFakeTimers();
    try {
      const t = fresh();
      const { aliceCtx, chatId } = await seedQueuedJob(t);
      await t.finishAllScheduledFunctions(vi.runAllTimers);
      const jobs = await aliceCtx.query(api.jobs.listByChat, { chatId });
      expect(jobs[0]?.status).toBe("failed");
      expect(jobs[0]?.error).toContain("受け取りませんでした");
    } finally {
      vi.useRealTimers();
    }
  });
});
