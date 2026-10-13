import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  ALLOWED_WORKERS,
  assertAllowedWorker,
  assertSafeWranglerArgs,
  convexPausePlan,
  isPausedCronSource,
  PAUSE_TARGETS,
  parsePauseArgv,
  planInfraPause,
  resolvePauseTargets,
  wranglerPauseArgs,
} from "../scripts/infra-pause.mjs";
import { PAUSED_STATUS, PAUSED_TITLE } from "../worker/paused.ts";

describe(parsePauseArgv, () => {
  it("defaults to dry-run for every target", () => {
    expect(parsePauseArgv(["node", "scripts/infra-pause.mjs"])).toMatchObject({
      apply: false,
      cloudflare: true,
      convex: true,
      target: "all",
    });
  });

  it("requires --apply to change live infrastructure", () => {
    expect(
      parsePauseArgv(["node", "scripts/infra-pause.mjs", "--apply"])
    ).toMatchObject({ apply: true });
  });
});

describe(resolvePauseTargets, () => {
  it("expands all to production, staging, then preview", () => {
    expect(
      resolvePauseTargets("all").map((target) => target.name)
    ).toStrictEqual(["production", "staging", "preview"]);
  });

  it("rejects unknown targets", () => {
    expect(() => resolvePauseTargets("dev")).toThrow(/Unknown pause target/);
  });
});

describe("pause worker guards", () => {
  it("only allows the three tahcode Workers", () => {
    expect([...ALLOWED_WORKERS].sort()).toStrictEqual([
      "tahcode",
      "tahcode-preview",
      "tahcode-staging",
    ]);
    expect(() => assertAllowedWorker("team-harness")).toThrow(
      /Refusing Worker/
    );
  });

  it("builds a paused wrangler deploy and refuses delete / R2", () => {
    expect(wranglerPauseArgs(PAUSE_TARGETS.production)).toStrictEqual([
      "deploy",
      "--config",
      "wrangler.paused.jsonc",
      "--env",
      "",
    ]);
    expect(wranglerPauseArgs(PAUSE_TARGETS.staging)).toContain("staging");
    expect(() =>
      assertSafeWranglerArgs(["delete", "--config", "wrangler.paused.jsonc"])
    ).toThrow(/delete/);
    expect(() => assertSafeWranglerArgs(["deploy"])).toThrow(
      /wrangler.paused.jsonc/
    );
  });
});

describe(convexPausePlan, () => {
  it("deploys empty crons on production and staging only", () => {
    expect(convexPausePlan(PAUSE_TARGETS.production)).toMatchObject({
      action: "deploy-crons",
      argv: ["convex", "deploy", "--yes"],
    });
    expect(convexPausePlan(PAUSE_TARGETS.staging).argv).toStrictEqual([
      "convex",
      "deploy",
      "--yes",
    ]);
  });

  it("prunes preview deployments and never targets prod Convex", () => {
    const plan = convexPausePlan(PAUSE_TARGETS.preview);
    expect(plan.action).toBe("prune-previews");
    expect(plan.argv.join(" ")).toContain("preview-prune.mjs");
    expect(plan.argv.join(" ")).toContain("--include-ci");
    expect(plan.argv.join(" ")).not.toContain("--prod");
  });
});

describe(planInfraPause, () => {
  it("plans Worker 503 plus Convex stop for every target", () => {
    const steps = planInfraPause({
      apply: false,
      cloudflare: true,
      convex: true,
      targets: resolvePauseTargets("all"),
    });
    expect(steps.map((step) => step.action)).toStrictEqual([
      "wrangler-deploy-paused",
      "deploy-crons",
      "wrangler-deploy-paused",
      "deploy-crons",
      "wrangler-deploy-paused",
      "prune-previews",
    ]);
    expect(
      steps.some((step) => JSON.stringify(step).includes("wrangler delete"))
    ).toBeFalsy();
  });
});

describe("paused artifacts", () => {
  it("serves a Japanese 503 page", async () => {
    const { default: paused } = await import("../worker/paused.ts");
    const response = paused.fetch();
    expect(PAUSED_STATUS).toBe(503);
    expect(response.status).toBe(503);
    expect(response.headers.get("Retry-After")).toBe("86400");
    const body = await response.text();
    expect(body).toContain(PAUSED_TITLE);
    expect(body).toContain('lang="ja"');
  });

  it("has no scheduled Convex jobs while paused", () => {
    const source = readFileSync("convex/crons.ts", "utf-8");
    expect(isPausedCronSource(source)).toBeTruthy();
  });
});

describe("paused workflows", () => {
  it("stops automatic deploy and preview prune", () => {
    const deploy = readFileSync(".github/workflows/deploy.yml", "utf-8");
    const prune = readFileSync(".github/workflows/preview-prune.yml", "utf-8");
    expect(deploy).toContain("INFRA PAUSED");
    expect(deploy).not.toContain("pull_request:");
    expect(deploy).not.toMatch(/branches:\s*\[production, staging\]/);
    expect(prune).toContain("INFRA PAUSED");
    expect(prune).not.toContain("schedule:");
  });

  it("stops automatic publish and desktop jobs", () => {
    const publish = readFileSync(".github/workflows/publish-cli.yml", "utf-8");
    const desktop = readFileSync(".github/workflows/desktop.yml", "utf-8");
    expect(publish).toContain("INFRA PAUSED");
    expect(publish).not.toContain("branches: [main]");
    expect(desktop).toContain("INFRA PAUSED");
    expect(desktop).not.toContain("pull_request:");
    expect(desktop).not.toMatch(/\n {4}tags:\n/);
  });

  it("applies the pause from a same-repo PR", () => {
    const yml = readFileSync(".github/workflows/infra-pause.yml", "utf-8");
    expect(yml).toContain("scripts/infra-pause.mjs");
    expect(yml).toContain("--apply");
    expect(yml).toContain("--decrypt");
    expect(yml).toContain("name: production");
    expect(yml).not.toContain("wrangler delete");
  });

  it("does not delete production Convex from the pause workflow", () => {
    const yml = readFileSync(".github/workflows/infra-pause.yml", "utf-8");
    expect(yml).not.toContain("convex deploy --prod");
    expect(yml).not.toContain("wrangler delete");
  });
});
