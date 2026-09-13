import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { api, internal } from "../../convex/_generated/api";
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

const TOKEN = "th_artifact_ingest_test";

async function seedRunningJob(t: ReturnType<typeof fresh>) {
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
    body: "@codex $imagegen a fox",
    chatId,
  });
  if (!sent.jobId || !sent.assistantMessageId) {
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
    alice,
    aliceCtx,
    assistantMessageId: sent.assistantMessageId,
    chatId,
    jobId: sent.jobId,
    leaseId: claimed.leaseId,
    orgId,
    runtimeId,
  };
}

describe("harness artifact ingest", () => {
  it("records a storage-backed artifact on a leased job", async () => {
    const t = fresh();
    const seed = await seedRunningJob(t);
    const storageId = await t.run(async (ctx) => {
      const blob = new Blob([new Uint8Array([137, 80, 78, 71])], {
        type: "image/png",
      });
      return await ctx.storage.store(blob);
    });
    const ingested = await t.mutation(internal.files.ingestFromRuntime, {
      contentType: "image/png",
      jobId: seed.jobId,
      leaseId: seed.leaseId,
      localPath: "/Users/me/.codex/generated_images/ig.png",
      name: "ig.png",
      runtimeId: seed.runtimeId,
      size: 4,
      storageId,
      token: TOKEN,
    });
    expect(ingested.name).toBe("ig.png");
    const listed = await seed.aliceCtx.query(api.files.listByMessage, {
      messageId: seed.assistantMessageId,
    });
    expect(listed).toHaveLength(1);
    expect(listed[0]?.kind).toBe("storage");
    expect(listed[0]?.name).toBe("ig.png");
    const byKey = await seed.aliceCtx.query(api.files.getByKey, {
      key: ingested.key,
    });
    expect(byKey?.url).toBeTruthy();
  });

  it("returns a Convex storage URL from ticketForKey", async () => {
    const t = fresh();
    const seed = await seedRunningJob(t);
    const storageId = await t.run(async (ctx) => {
      const blob = new Blob([new Uint8Array([137, 80, 78, 71])], {
        type: "image/png",
      });
      return await ctx.storage.store(blob);
    });
    const ingested = await t.mutation(internal.files.ingestFromRuntime, {
      contentType: "image/png",
      jobId: seed.jobId,
      leaseId: seed.leaseId,
      name: "ig.png",
      runtimeId: seed.runtimeId,
      size: 4,
      storageId,
      token: TOKEN,
    });
    const signed = await seed.aliceCtx.mutation(api.files.ticketForKey, {
      key: ingested.key,
    });
    expect(signed.startsWith("http")).toBeTruthy();
  });

  it("rejects ingest with a bad runtime token", async () => {
    const t = fresh();
    const seed = await seedRunningJob(t);
    const storageId = await t.run(async (ctx) => {
      const blob = new Blob([new Uint8Array([1, 2, 3, 4])], {
        type: "image/png",
      });
      return await ctx.storage.store(blob);
    });
    await expect(
      t.mutation(internal.files.ingestFromRuntime, {
        contentType: "image/png",
        jobId: seed.jobId,
        leaseId: seed.leaseId,
        name: "ig.png",
        runtimeId: seed.runtimeId,
        size: 4,
        storageId,
        token: "wrong-token",
      })
    ).rejects.toThrow(/invalid runtime token/i);
  });

  it("hides artifacts from outsiders", async () => {
    const t = fresh();
    const seed = await seedRunningJob(t);
    const storageId = await t.run(async (ctx) => {
      const blob = new Blob([new Uint8Array([1, 2, 3, 4])], {
        type: "image/png",
      });
      return await ctx.storage.store(blob);
    });
    const ingested = await t.mutation(internal.files.ingestFromRuntime, {
      contentType: "image/png",
      jobId: seed.jobId,
      leaseId: seed.leaseId,
      name: "ig.png",
      runtimeId: seed.runtimeId,
      size: 4,
      storageId,
      token: TOKEN,
    });
    const eve = await insertUser(t, { handle: "eve" });
    await expect(
      asUser(t, eve).query(api.files.getByKey, { key: ingested.key })
    ).rejects.toThrow(/not a member/i);
  });
});
