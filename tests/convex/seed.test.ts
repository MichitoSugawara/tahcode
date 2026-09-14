import { convexTest } from "convex-test";
import { afterEach, describe, expect, it } from "vitest";

import { internal } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import {
  PREVIEW_LOGIN_EMAIL,
  PREVIEW_LOGIN_NAME,
  PREVIEW_ORG_SLUG,
  PRODUCTION_SITE_URL,
} from "../../shared/previewLogin.ts";

const modules = import.meta.glob("../../convex/**/*.*s");

function fresh() {
  return convexTest(schema, modules);
}

const previousSiteUrl = process.env.SITE_URL;

function restoreSiteUrl() {
  if (previousSiteUrl === undefined) {
    delete process.env.SITE_URL;
  } else {
    process.env.SITE_URL = previousSiteUrl;
  }
}

describe("ensurePreviewWorkspace", () => {
  afterEach(restoreSiteUrl);

  it("creates the Preview org and promotes the seeded user to owner", async () => {
    const t = fresh();
    const userId = await t.run(
      async (ctx) =>
        await ctx.db.insert("users", {
          email: PREVIEW_LOGIN_EMAIL,
          handle: "previewreviewer",
          name: PREVIEW_LOGIN_NAME,
        })
    );
    const first = await t.mutation(
      internal.seedHelpers.ensurePreviewWorkspace,
      {
        userId,
      }
    );
    expect(first).toMatchObject({
      created: true,
      slug: PREVIEW_ORG_SLUG,
    });
    const second = await t.mutation(
      internal.seedHelpers.ensurePreviewWorkspace,
      {
        userId,
      }
    );
    expect(second).toMatchObject({
      created: false,
      orgId: first.orgId,
      slug: PREVIEW_ORG_SLUG,
    });
    const membership = await t.run(
      async (ctx) =>
        await ctx.db
          .query("orgMembers")
          .withIndex("by_org_and_user", (q) =>
            q.eq("orgId", first.orgId).eq("userId", userId)
          )
          .unique()
    );
    expect(membership?.role).toBe("owner");
  });
});

describe("ensurePreviewLogin", () => {
  afterEach(restoreSiteUrl);

  it("refuses production SITE_URL", async () => {
    const t = fresh();
    process.env.SITE_URL = PRODUCTION_SITE_URL;
    await expect(
      t.action(internal.seed.ensurePreviewLogin, {})
    ).rejects.toThrow(/disabled on this deployment/);
  });

  it("creates the password user and Preview org on a preview SITE_URL", async () => {
    const t = fresh();
    process.env.SITE_URL = "https://pr-37-tahcode-preview.gawara.workers.dev";
    const result = await t.action(internal.seed.ensurePreviewLogin, {});
    expect(result).toMatchObject({
      created: true,
      email: PREVIEW_LOGIN_EMAIL,
      orgSlug: PREVIEW_ORG_SLUG,
      passwordReset: false,
    });
    const again = await t.action(internal.seed.ensurePreviewLogin, {});
    expect(again).toMatchObject({
      created: false,
      email: PREVIEW_LOGIN_EMAIL,
      orgSlug: PREVIEW_ORG_SLUG,
      passwordReset: true,
      userId: result.userId,
    });
  });
});
