import { describe, expect, it } from "vitest";

import {
  CONNECTOR_ACTION_CATALOG,
  LINEAR_LIST_TEAMS_ACTION,
  connectorActionInputSchema,
  hasConnectorActions,
  isConnectorActionToolName,
  mapConnectorActionInput,
  materializeConnectorTools,
} from "../shared/connectorActionCatalog.ts";
import type { ConnectorActionDescriptor } from "../shared/connectorActionCatalog.ts";
import { LINEAR_AGENT_TOOLS } from "../shared/linearAgentTools.ts";
import { resolveConnectorMcpServer } from "../shared/opsMcp.ts";
import type { JobConnectorSnapshot } from "../shared/opsMcp.ts";

const extraGithub: ConnectorActionDescriptor = {
  actionId: "github.get_issue",
  description: "Get one GitHub issue on the mentioned tahcode-owned connector.",
  fields: [
    { name: "connectionId", omitFromAction: true, type: "string" },
    { integerMin: 1, name: "issueNumber", required: true, type: "integer" },
    { name: "owner", required: true, type: "string" },
    { name: "repo", required: true, type: "string" },
  ],
  provider: "github",
  toolName: "get_github_issue",
};

describe("connector action catalog", () => {
  it("materializes Linear onto MCP / tahcode tool names without a hand-written switch", () => {
    const tools = materializeConnectorTools("linear");
    const names = tools.map((tool) => tool.name);
    expect({
      github: hasConnectorActions("github"),
      leaked: tools.some((tool) =>
        /openconnector|oomol|workers\.dev/i.test(tool.description)
      ),
      linear: hasConnectorActions("linear"),
      names,
      teams: isConnectorActionToolName("list_linear_teams"),
      unknown: isConnectorActionToolName("get_github_issue"),
    }).toStrictEqual({
      github: true,
      leaked: false,
      linear: true,
      names: LINEAR_AGENT_TOOLS.map((tool) => tool.name),
      teams: true,
      unknown: false,
    });
  });

  it("adds a new Action from a catalog row only (no new tool file)", () => {
    const catalog = [...CONNECTOR_ACTION_CATALOG, extraGithub];
    const extraTools = materializeConnectorTools("github", [extraGithub]);
    expect(extraTools.map((tool) => tool.name)).toStrictEqual([
      "get_github_issue",
    ]);
    expect(hasConnectorActions("github", catalog)).toBeTruthy();
    expect(isConnectorActionToolName("get_github_issue", catalog)).toBeTruthy();
    expect(
      mapConnectorActionInput(
        "get_github_issue",
        { issueNumber: 79, owner: "acme", repo: "web" },
        catalog
      )
    ).toStrictEqual({
      actionId: "github.get_issue",
      input: { issueNumber: 79, owner: "acme", repo: "web" },
    });
    expect(connectorActionInputSchema(extraGithub)).toMatchObject({
      required: ["issueNumber", "owner", "repo"],
      type: "object",
    });
  });

  it("materializes curated GitHub Actions without a hand-written tool file", () => {
    expect({
      create: mapConnectorActionInput("create_github_issue", {
        owner: "acme",
        repo: "web",
        title: "Ship GitHub plugin",
      }),
      names: materializeConnectorTools("github").map((tool) => tool.name),
    }).toStrictEqual({
      create: {
        actionId: "github.create_issue",
        input: { owner: "acme", repo: "web", title: "Ship GitHub plugin" },
      },
      names: [
        "list_github_repos",
        "list_github_issues",
        "search_github_issues",
        "create_github_issue",
        "update_github_issue",
      ],
    });
  });

  it("maps list_linear_teams through the generic Action path", () => {
    expect(mapConnectorActionInput("list_linear_teams", {})).toStrictEqual({
      actionId: LINEAR_LIST_TEAMS_ACTION,
      input: {},
    });
  });

  it("injects MCP only for providers that have catalogued Actions", () => {
    const linear: JobConnectorSnapshot = {
      connectedAccountId: "ca_preview-linear",
      connectionId: "k57abcde",
      orgId: "org1",
      provider: "linear",
      scope: "org",
      status: "connected",
    };
    expect(resolveConnectorMcpServer(linear)?.name).toBe(
      "tahcode-linear-k57abcde"
    );
    expect(
      resolveConnectorMcpServer({ ...linear, provider: "github" })?.name
    ).toBe("tahcode-github-k57abcde");
  });
});
