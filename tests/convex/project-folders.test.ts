import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { sha256Hex } from "../../convex/lib/ids";
import schema from "../../convex/schema";
import { MISSING_PROJECT_FOLDER_MESSAGE } from "../../shared/composerContext.ts";

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
  const runtimeId = await t.run(
    async (ctx) =>
      await ctx.db.insert("runtimes", {
        lastSeenAt: Date.now(),
        name: "ローカル",
        orgId,
        ownerUserId: alice,
        slug: "local",
        status: "online",
        tokenHash: await sha256Hex("th_folder_test"),
      })
  );
  return { alice, aliceCtx, orgId, runtimeId };
}

describe("project runtime folders", () => {
  it("stores optional per-machine folders on create and lists them", async () => {
    const t = fresh();
    const { aliceCtx, orgId, runtimeId } = await seedOrg(t);
    const projectId = await aliceCtx.mutation(api.projects.create, {
      folders: [{ cwd: "/Users/alice/code/web", runtimeId }],
      name: "Web",
      orgId,
      visibility: "org",
    });
    const listed = await aliceCtx.query(api.projects.list, { orgId });
    const project = listed.find((item) => item._id === projectId);
    expect(project?.cwd).toBe("/Users/alice/code/web");
    expect(project?.folders).toStrictEqual([
      { cwd: "/Users/alice/code/web", runtimeId },
    ]);
  });

  it("lets a member map a folder later and upserts the same machine", async () => {
    const t = fresh();
    const { aliceCtx, orgId, runtimeId } = await seedOrg(t);
    const projectId = await aliceCtx.mutation(api.projects.create, {
      name: "Web",
      orgId,
      visibility: "org",
    });
    await aliceCtx.mutation(api.projects.setRuntimeFolder, {
      cwd: "  ~/code/web  ",
      projectId,
      runtimeId,
    });
    await aliceCtx.mutation(api.projects.setRuntimeFolder, {
      cwd: "~/code/web-v2",
      projectId,
      runtimeId,
    });
    const project = await aliceCtx.query(api.projects.get, { projectId });
    expect(project?.folders).toStrictEqual([
      { cwd: "~/code/web-v2", runtimeId },
    ]);
    expect(project?.cwd).toBe("~/code/web");
  });

  it("hides folder writes from another org", async () => {
    const t = fresh();
    const { aliceCtx, orgId, runtimeId } = await seedOrg(t);
    const projectId = await aliceCtx.mutation(api.projects.create, {
      name: "Web",
      orgId,
      visibility: "org",
    });
    const bob = await insertUser(t, { handle: "bob" });
    const bobOrg = await asUser(t, bob).mutation(api.orgs.create, {
      name: "Other",
    });
    await expect(
      asUser(t, bob).mutation(api.projects.setRuntimeFolder, {
        cwd: "/stolen",
        projectId,
        runtimeId,
      })
    ).rejects.toThrow(/not a member/i);
    expect(bobOrg).toBeTruthy();
  });

  it("still dispatches legacy projects that have no machine mappings", async () => {
    const t = fresh();
    const { aliceCtx, orgId, runtimeId } = await seedOrg(t);
    const projectId = await aliceCtx.mutation(api.projects.create, {
      cwd: "~/legacy",
      name: "Legacy",
      orgId,
      visibility: "org",
    });
    const chatId = await aliceCtx.mutation(api.chats.createProjectChat, {
      projectId,
      title: "General",
      visibility: "inherit",
    });
    const sent = await aliceCtx.mutation(api.messages.send, {
      body: "@cursor hello",
      branch: "feature/foo",
      chatId,
      runtimeId,
    });
    expect(sent.dispatched).toBeTruthy();
    expect(sent.jobId).toBeTruthy();
    const context = await t.run(async (ctx) => {
      if (!sent.jobId) {
        throw new Error("expected job");
      }
      const job = await ctx.db.get("jobs", sent.jobId);
      return JSON.parse(job?.contextJson ?? "{}") as {
        project?: { branch?: string; cwd?: string };
      };
    });
    expect(context.project?.cwd).toBe("~/legacy");
    expect(context.project?.branch).toBe("feature/foo");
  });

  it("refuses to dispatch when the picked machine has no mapping", async () => {
    const t = fresh();
    const { alice, aliceCtx, orgId, runtimeId } = await seedOrg(t);
    const otherRuntime = await t.run(
      async (ctx) =>
        await ctx.db.insert("runtimes", {
          lastSeenAt: Date.now(),
          name: "remote",
          orgId,
          ownerUserId: alice,
          slug: "remote",
          status: "online",
          tokenHash: await sha256Hex("th_folder_other"),
        })
    );
    const projectId = await aliceCtx.mutation(api.projects.create, {
      folders: [{ cwd: "/only/local", runtimeId }],
      name: "Web",
      orgId,
      visibility: "org",
    });
    const chatId = await aliceCtx.mutation(api.chats.createProjectChat, {
      projectId,
      title: "General",
      visibility: "inherit",
    });
    await expect(
      aliceCtx.mutation(api.messages.send, {
        body: "@cursor hello",
        chatId,
        runtimeId: otherRuntime,
      })
    ).rejects.toThrow(MISSING_PROJECT_FOLDER_MESSAGE);
  });
});
