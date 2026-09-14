import { describe, expect, it } from "vitest";

import {
  LINEAR_CREATE_ISSUE_ACTION,
  LINEAR_LIST_ISSUES_ACTION,
  LINEAR_SEARCH_ISSUES_ACTION,
  LINEAR_UPDATE_ISSUE_ACTION,
  linearActionInput,
  sanitizeConnectorToolResult,
} from "../shared/linearAgentTools.ts";

describe(linearActionInput, () => {
  it("maps list/search/create/update onto OpenConnector action ids", () => {
    expect(
      linearActionInput("list_linear_issues", { limit: 20, projectId: "p1" })
    ).toStrictEqual({
      actionId: LINEAR_LIST_ISSUES_ACTION,
      input: { first: 20, project_id: "p1" },
    });
    expect(
      linearActionInput("search_linear_issues", { query: "TAH-54" })
    ).toStrictEqual({
      actionId: LINEAR_SEARCH_ISSUES_ACTION,
      input: { query: "TAH-54" },
    });
    expect(
      linearActionInput("create_linear_issue", {
        teamId: "team-1",
        title: "New",
      })
    ).toStrictEqual({
      actionId: LINEAR_CREATE_ISSUE_ACTION,
      input: { team_id: "team-1", title: "New" },
    });
    expect(
      linearActionInput("update_linear_issue", {
        issueId: "TAH-1",
        title: "Renamed",
      })
    ).toStrictEqual({
      actionId: LINEAR_UPDATE_ISSUE_ACTION,
      input: { issueId: "TAH-1", title: "Renamed" },
    });
  });
});

describe(sanitizeConnectorToolResult, () => {
  it("drops alias / tokens and redacts vendor hostnames", () => {
    expect(
      sanitizeConnectorToolResult({
        alias: "work",
        connectedAccountId: "ca_secret",
        issues: [
          {
            title: "ok",
            url: "https://linear.app/tahcode/issue/TAH-54",
          },
        ],
        note: "see https://tahcode-open-connector.gawara.workers.dev",
      })
    ).toStrictEqual({
      issues: [
        {
          title: "ok",
          url: "https://linear.app/tahcode/issue/TAH-54",
        },
      ],
      note: "[redacted]",
    });
  });
});
