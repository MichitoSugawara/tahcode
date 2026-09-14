import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

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

describe("startLinearConnect", () => {
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
});
