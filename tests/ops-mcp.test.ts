import { describe, expect, it } from "vitest";

import { headlessArgs } from "../runtime/src/providers.ts";
import {
  CONNECTOR_MCP_HOST_COMMAND,
  TAHCODE_OPS_MCP_ALLOWED_TOOLS,
  TAHCODE_OPS_MCP_NAME,
  buildJobMcpConfig,
  buildJobOpsBundle,
  connectorMcpServerName,
  formatJobMcpAttachNote,
  formatJobOpsPromptSuffix,
  injectedConnectorConnections,
  jobMcpAttachmentMode,
  jobMcpCliFlags,
  mentionedConnectorsFromText,
  mcpAllowedToolsValue,
  planJobMcpServers,
  resolveConnectorMcpServer,
} from "../shared/opsMcp.ts";
import type { JobConnectorSnapshot } from "../shared/opsMcp.ts";

const linear: JobConnectorSnapshot = {
  connectedAccountId: "ca_preview-linear",
  connectionId: "k57abcde",
  displayLabel: "pottos",
  orgId: "org1",
  provider: "linear",
  scope: "org",
  status: "connected",
};

const disconnected: JobConnectorSnapshot = {
  ...linear,
  connectionId: "k57discon",
  status: "disconnected",
};

describe("job MCP attachment", () => {
  it("uses --mcp-config only for Claude; Cursor stays on the CLI path", () => {
    expect({
      antigravity: jobMcpAttachmentMode("antigravity"),
      claude: jobMcpAttachmentMode("claudeAgent"),
      claudeFlags: jobMcpCliFlags("claudeAgent", "/tmp/tahcode-mcp.json"),
      codex: jobMcpAttachmentMode("codex"),
      cursor: jobMcpAttachmentMode("cursor"),
      cursorFlags: jobMcpCliFlags("cursor", "/tmp/tahcode-mcp.json"),
      cursorHeadless: headlessArgs(
        "cursor",
        "hi",
        undefined,
        undefined,
        "/tmp/tahcode-mcp.json"
      ),
    }).toStrictEqual({
      antigravity: "unsupported",
      claude: "mcp-config",
      claudeFlags: [
        "--mcp-config",
        "/tmp/tahcode-mcp.json",
        "--allowedTools",
        TAHCODE_OPS_MCP_ALLOWED_TOOLS,
      ],
      codex: "cli",
      cursor: "cli",
      cursorFlags: [],
      cursorHeadless: expect.not.arrayContaining([
        "--mcp-config",
        "--allowedTools",
      ]),
    });
    expect(TAHCODE_OPS_MCP_ALLOWED_TOOLS).toBe("mcp__tahcode__*");
    expect(
      headlessArgs(
        "cursor",
        "hi",
        undefined,
        undefined,
        "/tmp/tahcode-mcp.json"
      )
    ).toStrictEqual(expect.arrayContaining(["--trust", "--force"]));
  });

  it("expands --allowedTools for each injected Linear MCP server", () => {
    const name = connectorMcpServerName(linear);
    expect(mcpAllowedToolsValue([name])).toBe(
      `mcp__tahcode__*,mcp__${name}__*`
    );
    expect(
      jobMcpCliFlags("claudeAgent", "/tmp/tahcode-mcp.json", [name])
    ).toStrictEqual([
      "--mcp-config",
      "/tmp/tahcode-mcp.json",
      "--allowedTools",
      `mcp__tahcode__*,mcp__${name}__*`,
    ]);
    expect(
      headlessArgs(
        "claudeAgent",
        "hi",
        undefined,
        undefined,
        "/tmp/tahcode-mcp.json",
        undefined,
        [name]
      )
    ).toStrictEqual(
      expect.arrayContaining([
        "--allowedTools",
        `mcp__tahcode__*,mcp__${name}__*`,
      ])
    );
  });

  it("resolves a tahcode-hosted Linear spec only when connected", () => {
    const spec = resolveConnectorMcpServer(linear);
    expect(spec).toMatchObject({
      args: ["tool-mcp"],
      command: CONNECTOR_MCP_HOST_COMMAND,
      env: {
        TAHCODE_CONNECTOR_CONNECTION_ID: linear.connectionId,
        TAHCODE_CONNECTOR_PROVIDER: "linear",
      },
      name: connectorMcpServerName(linear),
    });
    expect(resolveConnectorMcpServer(disconnected)).toBeNull();
    expect(
      resolveConnectorMcpServer({ ...linear, provider: "github" })
    ).toBeNull();
  });

  it("merges Linear into tahcode-mcp.json only for mentioned connected accounts", () => {
    const name = connectorMcpServerName(linear);
    const injected = buildJobMcpConfig({
      connections: [linear],
      mentionedConnectors: [{ handle: "linear/pottos", provider: "linear" }],
      tahcodeOps: {
        args: ["tahcode.mjs", "tool-mcp"],
        command: "node",
        env: { TAHCODE_JOB_ID: "job" },
      },
    });
    expect(Object.keys(injected.mcpServers).sort()).toStrictEqual(
      [name, TAHCODE_OPS_MCP_NAME].sort()
    );
    expect(injected.mcpServers[name]).toStrictEqual({
      args: ["tahcode.mjs", "tool-mcp"],
      command: "node",
      env: {
        TAHCODE_CONNECTOR_CONNECTION_ID: linear.connectionId,
        TAHCODE_CONNECTOR_PROVIDER: "linear",
        TAHCODE_JOB_ID: "job",
      },
    });
    const unmentioned = buildJobMcpConfig({
      connections: [linear],
      mentionedConnectors: [],
      tahcodeOps: {
        args: ["tahcode.mjs", "tool-mcp"],
        command: "node",
      },
    });
    expect(Object.keys(unmentioned.mcpServers)).toStrictEqual([
      TAHCODE_OPS_MCP_NAME,
    ]);
    const offline = buildJobMcpConfig({
      connections: [disconnected],
      mentionedConnectors: [{ handle: "linear", provider: "linear" }],
      tahcodeOps: {
        args: ["tahcode.mjs", "tool-mcp"],
        command: "node",
      },
    });
    expect(Object.keys(offline.mcpServers)).toStrictEqual([
      TAHCODE_OPS_MCP_NAME,
    ]);
  });

  it("still merges a custom resolver spec when the mention matches", () => {
    const config = buildJobMcpConfig({
      connections: [linear],
      mentionedConnectors: [{ handle: "linear/pottos", provider: "linear" }],
      resolveConnector: (connection) => ({
        args: ["linear-host.mjs"],
        command: "node",
        name: connectorMcpServerName(connection),
      }),
      tahcodeOps: {
        args: ["tahcode.mjs", "tool-mcp"],
        command: "node",
      },
    });
    const name = connectorMcpServerName(linear);
    expect(config.mcpServers[name]).toStrictEqual({
      args: ["linear-host.mjs"],
      command: "node",
    });
    const planned = planJobMcpServers(
      [linear],
      () => ({
        args: ["linear-host.mjs"],
        command: "node",
        name,
      }),
      [{ handle: "linear/pottos", provider: "linear" }]
    );
    expect(planned).toStrictEqual(
      expect.arrayContaining([
        expect.objectContaining({
          inject: true,
          kind: "connector",
          provider: "linear",
        }),
      ])
    );
  });

  it("records @linear mentions and injects the matching connected account", () => {
    const bundle = buildJobOpsBundle({
      connections: [linear],
      driverKind: "claudeAgent",
      prompt: "@claude look at @linear/pottos please",
    });
    expect(bundle.mcp.attachment).toBe("mcp-config");
    expect(bundle.mentionedConnectors).toStrictEqual([
      { handle: "linear/pottos", provider: "linear" },
    ]);
    expect(mentionedConnectorsFromText("@linear and @codex")).toStrictEqual([
      { handle: "linear", provider: "linear" },
    ]);
    expect(
      bundle.mcp.servers.some(
        (server) => server.kind === "connector" && server.inject
      )
    ).toBeTruthy();
    expect(
      injectedConnectorConnections(
        bundle.connectors,
        bundle.mentionedConnectors
      )
    ).toStrictEqual([linear]);
  });

  it("does not inject when Linear is disconnected or unmentioned", () => {
    const offline = buildJobOpsBundle({
      connections: [disconnected],
      driverKind: "claudeAgent",
      prompt: "@claude @linear 課題を一覧",
    });
    expect(
      offline.mcp.servers.some(
        (server) => server.kind === "connector" && server.inject
      )
    ).toBeFalsy();
    const quiet = buildJobOpsBundle({
      connections: [linear],
      driverKind: "claudeAgent",
      prompt: "@claude just say hi",
    });
    expect(
      quiet.mcp.servers.some(
        (server) => server.kind === "connector" && server.inject
      )
    ).toBeFalsy();
  });

  it("keeps vendor internals out of the prompt suffix", () => {
    const text = `${formatJobOpsPromptSuffix(
      buildJobOpsBundle({
        connections: [linear],
        driverKind: "cursor",
        prompt: "@cursor @linear",
      })
    )}\n${formatJobMcpAttachNote(
      buildJobOpsBundle({
        connections: [linear],
        driverKind: "cursor",
        prompt: "hi",
      })
    )}`;
    expect({
      hasOps: text.includes("list_connectors"),
      hasLinearAccount: text.includes("linear · org · connected · pottos"),
      hasLinearTool: text.includes("list_linear_issues"),
      leaked: ["openconnector", "oomol", "workers.dev"].filter((needle) =>
        text.toLowerCase().includes(needle)
      ),
    }).toStrictEqual({
      hasOps: true,
      hasLinearAccount: true,
      hasLinearTool: true,
      leaked: [],
    });
  });
});
