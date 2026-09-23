import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { sha256Hex } from "../../convex/lib/ids";
import schema from "../../convex/schema";
import { HITL_PENDING_RESULT } from "../../shared/toolApprovals.ts";

const modules = import.meta.glob("../../convex/**/*.*s");
const TOKEN = "th_hitl_test_token_value";

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
        slug: "box-hitl",
        status: "online",
        tokenHash: await sha256Hex(TOKEN),
      })
  );
  return { alice, aliceCtx, chatId, orgId, projectId, runtimeId };
}

async function claimJob(
  t: ReturnType<typeof fresh>,
  aliceCtx: ReturnType<typeof asUser>,
  chatId: Id<"chats">,
  runtimeId: Id<"runtimes">
) {
  await aliceCtx.mutation(api.messages.send, {
    body: "@codex hello",
    chatId,
  });
  const claimed = await t.mutation(api.jobs.claimNext, {
    runtimeId,
    token: TOKEN,
  });
  if (!claimed) {
    throw new Error("expected a claimed job");
  }
  return claimed;
}

describe("tool approval HITL", () => {
  it("pauses a write tool until approve, then runs once", async () => {
    const t = fresh();
    const { aliceCtx, chatId, projectId, runtimeId } = await seedProjectChat(t);
    const claimed = await claimJob(t, aliceCtx, chatId, runtimeId);
    const first = await t.mutation(api.agentTools.invoke, {
      argsJson: JSON.stringify({ projectId, title: "Needs yes" }),
      jobId: claimed._id,
      leaseId: claimed.leaseId,
      name: "create_session",
      runtimeId,
      token: TOKEN,
    });
    const listed = await aliceCtx.query(api.toolApprovals.listForChat, {
      chatId,
    });
    const pending = listed?.items.find((item) => item.status === "pending");
    if (!pending) {
      throw new Error("expected pending card");
    }
    const sessionsBefore = await t.mutation(api.agentTools.invoke, {
      argsJson: "{}",
      jobId: claimed._id,
      leaseId: claimed.leaseId,
      name: "list_sessions",
      runtimeId,
      token: TOKEN,
    });
    const titlesBefore = (
      JSON.parse(sessionsBefore.resultJson) as {
        sessions?: { title?: string }[];
      }
    ).sessions?.map((row) => row.title);

    await aliceCtx.mutation(api.toolApprovals.decide, {
      approvalId: pending._id,
      decision: "approved",
    });
    const second = await t.mutation(api.agentTools.invoke, {
      argsJson: JSON.stringify({ projectId, title: "Needs yes" }),
      jobId: claimed._id,
      leaseId: claimed.leaseId,
      name: "create_session",
      runtimeId,
      token: TOKEN,
    });
    const after = await aliceCtx.query(api.toolApprovals.listForChat, {
      chatId,
    });
    expect({
      before: titlesBefore?.includes("Needs yes"),
      card: { executedAt: pending.executedAt, title: pending.title },
      first: {
        payload: JSON.parse(first.resultJson),
        status: first.approval?.status,
      },
      secondApproval: second.approval,
      secondTitle: (
        JSON.parse(second.resultJson) as { session?: { title?: string } }
      ).session?.title,
      settled: after?.items[0]
        ? {
            executed: typeof after.items[0].executedAt,
            status: after.items[0].status,
          }
        : null,
    }).toStrictEqual({
      before: false,
      card: { executedAt: null, title: "チャットを作成" },
      first: { payload: HITL_PENDING_RESULT, status: "pending" },
      secondApproval: undefined,
      secondTitle: "Needs yes",
      settled: { executed: "number", status: "approved" },
    });
  });

  it("rejects without creating the session", async () => {
    const t = fresh();
    const { aliceCtx, chatId, projectId, runtimeId } = await seedProjectChat(t);
    const claimed = await claimJob(t, aliceCtx, chatId, runtimeId);
    await t.mutation(api.agentTools.invoke, {
      argsJson: JSON.stringify({ projectId, title: "Do not create" }),
      jobId: claimed._id,
      leaseId: claimed.leaseId,
      name: "create_session",
      runtimeId,
      token: TOKEN,
    });
    const listed = await aliceCtx.query(api.toolApprovals.listForChat, {
      chatId,
    });
    const pending = listed?.items[0];
    if (!pending) {
      throw new Error("expected pending card");
    }
    await aliceCtx.mutation(api.toolApprovals.decide, {
      approvalId: pending._id,
      decision: "rejected",
    });
    const again = await t.mutation(api.agentTools.invoke, {
      argsJson: JSON.stringify({ projectId, title: "Do not create" }),
      jobId: claimed._id,
      leaseId: claimed.leaseId,
      name: "create_session",
      runtimeId,
      token: TOKEN,
    });
    expect(again.approval?.status).toBe("pending");
    const sessions = JSON.parse(
      (
        await t.mutation(api.agentTools.invoke, {
          argsJson: "{}",
          jobId: claimed._id,
          leaseId: claimed.leaseId,
          name: "list_sessions",
          runtimeId,
          token: TOKEN,
        })
      ).resultJson
    ) as { sessions?: { title?: string }[] };
    expect(
      sessions.sessions?.some((row) => row.title === "Do not create")
    ).toBeFalsy();
  });

  it("lets a reviewer exercise the card without starting a job", async () => {
    const t = fresh();
    const { aliceCtx, chatId } = await seedProjectChat(t);
    const demo = await aliceCtx.mutation(api.toolApprovals.requestDemo, {
      chatId,
    });
    expect(demo).toMatchObject({
      source: "demo",
      status: "pending",
      title: "Linear の課題を作成",
    });
    const jobs = await t.run(async (ctx) => {
      const rows = await ctx.db
        .query("jobs")
        .withIndex("by_chat", (q) => q.eq("chatId", chatId))
        .take(10);
      return rows.length;
    });
    expect(jobs).toBe(0);
    const approved = await aliceCtx.mutation(api.toolApprovals.decide, {
      approvalId: demo._id,
      decision: "approved",
    });
    expect(approved).toMatchObject({
      executedAt: null,
      status: "approved",
    });
  });

  it("hides another organization's approval cards", async () => {
    const t = fresh();
    const { aliceCtx, chatId } = await seedProjectChat(t);
    await aliceCtx.mutation(api.toolApprovals.requestDemo, { chatId });
    const bob = await insertUser(t, { handle: "bob" });
    await asUser(t, bob).mutation(api.orgs.create, { name: "Other" });
    await expect(
      asUser(t, bob).query(api.toolApprovals.listForChat, { chatId })
    ).resolves.toBeNull();
    await expect(
      asUser(t, bob).mutation(api.toolApprovals.requestDemo, { chatId })
    ).rejects.toThrow(/Not a member of this organization/);
  });

  it("cancels an open job approval when the job finishes", async () => {
    const t = fresh();
    const { aliceCtx, chatId, projectId, runtimeId } = await seedProjectChat(t);
    const claimed = await claimJob(t, aliceCtx, chatId, runtimeId);
    await t.mutation(api.agentTools.invoke, {
      argsJson: JSON.stringify({ projectId, title: "Stale" }),
      jobId: claimed._id,
      leaseId: claimed.leaseId,
      name: "create_session",
      runtimeId,
      token: TOKEN,
    });
    await t.mutation(api.jobs.complete, {
      finalText: "done",
      jobId: claimed._id,
      leaseId: claimed.leaseId,
      runtimeId,
      token: TOKEN,
    });
    const page = await aliceCtx.query(api.toolApprovals.listForChat, {
      chatId,
    });
    expect(page?.items[0]?.status).toBe("cancelled");
  });
});
