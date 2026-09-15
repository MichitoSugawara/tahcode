import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  CLAIM_PREVIEW_URL,
  claimPreviewDeployment,
  deletePreviewDeployment,
  functionSpecHasCanaryTools,
  getPreviewDeploymentByReference,
  isForbiddenPreviewIdentifier,
  isolatePreferredPreview,
  listProjectDeployments,
  MANAGEMENT_API_BASE,
  parseClaimedPreviewFromDeployOutput,
  parseDeploymentList,
  parsePreviewDeployKey,
  PREVIEW_TOOL_CANARIES,
  previewIdentifierFromDeployment,
  pruneNameCandidates,
  resolvePreviewDeployment,
} from "../scripts/convex-preview-isolate.mjs";
import { SHARED_PREVIEW_NAME } from "../scripts/convex-preview-names.mjs";

const PREVIEW_KEY = "preview:acorn:dalecode|test-token";

describe(parsePreviewDeployKey, () => {
  it("reads team and project slugs from a preview deploy key", () => {
    expect(parsePreviewDeployKey(PREVIEW_KEY)).toStrictEqual({
      projectSlug: "dalecode",
      teamSlug: "acorn",
    });
  });

  it("rejects deployment-scoped or project keys", () => {
    expect(parsePreviewDeployKey("preview:zany-owl-295|abc")).toBeNull();
    expect(parsePreviewDeployKey("project:acorn:dalecode|abc")).toBeNull();
    expect(parsePreviewDeployKey("")).toBeNull();
  });
});

describe("deploy.yml preview lists", () => {
  it("prunes closed PR pr-N leftovers, not only branch slugs", () => {
    const yml = readFileSync(".github/workflows/deploy.yml", "utf-8");
    expect(yml).toContain(
      "--state merged --limit 30 --json number,headRefName"
    );
    expect(yml).toContain(
      "--state closed --limit 50 --json number,headRefName"
    );
    expect(yml).toContain('"pr-\\(.number)"');
  });
});

describe(isForbiddenPreviewIdentifier, () => {
  it("never treats production or staging identifiers as leftovers", () => {
    expect(isForbiddenPreviewIdentifier("production")).toBeTruthy();
    expect(isForbiddenPreviewIdentifier("staging")).toBeTruthy();
    expect(isForbiddenPreviewIdentifier("prod")).toBeTruthy();
    expect(isForbiddenPreviewIdentifier("pr-62")).toBeFalsy();
  });
});

describe(previewIdentifierFromDeployment, () => {
  it("reads preview/pr-N references from Management API rows", () => {
    expect(
      previewIdentifierFromDeployment({
        name: "zany-owl-295",
        reference: "preview/pr-46",
      })
    ).toBe("pr-46");
    expect(previewIdentifierFromDeployment({ previewName: "pr-62" })).toBe(
      "pr-62"
    );
  });
});

describe(parseDeploymentList, () => {
  it("accepts a bare array or a deployments wrapper", () => {
    expect(parseDeploymentList([{ name: "a" }])).toHaveLength(1);
    expect(parseDeploymentList({ deployments: [{ name: "a" }] })).toHaveLength(
      1
    );
  });
});

describe(pruneNameCandidates, () => {
  it("skips this PR, open PRs, and the shared ci name", () => {
    expect(
      pruneNameCandidates({
        exclude: new Set([
          "pr-48",
          "cursor-ux-shell-codex-layout-d576",
          SHARED_PREVIEW_NAME,
        ]),
        names: [
          "pr-46",
          "ci",
          "pr-48",
          "production",
          "staging",
          "cursor-chat-job-cancel-b849",
          "cursor-ux-shell-codex-layout-d576",
        ],
        preferred: "pr-46",
      })
    ).toStrictEqual(["cursor-chat-job-cancel-b849"]);
  });
});

describe(parseClaimedPreviewFromDeployOutput, () => {
  it("reads the leftover identifier and deployment name from CI logs", () => {
    const log = `
▌ Deploying code to deployment:
▌ [Preview] acorn:dalecode:preview/cursor-chat-job-cancel-b849 (dashboard: https://dashboard.convex.dev/t/acorn/dalecode/zany-owl-295)
▌ └─ https://zany-owl-295.convex.cloud
✔ Deployed Convex functions to https://zany-owl-295.convex.cloud
`;
    expect(parseClaimedPreviewFromDeployOutput(log)).toStrictEqual({
      deploymentName: "zany-owl-295",
      previewName: "cursor-chat-job-cancel-b849",
    });
  });
});

describe(functionSpecHasCanaryTools, () => {
  it("requires agentTools plus connector and Linear tool literals", () => {
    expect(
      functionSpecHasCanaryTools(
        JSON.stringify({
          functions: [
            {
              args: { name: { value: PREVIEW_TOOL_CANARIES } },
              identifier: "agentTools.js:invoke",
            },
          ],
        })
      )
    ).toBeTruthy();
    expect(
      functionSpecHasCanaryTools(
        '{"identifier":"agentTools.js:invoke","args":{"name":["list_orgs"]}}'
      )
    ).toBeFalsy();
  });
});

describe(claimPreviewDeployment, () => {
  it("returns ok with the leftover deployment name", async () => {
    const fetchImpl = async (url, init) => {
      expect(url).toBe(CLAIM_PREVIEW_URL);
      expect(init.method).toBe("POST");
      expect(JSON.parse(init.body)).toMatchObject({
        identifier: "cursor-chat-job-cancel-b849",
        reuse: true,
      });
      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            deploymentName: "zany-owl-295",
            instanceUrl: "https://zany-owl-295.convex.cloud",
          }),
      };
    };
    await expect(
      claimPreviewDeployment({
        deployKey: PREVIEW_KEY,
        fetchImpl,
        identifier: "cursor-chat-job-cancel-b849",
      })
    ).resolves.toMatchObject({
      deploymentName: "zany-owl-295",
      kind: "ok",
    });
  });

  it("maps DeploymentQuotaReached to quota (name does not exist)", async () => {
    const fetchImpl = async () => ({
      ok: false,
      status: 400,
      text: async () => "DeploymentQuotaReached: quota of 40",
    });
    await expect(
      claimPreviewDeployment({
        deployKey: PREVIEW_KEY,
        fetchImpl,
        identifier: "pr-46",
      })
    ).resolves.toStrictEqual({ kind: "quota" });
  });
});

describe(deletePreviewDeployment, () => {
  it("POSTs the Management API delete path", async () => {
    const fetchImpl = async (url, init) => {
      expect(url).toBe(
        `${MANAGEMENT_API_BASE}/deployments/zany-owl-295/delete`
      );
      expect(init.method).toBe("POST");
      return { ok: true, status: 200, text: async () => "{}" };
    };
    await expect(
      deletePreviewDeployment({
        deployKey: PREVIEW_KEY,
        deploymentName: "zany-owl-295",
        fetchImpl,
      })
    ).resolves.toStrictEqual({ kind: "ok" });
  });
});

describe(getPreviewDeploymentByReference, () => {
  it("GETs preview/pr-N without claiming", async () => {
    const fetchImpl = async (url, init) => {
      expect(url).toContain("/teams/acorn/projects/dalecode/deployment");
      expect(url).toContain("reference=preview%2Fpr-46");
      expect(init.method ?? "GET").toBe("GET");
      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            deployment_type: "preview",
            name: "zany-owl-295",
          }),
      };
    };
    await expect(
      getPreviewDeploymentByReference({
        deployKey: PREVIEW_KEY,
        fetchImpl,
        identifier: "pr-46",
      })
    ).resolves.toMatchObject({
      deploymentName: "zany-owl-295",
      kind: "ok",
    });
  });
});

describe(listProjectDeployments, () => {
  it("uses the official list_deployments path first", async () => {
    const urls = [];
    const fetchImpl = async (url) => {
      urls.push(url);
      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify([
            { deployment_type: "preview", name: "zany-owl-295" },
            { deployment_type: "prod", name: "dapper-ibex-447" },
          ]),
      };
    };
    const result = await listProjectDeployments({
      deployKey: PREVIEW_KEY,
      fetchImpl,
      projectId: "99",
    });
    expect(urls[0]).toBe(`${MANAGEMENT_API_BASE}/projects/99/list_deployments`);
    expect(result.kind).toBe("ok");
    expect(result.deployments).toHaveLength(2);
  });
});

describe(resolvePreviewDeployment, () => {
  it("does not claim when GET-by-reference succeeds", async () => {
    const methods = [];
    const fetchImpl = async (url, init) => {
      methods.push(init.method ?? "GET");
      expect(String(url).includes("claim_preview_deployment")).toBeFalsy();
      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({ deployment_type: "preview", name: "able-fox-1" }),
      };
    };
    await expect(
      resolvePreviewDeployment({
        allowClaim: true,
        deployKey: PREVIEW_KEY,
        fetchImpl,
        identifier: "pr-62",
      })
    ).resolves.toMatchObject({ deploymentName: "able-fox-1", kind: "ok" });
    expect(methods).toStrictEqual(["GET"]);
  });

  it("refuses production and staging identifiers", async () => {
    await expect(
      resolvePreviewDeployment({
        deployKey: PREVIEW_KEY,
        fetchImpl: async () => {
          throw new Error("network should not run");
        },
        identifier: "production",
      })
    ).resolves.toMatchObject({ kind: "forbidden" });
  });
});

describe(isolatePreferredPreview, () => {
  it("deletes the first existing leftover and skips protected names", async () => {
    const calls = [];
    const fetchImpl = async (url, init) => {
      calls.push({ body: init.body, method: init.method, url });
      if (String(url).includes("claim_preview_deployment")) {
        const identifier = JSON.parse(init.body).identifier;
        if (identifier === "cursor-chat-job-cancel-b849") {
          return {
            ok: true,
            status: 200,
            text: async () =>
              JSON.stringify({ deploymentName: "zany-owl-295" }),
          };
        }
        return {
          ok: false,
          status: 400,
          text: async () => "DeploymentQuotaReached",
        };
      }
      return { ok: true, status: 200, text: async () => "{}" };
    };

    const result = await isolatePreferredPreview({
      deployKey: PREVIEW_KEY,
      exclude: new Set(["pr-48", SHARED_PREVIEW_NAME]),
      fetchImpl,
      preferred: "pr-46",
      pruneNames: [
        "pr-46",
        "ci",
        "pr-48",
        "cursor-missing-preview",
        "cursor-chat-job-cancel-b849",
      ],
    });

    expect(result.deleted).toStrictEqual([
      {
        deploymentName: "zany-owl-295",
        identifier: "cursor-chat-job-cancel-b849",
      },
    ]);
    expect(
      calls.some((call) =>
        String(call.url).includes("/deployments/zany-owl-295/delete")
      )
    ).toBeTruthy();
  });
});
