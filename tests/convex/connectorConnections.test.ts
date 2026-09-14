import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
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

async function seedOrg(t: ReturnType<typeof fresh>) {
  const alice = await insertUser(t, { handle: "alice" });
  const bob = await insertUser(t, { handle: "bob" });
  const member = await insertUser(t, { handle: "member" });
  const aliceCtx = asUser(t, alice);
  const bobCtx = asUser(t, bob);
  const orgA = await aliceCtx.mutation(api.orgs.create, { name: "Alpha" });
  const orgB = await bobCtx.mutation(api.orgs.create, { name: "Beta" });
  await t.run(async (ctx) => {
    await ctx.db.insert("orgMembers", {
      orgId: orgA,
      role: "member",
      userId: member,
    });
  });
  return {
    alice,
    aliceCtx,
    bob,
    bobCtx,
    member,
    memberCtx: asUser(t, member),
    orgA,
    orgB,
  };
}

describe("connectorConnections CRUD", () => {
  it("upserts an org-scoped Linear mapping with an opaque account id", async () => {
    const t = fresh();
    const { alice, aliceCtx, orgA } = await seedOrg(t);
    const connectionId = await aliceCtx.mutation(
      api.connectorConnections.upsert,
      {
        connectedAccountId: "ca_default-michitogawara",
        displayLabel: "default · michitogawara",
        orgId: orgA,
        provider: "Linear",
        scope: "org",
      }
    );
    const listed = await aliceCtx.query(api.connectorConnections.listByOrg, {
      orgId: orgA,
      provider: "linear",
    });
    expect(listed).toHaveLength(1);
    expect(listed[0]).toMatchObject({
      _id: connectionId,
      connectedAccountId: "ca_default-michitogawara",
      createdBy: alice,
      displayLabel: "default · michitogawara",
      orgId: orgA,
      provider: "linear",
      scope: "org",
      status: "connected",
    });
    expect(listed[0]?.lastVerifiedAt).toStrictEqual(expect.any(Number));
  });

  it("disconnects softly and reuses the same row on reconnect", async () => {
    const t = fresh();
    const { aliceCtx, orgA } = await seedOrg(t);
    const connectionId = await aliceCtx.mutation(
      api.connectorConnections.upsert,
      {
        connectedAccountId: "ca_default-michitogawara",
        orgId: orgA,
        provider: "linear",
        scope: "org",
      }
    );
    await aliceCtx.mutation(api.connectorConnections.disconnect, {
      connectionId,
    });
    const disconnected = await aliceCtx.query(
      api.connectorConnections.listByOrg,
      { orgId: orgA }
    );
    expect(disconnected[0]?.status).toBe("disconnected");
    expect(disconnected[0]?.connectedAccountId).toBe(
      "ca_default-michitogawara"
    );
    const reused = await aliceCtx.mutation(api.connectorConnections.upsert, {
      connectedAccountId: "ca_default-michitogawara",
      orgId: orgA,
      provider: "linear",
      scope: "org",
    });
    expect(reused).toBe(connectionId);
    expect(
      (
        await aliceCtx.query(api.connectorConnections.listByOrg, {
          orgId: orgA,
        })
      )[0]?.status
    ).toBe("connected");
  });

  it("never persists token or secret field names on the mapping row", async () => {
    const t = fresh();
    const { aliceCtx, orgA } = await seedOrg(t);
    const connectionId = await aliceCtx.mutation(
      api.connectorConnections.upsert,
      {
        connectedAccountId: "ca_default-michitogawara",
        orgId: orgA,
        provider: "linear",
        scope: "org",
      }
    );
    const stored = await t.run(async (ctx) => {
      const row = await ctx.db.get("connectorConnections", connectionId);
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

  it("lets a member upsert and disconnect their own user-scoped row", async () => {
    const t = fresh();
    const { member, memberCtx, orgA } = await seedOrg(t);
    const connectionId = await memberCtx.mutation(
      api.connectorConnections.upsert,
      {
        connectedAccountId: "ca_user-member",
        orgId: orgA,
        provider: "linear",
        scope: "user",
      }
    );
    const listed = await memberCtx.query(api.connectorConnections.listByOrg, {
      orgId: orgA,
    });
    expect(listed).toHaveLength(1);
    expect(listed[0]?.userId).toBe(member);
    await memberCtx.mutation(api.connectorConnections.disconnect, {
      connectionId,
    });
    expect(
      (
        await memberCtx.query(api.connectorConnections.listByOrg, {
          orgId: orgA,
        })
      )[0]?.status
    ).toBe("disconnected");
  });
});

describe("connectorConnections authz", () => {
  it("requires auth and org membership to list", async () => {
    const t = fresh();
    const { orgA } = await seedOrg(t);
    await expect(
      t.query(api.connectorConnections.listByOrg, { orgId: orgA })
    ).rejects.toThrow(/not authenticated/i);
    const outsider = await insertUser(t, { handle: "outsider" });
    await expect(
      asUser(t, outsider).query(api.connectorConnections.listByOrg, {
        orgId: orgA,
      })
    ).rejects.toThrow(/not a member of this organization/i);
  });

  it("blocks members from org-scope upsert and disconnect", async () => {
    const t = fresh();
    const { aliceCtx, memberCtx, orgA } = await seedOrg(t);
    await expect(
      memberCtx.mutation(api.connectorConnections.upsert, {
        connectedAccountId: "ca_org-linear",
        orgId: orgA,
        provider: "linear",
        scope: "org",
      })
    ).rejects.toThrow(/admin access required/i);
    const connectionId = await aliceCtx.mutation(
      api.connectorConnections.upsert,
      {
        connectedAccountId: "ca_org-linear",
        orgId: orgA,
        provider: "linear",
        scope: "org",
      }
    );
    await expect(
      memberCtx.mutation(api.connectorConnections.disconnect, { connectionId })
    ).rejects.toThrow(/admin access required/i);
    const listed = await memberCtx.query(api.connectorConnections.listByOrg, {
      orgId: orgA,
    });
    expect(listed).toHaveLength(1);
    expect(listed[0]?.scope).toBe("org");
  });

  it("hides another member's user-scoped row from members but not admins", async () => {
    const t = fresh();
    const { aliceCtx, memberCtx, orgA } = await seedOrg(t);
    await memberCtx.mutation(api.connectorConnections.upsert, {
      connectedAccountId: "ca_secret-user",
      displayLabel: "member linear",
      orgId: orgA,
      provider: "linear",
      scope: "user",
    });
    const other = await insertUser(t, { handle: "other" });
    await t.run(async (ctx) => {
      await ctx.db.insert("orgMembers", {
        orgId: orgA,
        role: "member",
        userId: other,
      });
    });
    await expect(
      asUser(t, other).query(api.connectorConnections.listByOrg, {
        orgId: orgA,
      })
    ).resolves.toHaveLength(0);
    const adminView = await aliceCtx.query(api.connectorConnections.listByOrg, {
      orgId: orgA,
    });
    expect(adminView).toHaveLength(1);
    expect(adminView[0]?.connectedAccountId).toBe("ca_secret-user");
  });

  it("rejects cross-org upsert, list, and disconnect", async () => {
    const t = fresh();
    const { aliceCtx, bobCtx, orgA, orgB } = await seedOrg(t);
    const connectionId = await aliceCtx.mutation(
      api.connectorConnections.upsert,
      {
        connectedAccountId: "ca_alpha",
        orgId: orgA,
        provider: "linear",
        scope: "org",
      }
    );
    await expect(
      bobCtx.query(api.connectorConnections.listByOrg, { orgId: orgA })
    ).rejects.toThrow(/not a member of this organization/i);
    await expect(
      bobCtx.mutation(api.connectorConnections.upsert, {
        connectedAccountId: "ca_stolen",
        orgId: orgA,
        provider: "linear",
        scope: "org",
      })
    ).rejects.toThrow(/not a member of this organization/i);
    await expect(
      bobCtx.mutation(api.connectorConnections.disconnect, { connectionId })
    ).rejects.toThrow(/not a member of this organization/i);
    await expect(
      aliceCtx.mutation(api.connectorConnections.upsert, {
        connectedAccountId: "ca_beta",
        orgId: orgB,
        provider: "linear",
        scope: "org",
      })
    ).rejects.toThrow(/not a member of this organization/i);
  });

  it("rejects token-like connectedAccountId values", async () => {
    const t = fresh();
    const { aliceCtx, orgA } = await seedOrg(t);
    await expect(
      aliceCtx.mutation(api.connectorConnections.upsert, {
        connectedAccountId: "lin_oauth_should-never-be-stored",
        orgId: orgA,
        provider: "linear",
        scope: "org",
      })
    ).rejects.toThrow(/opaque/i);
  });

  it("lets an admin disconnect another user's user-scoped row", async () => {
    const t = fresh();
    const { aliceCtx, memberCtx, orgA } = await seedOrg(t);
    const connectionId = await memberCtx.mutation(
      api.connectorConnections.upsert,
      {
        connectedAccountId: "ca_member-linear",
        orgId: orgA,
        provider: "linear",
        scope: "user",
      }
    );
    await aliceCtx.mutation(api.connectorConnections.disconnect, {
      connectionId,
    });
    expect(
      (
        await aliceCtx.query(api.connectorConnections.listByOrg, {
          orgId: orgA,
        })
      )[0]?.status
    ).toBe("disconnected");
  });
});
