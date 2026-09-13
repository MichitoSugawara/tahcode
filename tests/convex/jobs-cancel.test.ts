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

const TOKEN = "th_job_cancel_test";

async function seedOrgWithRuntime(t: ReturnType<typeof fresh>) {
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
  return { alice, aliceCtx, chatId, orgId, projectId, runtimeId };
}

async function addMember(
  t: ReturnType<typeof fresh>,
  orgId: Id<"orgs">,
  userId: Id<"users">,
  role: "admin" | "member"
) {
  await t.run(async (ctx) => {
    await ctx.db.insert("orgMembers", {
      orgId,
      role,
      userId,
    });
  });
}

async function sendJob(
  ctx: ReturnType<ReturnType<typeof fresh>["withIdentity"]>,
  chatId: Id<"chats">
) {
  const sent = await ctx.mutation(api.messages.send, {
    body: "@codex hello",
    chatId,
  });
  if (!sent.jobId) {
    throw new Error("expected a dispatched job");
  }
  return sent.jobId;
}

describe("jobs.cancel authz", () => {
  it("lets the requester cancel a queued job", async () => {
    const t = fresh();
    const { aliceCtx, chatId } = await seedOrgWithRuntime(t);
    const jobId = await sendJob(aliceCtx, chatId);
    await aliceCtx.mutation(api.jobs.cancel, { jobId });
    const jobs = await aliceCtx.query(api.jobs.listByChat, { chatId });
    expect(jobs[0]?.status).toBe("cancelled");
    expect(jobs[0]?.canCancel).toBeTruthy();
    const listed = await aliceCtx.query(api.messages.list, {
      chatId,
      limit: 10,
    });
    const agent = listed.messages.find(
      (message) => message.authorType === "agent"
    );
    expect(agent?.status).toBe("cancelled");
    const active = await aliceCtx.query(api.jobs.activeForChat, { chatId });
    expect(active).toBeNull();
  });

  it("lets the requester cancel a running job and the bridge sees abort", async () => {
    const t = fresh();
    const { aliceCtx, chatId, runtimeId } = await seedOrgWithRuntime(t);
    const jobId = await sendJob(aliceCtx, chatId);
    const claimed = await t.mutation(api.jobs.claimNext, {
      runtimeId,
      token: TOKEN,
    });
    expect(claimed?._id).toBe(jobId);
    await expect(
      t.mutation(api.jobs.shouldAbort, {
        jobId,
        leaseId: claimed?.leaseId,
        runtimeId,
        token: TOKEN,
      })
    ).resolves.toBeFalsy();
    await aliceCtx.mutation(api.jobs.cancel, { jobId });
    await expect(
      t.mutation(api.jobs.shouldAbort, {
        jobId,
        leaseId: claimed?.leaseId,
        runtimeId,
        token: TOKEN,
      })
    ).resolves.toBeTruthy();
    await t.mutation(api.jobs.complete, {
      finalText: "should be ignored",
      jobId,
      leaseId: claimed?.leaseId,
      runtimeId,
      token: TOKEN,
    });
    const jobs = await aliceCtx.query(api.jobs.listByChat, { chatId });
    expect(jobs[0]?.status).toBe("cancelled");
  });

  it("does not claim a job that was cancelled while queued", async () => {
    const t = fresh();
    const { aliceCtx, chatId, runtimeId } = await seedOrgWithRuntime(t);
    const jobId = await sendJob(aliceCtx, chatId);
    await aliceCtx.mutation(api.jobs.cancel, { jobId });
    const claimed = await t.mutation(api.jobs.claimNext, {
      runtimeId,
      token: TOKEN,
    });
    expect(claimed).toBeNull();
  });

  it("lets an org admin cancel someone else's job", async () => {
    const t = fresh();
    const { alice, aliceCtx, chatId, orgId } = await seedOrgWithRuntime(t);
    const admin = await insertUser(t, { handle: "admin" });
    await addMember(t, orgId, admin, "admin");
    const jobId = await sendJob(aliceCtx, chatId);
    await asUser(t, admin).mutation(api.jobs.cancel, { jobId });
    const jobs = await asUser(t, alice).query(api.jobs.listByChat, { chatId });
    expect(jobs[0]?.status).toBe("cancelled");
  });

  it("lets the runtime owner cancel a job on their machine", async () => {
    const t = fresh();
    const { alice, aliceCtx, chatId, orgId, runtimeId } =
      await seedOrgWithRuntime(t);
    const bob = await insertUser(t, { handle: "bob" });
    await addMember(t, orgId, bob, "member");
    const tokenHash = await sha256Hex("th_bob_runtime");
    const bobRuntime = await t.run(async (ctx) => {
      await ctx.db.patch("runtimes", runtimeId, { status: "offline" });
      const nextRuntimeId = await ctx.db.insert("runtimes", {
        lastSeenAt: Date.now(),
        name: "bob-box",
        orgId,
        ownerUserId: bob,
        slug: "bob-box",
        status: "online",
        tokenHash,
      });
      await ctx.db.insert("runtimeGrants", {
        createdBy: bob,
        runtimeId: nextRuntimeId,
        targetType: "user",
        targetUserId: alice,
      });
      return nextRuntimeId;
    });
    const jobId = await sendJob(aliceCtx, chatId);
    const jobs = await aliceCtx.query(api.jobs.listByChat, { chatId });
    expect(jobs[0]?.runtimeId).toBe(bobRuntime);
    await asUser(t, bob).mutation(api.jobs.cancel, { jobId });
    const after = await aliceCtx.query(api.jobs.listByChat, { chatId });
    expect(after[0]?.status).toBe("cancelled");
  });

  it("lets a member cancel the job they requested", async () => {
    const t = fresh();
    const { alice, aliceCtx, chatId, orgId, runtimeId } =
      await seedOrgWithRuntime(t);
    const bob = await insertUser(t, { handle: "bob" });
    await addMember(t, orgId, bob, "member");
    await t.run(async (ctx) => {
      await ctx.db.insert("runtimeGrants", {
        createdBy: alice,
        runtimeId,
        targetType: "user",
        targetUserId: bob,
      });
    });
    const jobId = await sendJob(asUser(t, bob), chatId);
    await asUser(t, bob).mutation(api.jobs.cancel, { jobId });
    const jobs = await aliceCtx.query(api.jobs.listByChat, { chatId });
    expect(jobs[0]?.status).toBe("cancelled");
    await asUser(t, bob).mutation(api.jobs.cancel, { jobId });
  });

  it("refuses a mere member who did not request the job", async () => {
    const t = fresh();
    const { aliceCtx, chatId, orgId } = await seedOrgWithRuntime(t);
    const bob = await insertUser(t, { handle: "bob" });
    await addMember(t, orgId, bob, "member");
    const jobId = await sendJob(aliceCtx, chatId);
    await expect(
      asUser(t, bob).mutation(api.jobs.cancel, { jobId })
    ).rejects.toThrow(/中断する権限/);
    const jobs = await aliceCtx.query(api.jobs.listByChat, { chatId });
    expect(jobs[0]?.status).toBe("queued");
    expect(jobs[0]?.canCancel).toBeTruthy();
    const bobView = await asUser(t, bob).query(api.jobs.activeForChat, {
      chatId,
    });
    expect(bobView?.canCancel).toBeFalsy();
  });

  it("hides cancel from an outsider and from an unauthenticated caller", async () => {
    const t = fresh();
    const { aliceCtx, chatId } = await seedOrgWithRuntime(t);
    const jobId = await sendJob(aliceCtx, chatId);
    const eve = await insertUser(t, { handle: "eve" });
    await expect(
      asUser(t, eve).mutation(api.jobs.cancel, { jobId })
    ).rejects.toThrow(/ジョブが見つかりません/);
    await expect(t.mutation(api.jobs.cancel, { jobId })).rejects.toThrow(
      /not authenticated/i
    );
  });

  it("refuses cancel after the job has finished", async () => {
    const t = fresh();
    const { aliceCtx, chatId, runtimeId } = await seedOrgWithRuntime(t);
    const jobId = await sendJob(aliceCtx, chatId);
    const claimed = await t.mutation(api.jobs.claimNext, {
      runtimeId,
      token: TOKEN,
    });
    await t.mutation(api.jobs.complete, {
      finalText: "done",
      jobId,
      leaseId: claimed?.leaseId,
      runtimeId,
      token: TOKEN,
    });
    await expect(aliceCtx.mutation(api.jobs.cancel, { jobId })).rejects.toThrow(
      /すでに終了/
    );
  });
});
