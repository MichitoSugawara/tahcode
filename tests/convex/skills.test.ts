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

async function seedTwoOrgs(t: ReturnType<typeof fresh>) {
  const alice = await insertUser(t, { handle: "alice" });
  const bob = await insertUser(t, { handle: "bob" });
  const aliceCtx = asUser(t, alice);
  const bobCtx = asUser(t, bob);
  const orgA = await aliceCtx.mutation(api.orgs.create, { name: "Alpha" });
  const orgB = await bobCtx.mutation(api.orgs.create, { name: "Beta" });
  return { alice, aliceCtx, bob, bobCtx, orgA, orgB };
}

describe("skill library CRUD", () => {
  it("creates, lists, updates, and deletes a skill in-org", async () => {
    const t = fresh();
    const { aliceCtx, orgA } = await seedTwoOrgs(t);
    const skillId = await aliceCtx.mutation(api.skills.create, {
      body: "---\nname: review\ndescription: Review diffs\n---\n\nReview carefully.\n",
      name: "Review",
      orgId: orgA,
      slug: "review",
    });
    const listed = await aliceCtx.query(api.skills.listLibrary, {
      orgId: orgA,
    });
    expect(listed).toHaveLength(1);
    expect(listed[0]?.slug).toBe("review");
    const fetched = await aliceCtx.query(api.skills.get, { skillId });
    expect(fetched?.body).toContain("Review carefully");
    await aliceCtx.mutation(api.skills.update, {
      name: "Code review",
      skillId,
    });
    expect((await aliceCtx.query(api.skills.get, { skillId }))?.name).toBe(
      "Code review"
    );
    await aliceCtx.mutation(api.skills.remove, { skillId });
    await expect(
      aliceCtx.query(api.skills.listLibrary, { orgId: orgA })
    ).resolves.toHaveLength(0);
  });

  it("lets an owner create a profile and attach it to a chat", async () => {
    const t = fresh();
    const { aliceCtx, orgA } = await seedTwoOrgs(t);
    const skillId = await aliceCtx.mutation(api.skills.create, {
      body: "Steps",
      description: "Help",
      name: "Helper",
      orgId: orgA,
      slug: "helper",
    });
    const profileId = await aliceCtx.mutation(api.skillProfiles.create, {
      name: "Default",
      orgId: orgA,
      skillIds: [skillId],
    });
    const projectId = await aliceCtx.mutation(api.projects.create, {
      name: "App",
      orgId: orgA,
      visibility: "org",
    });
    const chatId = await aliceCtx.mutation(api.chats.createProjectChat, {
      profileId,
      projectId,
      title: "Room",
      visibility: "inherit",
    });
    const chat = await aliceCtx.query(api.chats.get, { chatId });
    expect(chat?.profileId).toBe(profileId);
    const profiles = await aliceCtx.query(api.skillProfiles.list, {
      orgId: orgA,
    });
    expect(profiles[0]?.skillIds).toStrictEqual([skillId]);
  });
});

describe("skill library authz", () => {
  it("denies cross-org list, get, and attach", async () => {
    const t = fresh();
    const { aliceCtx, bobCtx, orgA, orgB } = await seedTwoOrgs(t);
    const skillId = await aliceCtx.mutation(api.skills.create, {
      body: "secret",
      name: "Secret",
      orgId: orgA,
      slug: "secret",
    });
    await expect(
      bobCtx.query(api.skills.listLibrary, { orgId: orgA })
    ).rejects.toThrow(/not a member of this organization/i);
    await expect(bobCtx.query(api.skills.get, { skillId })).resolves.toBeNull();
    const profileId = await aliceCtx.mutation(api.skillProfiles.create, {
      name: "Alpha pack",
      orgId: orgA,
      skillIds: [skillId],
    });
    const projectB = await bobCtx.mutation(api.projects.create, {
      name: "Other",
      orgId: orgB,
      visibility: "org",
    });
    await expect(
      bobCtx.mutation(api.chats.createProjectChat, {
        profileId,
        projectId: projectB,
        title: "Leak",
        visibility: "inherit",
      })
    ).rejects.toThrow(/profile not found in this organization/i);
    await expect(
      bobCtx.mutation(api.skills.update, {
        name: "Stolen",
        skillId,
      })
    ).rejects.toThrow(/not a member of this organization/i);
    await expect(
      bobCtx.mutation(api.projects.setProfile, {
        profileId,
        projectId: projectB,
      })
    ).rejects.toThrow(/profile not found in this organization/i);
  });

  it("lets a member attach an in-org profile to a visible chat", async () => {
    const t = fresh();
    const { aliceCtx, orgA } = await seedTwoOrgs(t);
    const skillId = await aliceCtx.mutation(api.skills.create, {
      body: "help",
      name: "Helper",
      orgId: orgA,
      slug: "helper",
    });
    const profileId = await aliceCtx.mutation(api.skillProfiles.create, {
      name: "Pack",
      orgId: orgA,
      skillIds: [skillId],
    });
    const projectId = await aliceCtx.mutation(api.projects.create, {
      name: "App",
      orgId: orgA,
      visibility: "org",
    });
    const chatId = await aliceCtx.mutation(api.chats.createProjectChat, {
      projectId,
      title: "Room",
      visibility: "inherit",
    });
    const member = await insertUser(t, { handle: "member" });
    await t.run(async (ctx) => {
      await ctx.db.insert("orgMembers", {
        orgId: orgA,
        role: "member",
        userId: member,
      });
    });
    await asUser(t, member).mutation(api.chats.setProfile, {
      chatId,
      profileId,
    });
    expect(
      (await asUser(t, member).query(api.chats.get, { chatId }))?.profileId
    ).toBe(profileId);
  });

  it("blocks members from writing the library", async () => {
    const t = fresh();
    const { orgA } = await seedTwoOrgs(t);
    const member = await insertUser(t, { handle: "member" });
    await t.run(async (ctx) => {
      await ctx.db.insert("orgMembers", {
        orgId: orgA,
        role: "member",
        userId: member,
      });
    });
    await expect(
      asUser(t, member).mutation(api.skills.create, {
        body: "nope",
        name: "Nope",
        orgId: orgA,
      })
    ).rejects.toThrow(/admin access required/i);
    const listed = await asUser(t, member).query(api.skills.listLibrary, {
      orgId: orgA,
    });
    expect(listed).toStrictEqual([]);
  });
});
