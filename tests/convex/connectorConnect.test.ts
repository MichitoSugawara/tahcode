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

  it("marks an org Linear mapping needsAuth without storing a token", async () => {
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
      ready: false,
      reason: "oauth_not_configured",
    });
    const listed = await aliceCtx.query(api.connectorConnections.listByOrg, {
      orgId: orgA,
      provider: "linear",
    });
    expect(listed).toHaveLength(1);
    expect(listed[0]).toMatchObject({
      _id: result.connectionId,
      connectedAccountId: pendingConnectorAccountId("linear"),
      orgId: orgA,
      provider: "linear",
      scope: "org",
      status: "needsAuth",
    });
    const stored = await t.run(async (ctx) => {
      const row = await ctx.db.get("connectorConnections", result.connectionId);
      if (!row) {
        throw new Error("expected connection row");
      }
      return Object.keys(row).sort();
    });
    expect(stored).not.toStrictEqual(
      expect.arrayContaining([
        "accessToken",
        "refreshToken",
        "clientSecret",
        "token",
      ])
    );
  });

  it("does not downgrade a connected org mapping", async () => {
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
    expect(result.connectionId).toBe(connectionId);
    expect(
      (
        await aliceCtx.query(api.connectorConnections.listByOrg, {
          orgId: orgA,
        })
      )[0]
    ).toMatchObject({
      connectedAccountId: "ca_default-linear",
      status: "connected",
    });
  });

  it("re-authorizes a disconnected mapping and keeps the opaque id", async () => {
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
        orgId: orgA,
        scope: "org",
      }
    );
    expect(result.connectionId).toBe(connectionId);
    expect(
      (
        await aliceCtx.query(api.connectorConnections.listByOrg, {
          orgId: orgA,
        })
      )[0]
    ).toMatchObject({
      connectedAccountId: "ca_default-linear",
      status: "needsAuth",
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

  it("lets a member start a user-scoped Linear connect", async () => {
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
        scope: "org",
      }
    );
    const stored = await t.run(async (ctx) => {
      const row = await ctx.db.get("connectorConnections", result.connectionId);
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
      `https://app.test/o/${org?.slug}/connectors?connector=linear&scope=org`
    );
    expect(calls[0]?.body).not.toContain("connectedAccountId");
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
        orgId: orgA,
        scope: "org",
      })
    ).resolves.toMatchObject({ status: "pending" });
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
