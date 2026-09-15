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
  actionId: "github.create_issue",
  description:
    "Create a GitHub issue on the mentioned tahcode-owned connector.",
  fields: [
    { name: "connectionId", omitFromAction: true, type: "string" },
    { name: "title", required: true, type: "string" },
  ],
  provider: "github",
  toolName: "create_github_issue",
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
      unknown: isConnectorActionToolName("create_github_issue"),
    }).toStrictEqual({
      github: false,
      leaked: false,
      linear: true,
      names: LINEAR_AGENT_TOOLS.map((tool) => tool.name),
      teams: true,
      unknown: false,
    });
  });

  it("adds a new Action from a catalog row only (no new tool file)", () => {
    const catalog = [...CONNECTOR_ACTION_CATALOG, extraGithub];
    const githubTools = materializeConnectorTools("github", catalog);
    expect(githubTools.map((tool) => tool.name)).toStrictEqual([
      "create_github_issue",
    ]);
    expect(hasConnectorActions("github", catalog)).toBeTruthy();
    expect(
      isConnectorActionToolName("create_github_issue", catalog)
    ).toBeTruthy();
    expect(
      mapConnectorActionInput(
        "create_github_issue",
        { title: "Ship TAH-65" },
        catalog
      )
    ).toStrictEqual({
      actionId: "github.create_issue",
      input: { title: "Ship TAH-65" },
    });
    expect(connectorActionInputSchema(extraGithub)).toMatchObject({
      required: ["title"],
      type: "object",
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
      resolveConnectorMcpServer({ ...linear, provider: "github" })
    ).toBeNull();
  });
});
