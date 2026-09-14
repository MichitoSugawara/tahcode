import { convexTest } from "convex-test";
import { afterEach, describe, expect, it, vi } from "vitest";

import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import schema from "../../convex/schema";
import { pendingConnectorAccountId } from "../../shared/connectors.ts";

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
  const member = await insertUser(t, { handle: "member" });
  const aliceCtx = asUser(t, alice);
  const orgA = await aliceCtx.mutation(api.orgs.create, { name: "Alpha" });
  await t.run(async (ctx) => {
    await ctx.db.insert("orgMembers", {
      orgId: orgA,
      role: "member",
      userId: member,
    });
  });
  return {
    aliceCtx,
    memberCtx: asUser(t, member),
    orgA,
  };
}

const previousEnv = {
  OPENCONNECTOR_ADMIN_TOKEN: process.env.OPENCONNECTOR_ADMIN_TOKEN,
  OPENCONNECTOR_BASE_URL: process.env.OPENCONNECTOR_BASE_URL,
  OPENCONNECTOR_RUNTIME_TOKEN: process.env.OPENCONNECTOR_RUNTIME_TOKEN,
  SITE_URL: process.env.SITE_URL,
};

function restoreConnectorEnv() {
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
  if (previousEnv.SITE_URL === undefined) {
    delete process.env.SITE_URL;
  } else {
    process.env.SITE_URL = previousEnv.SITE_URL;
  }
  vi.unstubAllGlobals();
}

function configureOpenConnector() {
  process.env.OPENCONNECTOR_ADMIN_TOKEN = "test-admin-token";
  process.env.OPENCONNECTOR_BASE_URL = "https://oc.test";
  process.env.SITE_URL = "https://app.test";
}

function jsonResponse(data: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () =>
      JSON.stringify({
        data,
        message: status >= 200 && status < 300 ? "OK" : "error",
        success: status >= 200 && status < 300,
      }),
  };
}

describe("startLinearConnect", () => {
  afterEach(restoreConnectorEnv);

  it("does not insert a ghost Linear row when OAuth is not configured", async () => {
    const t = fresh();
    const { aliceCtx, orgA } = await seedOrg(t);
    const result = await aliceCtx.action(
      api.connectorConnect.startLinearConnect,
      {
        orgId: orgA,
        scope: "org",
      }
    );
    expect(result).toMatchObject({
      authorizeUrl: null,
      connectionId: null,
      ready: false,
      reason: "oauth_not_configured",
    });
    const listed = await aliceCtx.query(api.connectorConnections.listByOrg, {
      orgId: orgA,
      provider: "linear",
    });
    expect(listed).toHaveLength(0);
  });

  it("leaves an existing connected Linear account untouched when OAuth is not configured", async () => {
    const t = fresh();
    const { aliceCtx, orgA } = await seedOrg(t);
    const connectionId = await aliceCtx.mutation(
      api.connectorConnections.upsert,
      {
        connectedAccountId: "ca_default-linear",
        orgId: orgA,
        provider: "linear",
        scope: "org",
      }
    );
    const result = await aliceCtx.action(
      api.connectorConnect.startLinearConnect,
      {
        orgId: orgA,
        scope: "org",
      }
    );
    expect(result).toMatchObject({
      connectionId: null,
      ready: false,
      reason: "oauth_not_configured",
    });
    const listed = await aliceCtx.query(api.connectorConnections.listByOrg, {
      orgId: orgA,
    });
    expect(listed).toHaveLength(1);
    expect(listed.find((row) => row._id === connectionId)).toMatchObject({
      connectedAccountId: "ca_default-linear",
      status: "connected",
    });
  });

  it("does not flip a disconnected mapping when OAuth is not configured", async () => {
    const t = fresh();
    const { aliceCtx, orgA } = await seedOrg(t);
    const connectionId = await aliceCtx.mutation(
      api.connectorConnections.upsert,
      {
        connectedAccountId: "ca_default-linear",
        orgId: orgA,
        provider: "linear",
        scope: "org",
      }
    );
    await aliceCtx.mutation(api.connectorConnections.disconnect, {
      connectionId,
    });
    const result = await aliceCtx.action(
      api.connectorConnect.startLinearConnect,
      {
        connectionId,
        orgId: orgA,
        scope: "org",
      }
    );
    expect(result).toMatchObject({
      connectionId: null,
      ready: false,
      reason: "oauth_not_configured",
    });
    expect(
      (
        await aliceCtx.query(api.connectorConnections.listByOrg, {
          orgId: orgA,
        })
      )[0]
    ).toMatchObject({
      connectedAccountId: "ca_default-linear",
      status: "disconnected",
    });
  });

  it("blocks members from org-scope start and outsiders from any start", async () => {
    const t = fresh();
    const { memberCtx, orgA } = await seedOrg(t);
    await expect(
      memberCtx.action(api.connectorConnect.startLinearConnect, {
        orgId: orgA,
        scope: "org",
      })
    ).rejects.toThrow(/admin access required/i);
    const outsider = await insertUser(t, { handle: "outsider" });
    await expect(
      asUser(t, outsider).action(api.connectorConnect.startLinearConnect, {
        orgId: orgA,
        scope: "org",
      })
    ).rejects.toThrow(/not a member of this organization/i);
    await expect(
      t.action(api.connectorConnect.startLinearConnect, {
        orgId: orgA,
        scope: "org",
      })
    ).rejects.toThrow(/not authenticated/i);
  });

  it("lets a member start a user-scoped Linear connect when OAuth is configured", async () => {
    configureOpenConnector();
    vi.stubGlobal("fetch", async () =>
      jsonResponse({
        authorizationUrl: "https://linear.app/oauth/authorize?client_id=x",
        connectionRequestId: "req-member-1",
        expiresAt: "2026-09-14T07:10:00.000Z",
        stateHandle: "state-member",
        status: "initiated",
      })
    );
    const t = fresh();
    const { memberCtx, orgA } = await seedOrg(t);
    const result = await memberCtx.action(
      api.connectorConnect.startLinearConnect,
      {
        orgId: orgA,
        scope: "user",
      }
    );
    const listed = await memberCtx.query(api.connectorConnections.listByOrg, {
      orgId: orgA,
    });
    expect(listed).toHaveLength(1);
    expect(listed[0]).toMatchObject({
      _id: result.connectionId,
      scope: "user",
      status: "needsAuth",
    });
  });

  it("starts OpenConnector OAuth and stores the request id, not a token", async () => {
    configureOpenConnector();
    const calls: { body?: string; url: string }[] = [];
    vi.stubGlobal("fetch", async (url: string, init?: { body?: string }) => {
      calls.push({ body: init?.body, url: String(url) });
      return jsonResponse({
        authorizationUrl: "https://linear.app/oauth/authorize?client_id=x",
        connectionRequestId: "req-start-1",
        expiresAt: "2026-09-14T07:10:00.000Z",
        stateHandle: "state-1",
        status: "initiated",
      });
    });
    const t = fresh();
    const { aliceCtx, orgA } = await seedOrg(t);
    const org = await aliceCtx.query(api.orgs.get, { orgId: orgA });
    const result = await aliceCtx.action(
      api.connectorConnect.startLinearConnect,
      {
        orgId: orgA,
        returnOrigin: "https://tahcode.com",
        scope: "org",
      }
    );
    const startedId = result.connectionId;
    if (!startedId) {
      throw new Error("expected connection id");
    }
    const stored = await t.run(async (ctx) => {
      const row = await ctx.db.get("connectorConnections", startedId);
      if (!row) {
        throw new Error("expected connection row");
      }
      return row;
    });
    expect({
      action: result,
      body: calls[0]?.body,
      stored: {
        hasAccessToken: Object.hasOwn(stored, "accessToken"),
        oauthRequestId: stored.oauthRequestId,
        status: stored.status,
      },
      url: calls[0]?.url,
    }).toMatchObject({
      action: {
        authorizeUrl: "https://linear.app/oauth/authorize?client_id=x",
        ready: true,
        reason: "started",
      },
      stored: {
        hasAccessToken: false,
        oauthRequestId: "req-start-1",
        status: "needsAuth",
      },
      url: "https://oc.test/v1/connections/linear/connect",
    });
    expect(calls[0]?.body).toContain(
      `https://tahcode.com/o/${org?.slug}/connectors?connector=linear&scope=org&connectionId=${startedId}`
    );
    expect(calls[0]?.body).not.toContain("connectedAccountId");
  });

  it("creates pending A first, completes A, then starts pending B without overwriting A", async () => {
    configureOpenConnector();
    let startCount = 0;
    vi.stubGlobal("fetch", async (url: string, init?: { body?: string }) => {
      const href = String(url);
      if (href.endsWith("/v1/connections/linear/connect")) {
        startCount += 1;
        const requestId = `req-start-${startCount}`;
        return jsonResponse({
          authorizationUrl: `https://linear.app/oauth/authorize?n=${startCount}`,
          connectionRequestId: requestId,
          expiresAt: "2026-09-14T07:10:00.000Z",
          stateHandle: `state-${startCount}`,
          status: "initiated",
        });
      }
      if (href.endsWith("/v1/connection-requests/req-start-1")) {
        return jsonResponse({
          appId: "bbbbbbbb-2222-4f8e-9134-c1db5c9cf7f8",
          connectionRequestId: "req-start-1",
          errorCode: null,
          errorMessage: null,
          service: "linear",
          status: "connected",
        });
      }
      if (href.includes("/v1/connections/by-id/")) {
        return jsonResponse({
          alias: "ignored-alias",
          id: "bbbbbbbb-2222-4f8e-9134-c1db5c9cf7f8",
          service: "linear",
          status: "active",
        });
      }
      if (href.endsWith("/v1/actions/linear.get_current_user")) {
        return jsonResponse({
          viewer: { displayName: "alice", name: "Alice" },
        });
      }
      throw new Error(`unexpected fetch ${href} ${init?.body ?? ""}`);
    });
    const t = fresh();
    const { aliceCtx, orgA } = await seedOrg(t);
    const first = await aliceCtx.action(
      api.connectorConnect.startLinearConnect,
      {
        orgId: orgA,
        scope: "org",
      }
    );
    if (!first.connectionId) {
      throw new Error("expected first connection id");
    }
    const completed = await aliceCtx.action(
      api.connectorConnect.completeLinearConnect,
      {
        connectionId: first.connectionId,
        orgId: orgA,
        scope: "org",
      }
    );
    const second = await aliceCtx.action(
      api.connectorConnect.startLinearConnect,
      {
        orgId: orgA,
        scope: "org",
      }
    );
    if (!second.connectionId) {
      throw new Error("expected second connection id");
    }
    const listed = await aliceCtx.query(api.connectorConnections.listByOrg, {
      orgId: orgA,
    });
    expect({
      completed,
      firstReady: first.ready,
      listed: listed
        .map((row) => ({
          id: row._id,
          label: row.displayLabel ?? null,
          status: row.status,
        }))
        .sort((left, right) => left.id.localeCompare(right.id)),
      reusedFirst: second.connectionId === first.connectionId,
    }).toStrictEqual({
      completed: {
        connectionId: first.connectionId,
        displayLabel: "alice",
        status: "connected",
      },
      firstReady: true,
      listed: [
        {
          id: first.connectionId,
          label: "alice",
          status: "connected",
        },
        {
          id: second.connectionId,
          label: null,
          status: "needsAuth",
        },
      ].sort((left, right) => left.id.localeCompare(right.id)),
      reusedFirst: false,
    });
  });
});

describe("completeLinearConnect", () => {
  afterEach(restoreConnectorEnv);

  it("confirms the saved request server-side and marks Connected after health check", async () => {
    configureOpenConnector();
    vi.stubGlobal("fetch", async (url: string) => {
      const href = String(url);
      if (href.endsWith("/v1/connection-requests/req-complete-1")) {
        return jsonResponse({
          appId: "bfd5bc8a-0044-4f8e-9134-c1db5c9cf7f8",
          connectionRequestId: "req-complete-1",
          errorCode: null,
          errorMessage: null,
          service: "linear",
          status: "connected",
        });
      }
      if (href.includes("/v1/connections/by-id/")) {
        return jsonResponse({
          accountLabel: "michitogawara",
          alias: "work",
          displayName: "michitogawara",
          id: "bfd5bc8a-0044-4f8e-9134-c1db5c9cf7f8",
          service: "linear",
          status: "active",
        });
      }
      if (href.endsWith("/v1/actions/linear.get_current_user")) {
        return jsonResponse({
          viewer: {
            displayName: "michitogawara",
            email: "owner@example.com",
            name: "Michito",
          },
        });
      }
      throw new Error(`unexpected fetch ${href}`);
    });
    const t = fresh();
    const { aliceCtx, orgA } = await seedOrg(t);
    const connectionId = await aliceCtx.mutation(
      api.connectorConnections.upsert,
      {
        connectedAccountId: pendingConnectorAccountId("linear"),
        orgId: orgA,
        provider: "linear",
        scope: "org",
        status: "needsAuth",
      }
    );
    await t.run(async (ctx) => {
      await ctx.db.patch("connectorConnections", connectionId, {
        oauthRequestId: "req-complete-1",
      });
    });
    const result = await aliceCtx.action(
      api.connectorConnect.completeLinearConnect,
      {
        orgId: orgA,
        scope: "org",
      }
    );
    expect(result).toMatchObject({
      connectionId,
      displayLabel: "michitogawara",
      status: "connected",
    });
    expect(
      (
        await aliceCtx.query(api.connectorConnections.listByOrg, {
          orgId: orgA,
        })
      )[0]
    ).toMatchObject({
      connectedAccountId: "bfd5bc8a-0044-4f8e-9134-c1db5c9cf7f8",
      displayLabel: "michitogawara",
      status: "connected",
    });
  });

  it("creates a second connected Linear row instead of overwriting the first", async () => {
    configureOpenConnector();
    vi.stubGlobal("fetch", async (url: string) => {
      const href = String(url);
      if (href.endsWith("/v1/connection-requests/req-complete-2")) {
        return jsonResponse({
          appId: "aaaaaaaa-1111-4f8e-9134-c1db5c9cf7f8",
          connectionRequestId: "req-complete-2",
          errorCode: null,
          errorMessage: null,
          service: "linear",
          status: "connected",
        });
      }
      if (href.includes("/v1/connections/by-id/")) {
        return jsonResponse({
          accountLabel: "pottos",
          alias: "pottos",
          displayName: "pottos",
          id: "aaaaaaaa-1111-4f8e-9134-c1db5c9cf7f8",
          service: "linear",
          status: "active",
        });
      }
      if (href.endsWith("/v1/actions/linear.get_current_user")) {
        return jsonResponse({
          viewer: { displayName: "pottos", name: "pottos" },
        });
      }
      throw new Error(`unexpected fetch ${href}`);
    });
    const t = fresh();
    const { aliceCtx, orgA } = await seedOrg(t);
    const first = await aliceCtx.mutation(api.connectorConnections.upsert, {
      connectedAccountId: "bfd5bc8a-0044-4f8e-9134-c1db5c9cf7f8",
      displayLabel: "michitogawara",
      orgId: orgA,
      provider: "linear",
      scope: "org",
    });
    const pending = await aliceCtx.mutation(api.connectorConnections.upsert, {
      connectedAccountId: pendingConnectorAccountId("linear", "req-complete-2"),
      orgId: orgA,
      provider: "linear",
      scope: "org",
      status: "needsAuth",
    });
    await t.run(async (ctx) => {
      await ctx.db.patch("connectorConnections", pending, {
        oauthRequestId: "req-complete-2",
      });
    });
    const result = await aliceCtx.action(
      api.connectorConnect.completeLinearConnect,
      {
        connectionId: pending,
        orgId: orgA,
        scope: "org",
      }
    );
    expect(result).toMatchObject({
      connectionId: pending,
      displayLabel: "pottos",
      status: "connected",
    });
    const listed = await aliceCtx.query(api.connectorConnections.listByOrg, {
      orgId: orgA,
    });
    expect(listed).toHaveLength(2);
    expect(listed.find((row) => row._id === first)).toMatchObject({
      connectedAccountId: "bfd5bc8a-0044-4f8e-9134-c1db5c9cf7f8",
      displayLabel: "michitogawara",
      status: "connected",
    });
    expect(listed.find((row) => row._id === pending)).toMatchObject({
      connectedAccountId: "aaaaaaaa-1111-4f8e-9134-c1db5c9cf7f8",
      displayLabel: "pottos",
      status: "connected",
    });
  });

  it("returns pending while the request is still initiated", async () => {
    configureOpenConnector();
    vi.stubGlobal("fetch", async () =>
      jsonResponse({
        appId: null,
        connectionRequestId: "req-pending-1",
        errorCode: null,
        errorMessage: null,
        service: "linear",
        status: "initiated",
      })
    );
    const t = fresh();
    const { aliceCtx, orgA } = await seedOrg(t);
    const connectionId = await aliceCtx.mutation(
      api.connectorConnections.upsert,
      {
        connectedAccountId: pendingConnectorAccountId("linear"),
        orgId: orgA,
        provider: "linear",
        scope: "org",
        status: "needsAuth",
      }
    );
    await t.run(async (ctx) => {
      await ctx.db.patch("connectorConnections", connectionId, {
        oauthRequestId: "req-pending-1",
      });
    });
    await expect(
      aliceCtx.action(api.connectorConnect.completeLinearConnect, {
        connectionId,
        orgId: orgA,
        scope: "org",
      })
    ).resolves.toMatchObject({ connectionId, status: "pending" });
  });

  it("does not accept a browser connectedAccountId argument", async () => {
    const t = fresh();
    const { aliceCtx, orgA } = await seedOrg(t);
    await expect(
      aliceCtx.action(api.connectorConnect.completeLinearConnect, {
        connectedAccountId: "spoofed-from-browser",
        orgId: orgA,
        scope: "org",
      } as never)
    ).rejects.toThrow(/unexpected field `connectedAccountId`/i);
    await expect(
      aliceCtx.action(api.connectorConnect.completeLinearConnect, {
        orgId: orgA,
        scope: "org",
      })
    ).resolves.toMatchObject({ status: "missing_request" });
  });

  it("blocks members from completing an org-scope connect", async () => {
    const t = fresh();
    const { memberCtx, orgA } = await seedOrg(t);
    await expect(
      memberCtx.action(api.connectorConnect.completeLinearConnect, {
        orgId: orgA,
        scope: "org",
      })
    ).rejects.toThrow(/admin access required/i);
  });
});
