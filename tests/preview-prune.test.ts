import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { SHARED_PREVIEW_NAME } from "../scripts/convex-preview-names.mjs";
import {
  assertPreviewWorkerName,
  deployedVersionIdsFrom,
  planCloudflarePreviewPrune,
} from "../scripts/preview-prune-cloudflare.mjs";
import {
  parsePruneArgv,
  planConvexHygiene,
  refuseApplyWithoutOpenPrs,
} from "../scripts/preview-prune.mjs";
import { PREVIEW_WORKER_NAME } from "../scripts/wrangler-classify.mjs";

describe(parsePruneArgv, () => {
  it("defaults to dry-run for both Convex and Cloudflare", () => {
    expect(parsePruneArgv(["node", "scripts/preview-prune.mjs"])).toMatchObject(
      {
        apply: false,
        cloudflare: true,
        convex: true,
        sweepUnmapped: false,
        worker: PREVIEW_WORKER_NAME,
      }
    );
  });

  it("requires --apply to delete", () => {
    expect(
      parsePruneArgv(["node", "scripts/preview-prune.mjs", "--apply"])
    ).toMatchObject({ apply: true });
  });
});

describe(planConvexHygiene, () => {
  it("never deletes open pr-N, ci, production, or staging", () => {
    const plan = planConvexHygiene({
      includeCi: false,
      listed: [
        { deployment_type: "prod", name: "dapper-ibex-447" },
        {
          deployment_type: "preview",
          name: "able-fox-1",
          reference: "preview/pr-62",
        },
        {
          deployment_type: "preview",
          name: "zany-owl-295",
          reference: "preview/cursor-old-branch",
        },
      ],
      protectedNames: ["pr-62", "cursor-preview-hygiene-e861"],
      staleIdentifiers: [
        "pr-62",
        SHARED_PREVIEW_NAME,
        "production",
        "staging",
        "pr-46",
        "cursor-old-branch",
      ],
      sweepUnmapped: true,
    });
    expect(
      plan.deletes.map((item) => item.identifier ?? item.deploymentName)
    ).toStrictEqual(["pr-46", "cursor-old-branch"]);
    expect(plan.kept.some((item) => item.identifier === "pr-62")).toBeTruthy();
    expect(
      plan.skipped.some((item) => item.deploymentName === "dapper-ibex-447")
    ).toBeTruthy();
  });

  it("does not sweep a leftover whose deployment name is an open PR", () => {
    const plan = planConvexHygiene({
      listed: [
        {
          deployment_type: "preview",
          name: "kind-cat-9",
          reference: "preview/mystery",
        },
      ],
      protectedDeploymentNames: new Set(["kind-cat-9"]),
      protectedNames: ["pr-62"],
      staleIdentifiers: [],
      sweepUnmapped: true,
    });
    expect(plan.deletes).toStrictEqual([]);
    expect(plan.kept[0]).toMatchObject({
      deploymentName: "kind-cat-9",
      reason: "open-pr-deployment",
    });
  });
});

describe(refuseApplyWithoutOpenPrs, () => {
  it("blocks apply when gh failed and no exclude list was passed", () => {
    expect(
      refuseApplyWithoutOpenPrs({
        apply: true,
        explicitExclude: false,
        openOk: false,
      })
    ).toMatch(/open pull requests/);
    expect(
      refuseApplyWithoutOpenPrs({
        apply: true,
        explicitExclude: true,
        openOk: false,
      })
    ).toBeNull();
    expect(
      refuseApplyWithoutOpenPrs({
        apply: false,
        explicitExclude: false,
        openOk: false,
      })
    ).toBeNull();
  });
});

describe(assertPreviewWorkerName, () => {
  it("allows only tahcode-preview", () => {
    expect(assertPreviewWorkerName(PREVIEW_WORKER_NAME)).toBe(
      PREVIEW_WORKER_NAME
    );
    expect(() => assertPreviewWorkerName("tahcode")).toThrow(/tahcode-preview/);
    expect(() => assertPreviewWorkerName("tahcode-staging")).toThrow(
      /tahcode-preview/
    );
  });
});

describe(planCloudflarePreviewPrune, () => {
  it("keeps open PR aliases, the live version, and recent versions", () => {
    const plan = planCloudflarePreviewPrune({
      aliases: [
        { name: "pr-62", versionId: "keep-open" },
        { name: "pr-46", versionId: "stale-alias" },
        { name: "production", versionId: "never" },
      ],
      deployedVersionIds: new Set(["live-now"]),
      keepVersions: 1,
      openAliases: ["pr-62"],
      versions: [
        {
          annotations: { "workers/preview-alias": "pr-99" },
          id: "newest",
          metadata: { created_on: "2026-09-15T00:00:00Z" },
        },
        {
          id: "live-now",
          metadata: { created_on: "2026-08-01T00:00:00Z" },
        },
        {
          annotations: { "workers/preview-alias": "pr-46" },
          id: "stale-alias",
          metadata: { created_on: "2026-01-01T00:00:00Z" },
        },
        {
          id: "ancient",
          metadata: { created_on: "2025-01-01T00:00:00Z" },
        },
      ],
      worker: PREVIEW_WORKER_NAME,
    });
    expect({
      aliasDeletes: plan.aliasDeletes.map((item) => item.name),
      aliasKept: plan.aliasKept.map((item) => item.name),
      versionDeletes: plan.versionDeletes.map((item) => item.id),
      versionKept: plan.versionKept.map((item) => item.id),
    }).toStrictEqual({
      aliasDeletes: ["pr-46", "pr-99"],
      aliasKept: ["pr-62", "production"],
      versionDeletes: ["stale-alias", "ancient"],
      versionKept: ["newest", "live-now"],
    });
  });
});

describe(deployedVersionIdsFrom, () => {
  it("collects versions that still serve traffic", () => {
    expect(
      deployedVersionIdsFrom([
        {
          versions: [
            { percentage: 100, version_id: "live" },
            { percentage: 0, version_id: "old" },
          ],
        },
      ])
    ).toStrictEqual(new Set(["live"]));
  });
});

describe("preview-prune workflow", () => {
  const yml = readFileSync(".github/workflows/preview-prune.yml", "utf-8");

  it("keeps workflow_dispatch only while infrastructure is paused", () => {
    expect(yml).toContain("INFRA PAUSED");
    expect(yml).toContain("workflow_dispatch:");
    expect(yml).toContain("default: false");
    expect(yml).not.toContain("pull_request:");
    expect(yml).not.toContain("schedule:");
  });

  it("runs the prune CLI with dry-run default and sweep", () => {
    expect(yml).toContain('apply_flag="--dry-run"');
    expect(yml).toContain("--sweep-unmapped");
    expect(yml).toContain("node scripts/preview-prune.mjs");
  });

  it("does not target production or staging Workers", () => {
    expect(yml).not.toContain("tahcode-staging");
    expect(yml).not.toContain("wrangler delete");
    expect(yml).not.toContain("convex deploy --prod");
  });

  it("skips when the preview decrypt key is missing", () => {
    expect(yml).toContain("DOTENV_PRIVATE_KEY_PREVIEW is missing");
    expect(yml).toContain("skip=true");
  });
});
