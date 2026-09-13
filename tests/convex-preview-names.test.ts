import { describe, expect, it } from "vitest";

import {
  SHARED_PREVIEW_NAME,
  isDeploymentQuotaError,
  nextPreviewClaim,
  previewNameCandidates,
  slugPreviewName,
  splitNameList,
} from "../scripts/convex-preview-names.mjs";

describe(slugPreviewName, () => {
  it("matches the deploy.yml branch slug (40 chars, non-alnum to hyphen)", () => {
    expect(slugPreviewName("cursor/restart-bridge-after-relink-935b")).toBe(
      "cursor-restart-bridge-after-relink-935b"
    );
    expect(slugPreviewName("cursor/register-this-mac-01a8")).toBe(
      "cursor-register-this-mac-01a8"
    );
  });

  it("drops empty slugs", () => {
    expect(slugPreviewName("///")).toBe("");
    expect(slugPreviewName("")).toBe("");
  });
});

describe(previewNameCandidates, () => {
  it("prefers pr-N, then shared ci, then merged-branch fallbacks", () => {
    expect(
      previewNameCandidates({
        exclude: "",
        fallbacks: "cursor/register-this-mac-01a8,cursor/chat-job-cancel-b849",
        preferred: "pr-19",
      })
    ).toStrictEqual([
      "pr-19",
      SHARED_PREVIEW_NAME,
      "cursor-register-this-mac-01a8",
      "cursor-chat-job-cancel-b849",
    ]);
  });

  it("does not steal an open PR's preview name", () => {
    expect(
      previewNameCandidates({
        exclude: "cursor/tah-17-multica-runtime-drop-6fb3,pr-18",
        fallbacks:
          "cursor/tah-17-multica-runtime-drop-6fb3,cursor/register-this-mac-01a8",
        preferred: "pr-19",
      })
    ).toStrictEqual([
      "pr-19",
      SHARED_PREVIEW_NAME,
      "cursor-register-this-mac-01a8",
    ]);
  });

  it("dedupes the preferred name when it also appears in fallbacks", () => {
    expect(
      previewNameCandidates({
        fallbacks: "pr-19,ci",
        preferred: "pr-19",
      })
    ).toStrictEqual(["pr-19", SHARED_PREVIEW_NAME]);
  });
});

describe(isDeploymentQuotaError, () => {
  it("recognizes the Convex 40-deployment quota error from CI", () => {
    expect(
      isDeploymentQuotaError(
        "Error fetching POST  https://api.convex.dev/api/claim_preview_deployment 400 Bad Request: DeploymentQuotaReached: Your team's deployment quota of 40 has been reached."
      )
    ).toBeTruthy();
    expect(isDeploymentQuotaError("fetch failed")).toBeFalsy();
  });
});

describe(nextPreviewClaim, () => {
  it("walks the candidate list after a quota failure", () => {
    const names = ["pr-19", "ci", "cursor-register-this-mac-01a8"];
    expect(nextPreviewClaim(names, "pr-19")).toBe("ci");
    expect(nextPreviewClaim(names, "ci")).toBe("cursor-register-this-mac-01a8");
    expect(nextPreviewClaim(names, "cursor-register-this-mac-01a8")).toBeNull();
  });
});

describe(splitNameList, () => {
  it("splits a comma list and drops empties", () => {
    expect(splitNameList("a, b,,c")).toStrictEqual(["a", "b", "c"]);
    expect(splitNameList("")).toStrictEqual([]);
  });
});
