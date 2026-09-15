import { describe, expect, it } from "vitest";

import {
  classifyGithubPreviewNames,
  mergeNameLists,
  parseGhPrListJson,
  previewNamesFromPullRequests,
} from "../scripts/preview-github.mjs";

describe(parseGhPrListJson, () => {
  it("reads number and headRefName from gh pr list --json", () => {
    expect(
      parseGhPrListJson(
        JSON.stringify([
          { headRefName: "cursor/preview-hygiene-e861", number: 62 },
          { headRefName: "fix/login", number: 48 },
        ])
      )
    ).toStrictEqual([
      { headRefName: "cursor/preview-hygiene-e861", number: 62 },
      { headRefName: "fix/login", number: 48 },
    ]);
  });

  it("drops malformed rows", () => {
    expect(parseGhPrListJson('{"not":"an-array"}')).toStrictEqual([]);
    expect(parseGhPrListJson('[{"number":0}]')).toStrictEqual([]);
  });
});

describe(previewNamesFromPullRequests, () => {
  it("emits pr-N and the branch slug", () => {
    expect(
      previewNamesFromPullRequests([
        { headRefName: "cursor/chat-job-cancel-b849", number: 46 },
      ])
    ).toStrictEqual(["pr-46", "cursor-chat-job-cancel-b849"]);
  });
});

describe(classifyGithubPreviewNames, () => {
  it("protects open PRs and prunes closed leftovers", () => {
    expect(
      classifyGithubPreviewNames({
        closed: [{ headRefName: "old-branch", number: 40 }],
        merged: [{ headRefName: "cursor/chat-job-cancel-b849", number: 46 }],
        open: [{ headRefName: "cursor/preview-hygiene-e861", number: 62 }],
      })
    ).toStrictEqual({
      exclude: ["pr-62", "cursor-preview-hygiene-e861"],
      prune: ["pr-40", "old-branch", "pr-46", "cursor-chat-job-cancel-b849"],
    });
  });

  it("does not prune an open PR that also appears in closed history", () => {
    expect(
      classifyGithubPreviewNames({
        closed: [{ headRefName: "reopened", number: 62 }],
        merged: [],
        open: [{ headRefName: "reopened", number: 62 }],
      })
    ).toStrictEqual({
      exclude: ["pr-62", "reopened"],
      prune: [],
    });
  });
});

describe(mergeNameLists, () => {
  it("slugs and dedupes comma-style leftovers", () => {
    expect(mergeNameLists(["pr-46", "PR-46"], ["cursor/Foo"])).toStrictEqual([
      "pr-46",
      "cursor-foo",
    ]);
  });
});
