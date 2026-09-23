import { convexTest } from "convex-test";
import { afterEach, describe, expect, it, vi } from "vitest";

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
    | "get_runtime_status"
    | "list_connectors"
    | "get_connector_status"
    | "suggest_connector",
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
  if (result.approval?.status === "pending") {
    throw new Error(`unexpected pending approval for ${name}`);
  }
  return JSON.parse(result.resultJson) as Record<string, unknown>;
}

async function approveThenInvoke(
  t: ReturnType<typeof fresh>,
  aliceCtx: ReturnType<typeof asUser>,
  claimed: { _id: Id<"jobs">; leaseId: string },
  runtimeId: Id<"runtimes">,
  name: "create_session" | "send_message",
  args: Record<string, unknown> = {}
) {
  const first = await t.mutation(api.agentTools.invoke, {
    argsJson: JSON.stringify(args),
    jobId: claimed._id,
    leaseId: claimed.leaseId,
    name,
    runtimeId,
    token: TOKEN,
  });
  expect(first.approval?.status).toBe("pending");
  expect(JSON.parse(first.resultJson)).toMatchObject({
    ok: false,
    status: "pending_approval",
  });
  const page = await aliceCtx.query(api.toolApprovals.listForJob, {
    jobId: claimed._id,
  });
  const card = page?.items.find(
    (item) => item.status === "pending" && item.name === name
  );
  if (!card) {
    throw new Error("expected a pending approval card");
  }
  await aliceCtx.mutation(api.toolApprovals.decide, {
    approvalId: card._id,
    decision: "approved",
  });
  return await invoke(t, claimed, runtimeId, name, args);
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

    const sentHere = await approveThenInvoke(
      t,
      aliceCtx,
      claimed,
      runtimeId,
      "send_message",
      {
        body: "note on the running job chat",
        chatId,
      }
    );
    expect(sentHere.dispatched).toBeFalsy();

    const sentOther = await approveThenInvoke(
      t,
      aliceCtx,
      claimed,
      runtimeId,
      "send_message",
      {
        body: "plain note",
      }
    );
    expect(sentOther.dispatched).toBeFalsy();
    const page = await aliceCtx.query(api.messages.list, {
      chatId: other,
      limit: 20,
    });
    expect(page.messages.some((row) => row.body === "plain note")).toBeTruthy();
  });

  it("creates a session and reports runtime status without the token hash", async () => {
    const t = fresh();
    const { aliceCtx, claimed, projectId, runtimeId } = await seedJob(t);
    const created = await approveThenInvoke(
      t,
      aliceCtx,
      claimed,
      runtimeId,
      "create_session",
      {
        projectId,
        title: "From agent",
      }
    );
    expect(created.session).toMatchObject({ title: "From agent" });

    const status = await invoke(t, claimed, runtimeId, "get_runtime_status");
    expect(status.runtime).toMatchObject({
      canUse: true,
      name: "box",
    });
    expect(JSON.stringify(status)).not.toContain("tokenHash");
  });

  it("lists tahcode-owned connectors without account ids", async () => {
    const t = fresh();
    const { aliceCtx, claimed, orgId, runtimeId } = await seedJob(t);
    const connectionId = await aliceCtx.mutation(
      api.connectorConnections.upsert,
      {
        connectedAccountId: "ca_default-alice",
        displayLabel: "team linear",
        orgId,
        provider: "linear",
        scope: "org",
      }
    );
    const listed = await invoke(t, claimed, runtimeId, "list_connectors");
    const byId = await invoke(t, claimed, runtimeId, "get_connector_status", {
      connectionId,
    });
    expect({
      accountIdLeaked: JSON.stringify(listed).includes("ca_default-alice"),
      byId,
      listed: listed.connectors,
      vendor: JSON.stringify(listed).toLowerCase().includes("openconnector"),
    }).toStrictEqual({
      accountIdLeaked: false,
      byId: {
        connection: expect.objectContaining({
          connectionId,
          provider: "linear",
          status: "connected",
        }),
      },
      listed: expect.arrayContaining([
        expect.objectContaining({
          connectionId,
          displayLabel: "team linear",
          provider: "linear",
          scope: "org",
          status: "connected",
        }),
      ]),
      vendor: false,
    });
  });

  it("hides another member's personal connector mapping", async () => {
    const t = fresh();
    const { aliceCtx, orgId } = await seedJob(t);
    const orgConnection = await aliceCtx.mutation(
      api.connectorConnections.upsert,
      {
        connectedAccountId: "ca_default-alice",
        displayLabel: "team linear",
        orgId,
        provider: "linear",
        scope: "org",
      }
    );
    const personal = await aliceCtx.mutation(api.connectorConnections.upsert, {
      connectedAccountId: "ca_alice-personal",
      displayLabel: "alice personal",
      orgId,
      provider: "linear",
      scope: "user",
    });
    const bob = await insertUser(t, { handle: "bob-ops" });
    await t.run(async (ctx) => {
      await ctx.db.insert("orgMembers", {
        orgId,
        role: "member",
        userId: bob,
      });
    });
    const bobProject = await asUser(t, bob).mutation(api.projects.create, {
      name: "Bob public",
      orgId,
      visibility: "org",
    });
    const bobChat = await asUser(t, bob).mutation(api.chats.createProjectChat, {
      projectId: bobProject,
      title: "Bob room",
      visibility: "inherit",
    });
    const bobRuntime = await t.run(
      async (ctx) =>
        await ctx.db.insert("runtimes", {
          lastSeenAt: Date.now(),
          name: "bob-ops-box",
          orgId,
          ownerUserId: bob,
          slug: "bob-ops-box",
          status: "online",
          tokenHash: await sha256Hex("th_bob_ops"),
        })
    );
    await asUser(t, bob).mutation(api.messages.send, {
      body: "@codex hi",
      chatId: bobChat,
    });
    const bobJob = await t.mutation(api.jobs.claimNext, {
      runtimeId: bobRuntime,
      token: "th_bob_ops",
    });
    if (!bobJob) {
      throw new Error("expected bob job");
    }
    const asBob = await invoke(
      t,
      bobJob,
      bobRuntime,
      "list_connectors",
      {},
      "th_bob_ops"
    );
    expect(asBob.connectors).toStrictEqual(
      expect.arrayContaining([
        expect.objectContaining({ connectionId: orgConnection, scope: "org" }),
      ])
    );
    expect(JSON.stringify(asBob)).not.toContain(personal);
    await expect(
      invoke(
        t,
        bobJob,
        bobRuntime,
        "get_connector_status",
        { connectionId: personal },
        "th_bob_ops"
      )
    ).rejects.toThrow(/connection not found/i);
  });
});

describe("agent Linear connector tools", () => {
  const previousEnv = {
    OPENCONNECTOR_ADMIN_TOKEN: process.env.OPENCONNECTOR_ADMIN_TOKEN,
    OPENCONNECTOR_BASE_URL: process.env.OPENCONNECTOR_BASE_URL,
    OPENCONNECTOR_RUNTIME_TOKEN: process.env.OPENCONNECTOR_RUNTIME_TOKEN,
  };

  afterEach(() => {
    if (previousEnv.OPENCONNECTOR_ADMIN_TOKEN === undefined) {
      delete process.env.OPENCONNECTOR_ADMIN_TOKEN;
    } else {
      process.env.OPENCONNECTOR_ADMIN_TOKEN =
        previousEnv.OPENCONNECTOR_ADMIN_TOKEN;
    }
    if (previousEnv.OPENCONNECTOR_BASE_URL === undefined) {
      delete process.env.OPENCONNECTOR_BASE_URL;
    } else {
      process.env.OPENCONNECTOR_BASE_URL = previousEnv.OPENCONNECTOR_BASE_URL;
    }
    if (previousEnv.OPENCONNECTOR_RUNTIME_TOKEN === undefined) {
      delete process.env.OPENCONNECTOR_RUNTIME_TOKEN;
    } else {
      process.env.OPENCONNECTOR_RUNTIME_TOKEN =
        previousEnv.OPENCONNECTOR_RUNTIME_TOKEN;
    }
    vi.unstubAllGlobals();
  });

  it("lists issues through the mentioned Linear connection without leaking vendor internals", async () => {
    process.env.OPENCONNECTOR_ADMIN_TOKEN = "test-admin";
    process.env.OPENCONNECTOR_BASE_URL = "https://oc.test";
    process.env.OPENCONNECTOR_RUNTIME_TOKEN = "oct_runtime";
    const calls: {
      body?: string;
      headers?: Record<string, string>;
      url: string;
    }[] = [];
    vi.stubGlobal(
      "fetch",
      async (
        url: string,
        init?: { body?: string; headers?: Record<string, string> }
      ) => {
        calls.push({
          body: init?.body,
          headers: init?.headers,
          url: String(url),
        });
        return {
          ok: true,
          status: 200,
          text: async () =>
            JSON.stringify({
              data: {
                alias: "should-not-leak",
                issues: [
                  {
                    identifier: "TAH-54",
                    title: "inject Linear",
                    url: "https://linear.app/tahcode/issue/TAH-54",
                  },
                ],
              },
              message: "OK",
              success: true,
            }),
        };
      }
    );

    const t = fresh();
    const { aliceCtx, claimed, orgId, runtimeId } = await seedJob(t);
    const connectionId = await aliceCtx.mutation(
      api.connectorConnections.upsert,
      {
        connectedAccountId: "ca_linear-alice",
        displayLabel: "pottos",
        orgId,
        provider: "linear",
        scope: "org",
      }
    );
    await t.run(async (ctx) => {
      await ctx.db.patch("connectorConnections", connectionId, {
        oauthAlias: "work",
      });
      const job = await ctx.db.get("jobs", claimed._id);
      if (!job) {
        throw new Error("job missing");
      }
      await ctx.db.patch("jobs", claimed._id, {
        prompt: "@claude @linear/pottos 課題を一覧",
      });
      const trigger = await ctx.db.get("messages", job.triggerMessageId);
      if (trigger) {
        await ctx.db.patch("messages", trigger._id, {
          body: "@claude @linear/pottos 課題を一覧",
        });
      }
    });

    const result = await t.action(api.agentTools.invokeConnector, {
      argsJson: JSON.stringify({ limit: 10 }),
      jobId: claimed._id,
      leaseId: claimed.leaseId,
      name: "list_linear_issues",
      runtimeId,
      token: TOKEN,
    });
    const parsed = JSON.parse(result.resultJson) as {
      issues?: { identifier?: string }[];
    };
    expect({
      identifier: parsed.issues?.[0]?.identifier,
      actionUrl: calls[0]?.url,
      alias: calls[0]?.headers?.["x-oo-connector-alias"],
      first: calls[0]?.body.includes('"first":10'),
      leaked: ["openconnector", "should-not-leak", "oct_runtime"].filter(
        (needle) => result.resultJson.toLowerCase().includes(needle)
      ),
    }).toStrictEqual({
      identifier: "TAH-54",
      actionUrl: "https://oc.test/v1/actions/linear.list_linear_issues",
      alias: "work",
      first: true,
      leaked: [],
    });

    const teams = await t.action(api.agentTools.invokeConnector, {
      argsJson: "{}",
      jobId: claimed._id,
      leaseId: claimed.leaseId,
      name: "list_linear_teams",
      runtimeId,
      token: TOKEN,
    });
    expect(calls.at(-1)?.url).toBe(
      "https://oc.test/v1/actions/linear.list_linear_teams"
    );
    expect(teams.name).toBe("list_linear_teams");
  });

  it("refuses a disconnected Linear mapping", async () => {
    process.env.OPENCONNECTOR_ADMIN_TOKEN = "test-admin";
    process.env.OPENCONNECTOR_BASE_URL = "https://oc.test";
    process.env.OPENCONNECTOR_RUNTIME_TOKEN = "oct_runtime";
    const t = fresh();
    const { aliceCtx, claimed, orgId, runtimeId } = await seedJob(t);
    const connectionId = await aliceCtx.mutation(
      api.connectorConnections.upsert,
      {
        connectedAccountId: "ca_linear-off",
        displayLabel: "pottos",
        orgId,
        provider: "linear",
        scope: "org",
      }
    );
    await aliceCtx.mutation(api.connectorConnections.disconnect, {
      connectionId,
    });
    await t.run(async (ctx) => {
      await ctx.db.patch("jobs", claimed._id, {
        prompt: "@claude @linear/pottos",
      });
    });
    await expect(
      t.action(api.agentTools.invokeConnector, {
        argsJson: "{}",
        jobId: claimed._id,
        leaseId: claimed.leaseId,
        name: "list_linear_issues",
        runtimeId,
        token: TOKEN,
      })
    ).rejects.toThrow(/no connected linear account is mentioned/i);
  });
});
