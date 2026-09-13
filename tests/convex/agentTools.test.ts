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

const TOKEN = "th_agent_tools_test";

async function seedJob(t: ReturnType<typeof fresh>) {
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
  return {
    alice,
    aliceCtx,
    chatId,
    claimed,
    orgId,
    projectId,
    runtimeId,
  };
}

async function invoke(
  t: ReturnType<typeof fresh>,
  claimed: { _id: Id<"jobs">; leaseId: string },
  runtimeId: Id<"runtimes">,
  name:
    | "list_orgs"
    | "list_projects"
    | "list_sessions"
    | "get_session"
    | "create_session"
    | "switch_session"
    | "send_message"
    | "list_runtimes"
    | "get_runtime_status",
  args: Record<string, unknown> = {},
  token = TOKEN
) {
  const result = await t.mutation(api.agentTools.invoke, {
    argsJson: JSON.stringify(args),
    jobId: claimed._id,
    leaseId: claimed.leaseId,
    name,
    runtimeId,
    token,
  });
  return JSON.parse(result.resultJson) as Record<string, unknown>;
}

describe("agent tools authz", () => {
  it("lists the acting user's orgs and job-scoped projects", async () => {
    const t = fresh();
    const { claimed, orgId, runtimeId } = await seedJob(t);
    const orgs = await invoke(t, claimed, runtimeId, "list_orgs");
    expect(orgs.orgs).toStrictEqual(
      expect.arrayContaining([
        expect.objectContaining({ _id: orgId, name: "Acme", role: "owner" }),
      ])
    );
    const projects = await invoke(t, claimed, runtimeId, "list_projects");
    expect(projects.projects).toStrictEqual(
      expect.arrayContaining([expect.objectContaining({ name: "Public" })])
    );
  });

  it("hides another org's projects from a non-member", async () => {
    const t = fresh();
    const { claimed, runtimeId } = await seedJob(t);
    const bob = await insertUser(t, { handle: "bob" });
    const orgB = await asUser(t, bob).mutation(api.orgs.create, {
      name: "Beta",
    });
    await expect(
      invoke(t, claimed, runtimeId, "list_projects", { orgId: orgB })
    ).rejects.toThrow(/not a member of this organization/i);
  });

  it("hides a private project and its chats from a mere member", async () => {
    const t = fresh();
    const { aliceCtx, claimed, orgId, runtimeId } = await seedJob(t);
    const secretId = await aliceCtx.mutation(api.projects.create, {
      name: "Secret",
      orgId,
      visibility: "private",
    });
    const secretChat = await aliceCtx.mutation(api.chats.createProjectChat, {
      projectId: secretId,
      title: "Hidden",
      visibility: "inherit",
    });
    const bob = await insertUser(t, { handle: "bob" });
    await t.run(async (ctx) => {
      await ctx.db.insert("orgMembers", {
        orgId,
        role: "member",
        userId: bob,
      });
    });
    const listed = await invoke(t, claimed, runtimeId, "list_projects");
    expect(listed.projects).toStrictEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "Public" }),
        expect.objectContaining({ name: "Secret" }),
      ])
    );

    const bobRuntime = await t.run(
      async (ctx) =>
        await ctx.db.insert("runtimes", {
          lastSeenAt: Date.now(),
          name: "bob-box",
          orgId,
          ownerUserId: bob,
          slug: "bob-box",
          status: "online",
          tokenHash: await sha256Hex("th_bob"),
        })
    );
    const bobProject = await asUser(t, bob).mutation(api.projects.create, {
      name: "Also public",
      orgId,
      visibility: "org",
    });
    const bobChat = await asUser(t, bob).mutation(api.chats.createProjectChat, {
      projectId: bobProject,
      title: "Bob room",
      visibility: "inherit",
    });
    await asUser(t, bob).mutation(api.messages.send, {
      body: "@codex hi",
      chatId: bobChat,
    });
    const bobJob = await t.mutation(api.jobs.claimNext, {
      runtimeId: bobRuntime,
      token: "th_bob",
    });
    if (!bobJob) {
      throw new Error("expected bob job");
    }
    await expect(
      invoke(
        t,
        bobJob,
        bobRuntime,
        "get_session",
        { chatId: secretChat },
        "th_bob"
      )
    ).rejects.toThrow(/cannot see this project/i);
    const bobProjects = await invoke(
      t,
      bobJob,
      bobRuntime,
      "list_projects",
      {},
      "th_bob"
    );
    expect(bobProjects.projects).not.toStrictEqual(
      expect.arrayContaining([expect.objectContaining({ name: "Secret" })])
    );
  });

  it("rejects a bad token or a foreign job lease", async () => {
    const t = fresh();
    const { claimed, runtimeId } = await seedJob(t);
    await expect(
      invoke(t, claimed, runtimeId, "list_orgs", {}, "th_wrong")
    ).rejects.toThrow(/invalid runtime token/i);
    await expect(
      t.mutation(api.agentTools.invoke, {
        argsJson: "{}",
        jobId: claimed._id,
        leaseId: "not-the-lease",
        name: "list_orgs",
        runtimeId,
        token: TOKEN,
      })
    ).rejects.toThrow(/lease expired/i);
  });

  it("switches session then sends without dispatching the running chat", async () => {
    const t = fresh();
    const { aliceCtx, claimed, chatId, projectId, runtimeId } =
      await seedJob(t);
    const other = await aliceCtx.mutation(api.chats.createProjectChat, {
      projectId,
      title: "Other",
      visibility: "inherit",
    });
    const switched = await invoke(t, claimed, runtimeId, "switch_session", {
      chatId: other,
    });
    expect(switched.session).toMatchObject({ title: "Other" });

    const sentHere = await invoke(t, claimed, runtimeId, "send_message", {
      body: "note on the running job chat",
      chatId,
    });
    expect(sentHere.dispatched).toBeFalsy();

    const sentOther = await invoke(t, claimed, runtimeId, "send_message", {
      body: "plain note",
    });
    expect(sentOther.dispatched).toBeFalsy();
    const page = await aliceCtx.query(api.messages.list, {
      chatId: other,
      limit: 20,
    });
    expect(page.messages.some((row) => row.body === "plain note")).toBeTruthy();
  });

  it("creates a session and reports runtime status without the token hash", async () => {
    const t = fresh();
    const { claimed, projectId, runtimeId } = await seedJob(t);
    const created = await invoke(t, claimed, runtimeId, "create_session", {
      projectId,
      title: "From agent",
    });
    expect(created.session).toMatchObject({ title: "From agent" });

    const status = await invoke(t, claimed, runtimeId, "get_runtime_status");
    expect(status.runtime).toMatchObject({
      canUse: true,
      name: "box",
    });
    expect(JSON.stringify(status)).not.toContain("tokenHash");
  });
});
