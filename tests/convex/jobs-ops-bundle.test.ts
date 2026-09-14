import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { sha256Hex } from "../../convex/lib/ids";
import schema from "../../convex/schema";
import { TAHCODE_OPS_MCP_NAME } from "../../shared/opsMcp.ts";

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

const TOKEN = "th_ops_bundle_test";

describe("jobs claim opsBundle", () => {
  it("attaches visible connectors and @linear mentions for the claimed job", async () => {
    const t = fresh();
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
    const connectionId = await aliceCtx.mutation(
      api.connectorConnections.upsert,
      {
        connectedAccountId: "ca_default-alice",
        displayLabel: "pottos",
        orgId,
        provider: "linear",
        scope: "org",
      }
    );
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
      body: "@claude please use @linear/pottos",
      chatId,
    });
    const claimed = await t.mutation(api.jobs.claimNext, {
      runtimeId,
      token: TOKEN,
    });
    if (!claimed) {
      throw new Error("expected a claimed job");
    }
    expect(claimed.driverKind).toBe("claudeAgent");
    expect(claimed.opsBundle.mcp.attachment).toBe("mcp-config");
    expect(claimed.opsBundle.mentionedConnectors).toStrictEqual([
      { handle: "linear/pottos", provider: "linear" },
    ]);
    expect(claimed.opsBundle.connectors).toStrictEqual([
      expect.objectContaining({
        connectedAccountId: "ca_default-alice",
        connectionId,
        displayLabel: "pottos",
        provider: "linear",
        status: "connected",
      }),
    ]);
    expect(claimed.opsBundle.mcp.servers).toStrictEqual(
      expect.arrayContaining([
        expect.objectContaining({
          inject: true,
          kind: "tahcode-ops",
          name: TAHCODE_OPS_MCP_NAME,
        }),
        expect.objectContaining({
          connectionId,
          inject: false,
          kind: "connector",
          provider: "linear",
        }),
      ])
    );
  });
});
