import { describe, expect, it } from "vitest";

import { headlessArgs } from "../runtime/src/providers.ts";
import {
  buildJobMcpConfig,
  buildJobOpsBundle,
  connectorMcpServerName,
  formatJobMcpAttachNote,
  formatJobOpsPromptSuffix,
  jobMcpAttachmentMode,
  jobMcpCliFlags,
  mentionedConnectorsFromText,
  TAHCODE_OPS_MCP_ALLOWED_TOOLS,
  planJobMcpServers,
  resolveConnectorMcpServer,
  TAHCODE_OPS_MCP_NAME,
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
  });

  it("builds a Claude MCP file with tahcode ops only until TAH-54 resolves Linear", () => {
    expect(resolveConnectorMcpServer(linear)).toBeNull();
    const config = buildJobMcpConfig({
      connections: [linear],
      tahcodeOps: {
        args: ["tahcode.mjs", "tool-mcp"],
        command: "node",
        env: { TAHCODE_JOB_ID: "job" },
      },
    });
    expect(Object.keys(config.mcpServers)).toStrictEqual([
      TAHCODE_OPS_MCP_NAME,
    ]);
    expect(config.mcpServers.tahcode).toMatchObject({
      args: ["tahcode.mjs", "tool-mcp"],
      command: "node",
    });
  });

  it("merges connector MCP servers when the TAH-54 resolver returns a spec", () => {
    const config = buildJobMcpConfig({
      connections: [linear],
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
    expect(config.mcpServers[TAHCODE_OPS_MCP_NAME]).toBeDefined();
    expect(config.mcpServers[name]).toStrictEqual({
      args: ["linear-host.mjs"],
      command: "node",
    });
    const planned = planJobMcpServers([linear], () => ({
      args: ["linear-host.mjs"],
      command: "node",
      name,
    }));
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

  it("records @linear mentions on the claim bundle for TAH-54", () => {
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
        (server) => server.kind === "connector" && !server.inject
      )
    ).toBeTruthy();
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
    expect(text).toContain("list_connectors");
    expect(text).toContain("linear · org · connected · pottos");
    expect(text.toLowerCase()).not.toContain("openconnector");
    expect(text.toLowerCase()).not.toContain("oomol");
    expect(text.toLowerCase()).not.toContain("workers.dev");
  });
});
