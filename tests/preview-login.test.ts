import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  convexRunArgv,
  previewLoginSeedDeployAllowed,
} from "../scripts/seed-preview-login.mjs";
import {
  PREVIEW_LOGIN_EMAIL,
  PREVIEW_LOGIN_PASSWORD,
  PRODUCTION_SITE_URL,
  previewLoginSeedAllowed,
} from "../shared/previewLogin.ts";

describe(previewLoginSeedAllowed, () => {
  it("allows preview and staging origins", () => {
    expect(
      previewLoginSeedAllowed(
        "https://pr-37-tahcode-preview.gawara.workers.dev"
      )
    ).toBeTruthy();
    expect(
      previewLoginSeedAllowed("https://tahcode-staging.gawara.workers.dev/")
    ).toBeTruthy();
    expect(previewLoginSeedAllowed("http://127.0.0.1:43173")).toBeTruthy();
  });

  it("refuses production and empty SITE_URL", () => {
    expect(previewLoginSeedAllowed(PRODUCTION_SITE_URL)).toBeFalsy();
    expect(previewLoginSeedAllowed(`${PRODUCTION_SITE_URL}/`)).toBeFalsy();
    expect(previewLoginSeedAllowed("")).toBeFalsy();
    expect(previewLoginSeedAllowed("   ")).toBeFalsy();
  });
});

describe(previewLoginSeedDeployAllowed, () => {
  it("allows preview with --preview-name and staging without --prod", () => {
    expect(
      previewLoginSeedDeployAllowed({
        convexArgs: ["--preview-name", "pr-37"],
        deployName: "preview",
      })
    ).toStrictEqual({ allowed: true, reason: "" });
    expect(
      previewLoginSeedDeployAllowed({
        convexArgs: [],
        deployName: "staging",
      })
    ).toStrictEqual({ allowed: true, reason: "" });
  });

  it("refuses production even if DEPLOY_NAME is preview", () => {
    expect(
      previewLoginSeedDeployAllowed({
        convexArgs: ["--prod"],
        deployName: "preview",
      })
    ).toStrictEqual({ allowed: false, reason: "production" });
    expect(
      previewLoginSeedDeployAllowed({
        convexArgs: [],
        deployName: "production",
      })
    ).toStrictEqual({ allowed: false, reason: "production" });
  });

  it("refuses preview without a claimed Convex preview name", () => {
    expect(
      previewLoginSeedDeployAllowed({
        convexArgs: [],
        deployName: "preview",
      })
    ).toStrictEqual({ allowed: false, reason: "missing-preview-name" });
  });
});

describe("seed-preview-login script", () => {
  it("dry-runs the internal Convex function and never passes --prod", () => {
    expect(convexRunArgv(["--preview-name", "pr-12"])).toStrictEqual([
      "convex",
      "run",
      "--preview-name",
      "pr-12",
      "seed:ensurePreviewLogin",
    ]);
    const result = spawnSync(
      process.execPath,
      ["scripts/seed-preview-login.mjs"],
      {
        encoding: "utf-8",
        env: {
          ...process.env,
          CONVEX_ENV_ARGS: "--preview-name pr-12",
          DEPLOY_NAME: "preview",
          DRY_RUN: "1",
        },
      }
    );
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("seed:ensurePreviewLogin");
    expect(result.stdout).not.toContain("--prod");
  });

  it("exits non-zero when pointed at production", () => {
    const result = spawnSync(
      process.execPath,
      ["scripts/seed-preview-login.mjs"],
      {
        encoding: "utf-8",
        env: {
          ...process.env,
          CONVEX_ENV_ARGS: "--prod",
          DEPLOY_NAME: "production",
          DRY_RUN: "1",
        },
      }
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Never seed production");
  });
});

describe("deploy-stack production path", () => {
  it("seeds preview and staging only", () => {
    const yaml = readFileSync(
      ".github/actions/deploy-stack/action.yml",
      "utf-8"
    );
    expect(yaml).toContain("scripts/seed-preview-login.mjs");
    expect(yaml).toMatch(
      /inputs\.name == 'preview' \|\| inputs\.name == 'staging'/
    );
    const productionJob = readFileSync(
      ".github/workflows/deploy.yml",
      "utf-8"
    ).split("production:")[1];
    expect(productionJob).not.toContain("seed-preview-login");
    expect(PREVIEW_LOGIN_EMAIL).toBe("test@test.com");
    expect(PREVIEW_LOGIN_PASSWORD).toBe("test1234");
  });
});
