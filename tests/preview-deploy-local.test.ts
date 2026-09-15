import { describe, expect, it } from "vitest";

import {
  formatLocalDeployPlan,
  parseGithubKvFile,
  parseLocalDeployArgv,
  planLocalPreviewDeploy,
} from "../scripts/preview-deploy-local.mjs";

describe(parseLocalDeployArgv, () => {
  it("requires a positive PR number and builds pr-N", () => {
    expect(
      parseLocalDeployArgv([
        "node",
        "scripts/preview-deploy-local.mjs",
        "--pr",
        "62",
      ])
    ).toMatchObject({
      dryRun: false,
      pr: 62,
      previewName: "pr-62",
      skipCloudflare: false,
    });
  });
});

describe(planLocalPreviewDeploy, () => {
  it("decrypts, claims pr-N, uploads the preview alias, syncs auth, and seeds login", () => {
    const plan = planLocalPreviewDeploy({
      exclude: ["pr-48", "cursor-open-branch"],
      previewName: "pr-62",
      prune: true,
      pruneNames: ["pr-46", "cursor-old-branch"],
    });
    const ids = plan.steps.map((step) => step.id);
    expect(ids).toStrictEqual([
      "decrypt",
      "prune",
      "convex",
      "cloudflare",
      "sync-auth",
      "seed",
    ]);
    expect(plan.previewName).toBe("pr-62");
    const joined = plan.steps.map((step) => step.argv.join(" ")).join("\n");
    expect(joined).toContain(
      "convex-preview-deploy.mjs --dotenv .env.preview --preview-name pr-62"
    );
    expect(joined).toContain(
      "versions upload --env preview --preview-alias pr-62"
    );
    expect(joined).toMatch(
      /sync-convex-auth-env\.mjs[\s\S]*seed-preview-login\.mjs/
    );
  });

  it("never targets production or staging from the local preview path", () => {
    const joined = planLocalPreviewDeploy({
      previewName: "pr-62",
      prune: true,
    })
      .steps.map((step) => step.argv.join(" "))
      .join("\n");
    expect(joined).not.toContain("--prod");
    expect(joined).not.toContain("tahcode-staging");
    expect(joined).not.toContain('wrangler deploy --env=""');
  });

  it("can skip Cloudflare and seed", () => {
    const plan = planLocalPreviewDeploy({
      previewName: "pr-62",
      skipCloudflare: true,
      skipSeed: true,
    });
    expect(plan.steps.map((step) => step.id)).toStrictEqual([
      "decrypt",
      "convex",
    ]);
  });
});

describe(formatLocalDeployPlan, () => {
  it("shows dotenvx for auth sync and seed", () => {
    const lines = formatLocalDeployPlan(
      planLocalPreviewDeploy({ previewName: "pr-12" })
    );
    expect(
      lines.some((line) => line.startsWith("sync-auth: npx dotenvx"))
    ).toBeTruthy();
    expect(
      lines.some((line) => line.startsWith("seed: npx dotenvx"))
    ).toBeTruthy();
  });
});

describe(parseGithubKvFile, () => {
  it("reads GITHUB_ENV / GITHUB_OUTPUT lines", () => {
    expect(
      parseGithubKvFile(
        "CONVEX_URL=https://able-fox-1.convex.cloud\ncloudflare_url=https://example.invalid\n"
      )
    ).toMatchObject({
      CONVEX_URL: "https://able-fox-1.convex.cloud",
      cloudflare_url: "https://example.invalid",
    });
  });
});
