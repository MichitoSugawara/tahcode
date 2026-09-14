import { describe, expect, it } from "vitest";

import {
  CLAIM_PREVIEW_URL,
  claimPreviewDeployment,
  deletePreviewDeployment,
  functionSpecHasCanaryTools,
  isolatePreferredPreview,
  MANAGEMENT_API_BASE,
  parseClaimedPreviewFromDeployOutput,
  parsePreviewDeployKey,
  PREVIEW_TOOL_CANARIES,
  pruneNameCandidates,
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
  it("requires agentTools plus both connector tool literals", () => {
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
