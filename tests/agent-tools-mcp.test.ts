import { describe, expect, it } from "vitest";

import {
  handleMcpRequest,
  parseMcpBuffer,
} from "../runtime/src/agentToolsMcp.ts";
import { LINEAR_AGENT_TOOLS } from "../shared/linearAgentTools.ts";

describe("tahcode MCP host", () => {
  it("lists native tools and calls through the invoke callback", async () => {
    const listed = await handleMcpRequest(
      { id: 1, method: "tools/list" },
      async () => {
        throw new Error("unused");
      }
    );
    expect(listed?.result).toMatchObject({
      tools: expect.arrayContaining([
        expect.objectContaining({ name: "list_orgs" }),
        expect.objectContaining({ name: "send_message" }),
        expect.objectContaining({ name: "list_connectors" }),
        expect.objectContaining({ name: "get_connector_status" }),
      ]),
    });

    const called = await handleMcpRequest(
      {
        id: 2,
        method: "tools/call",
        params: { arguments: { orgId: "o1" }, name: "list_projects" },
      },
      async (name, args) => {
        expect(name).toBe("list_projects");
        expect(args).toStrictEqual({ orgId: "o1" });
        return { projects: [] };
      }
    );
    const content = (
      called?.result as { content: { text: string }[] } | undefined
    )?.content[0]?.text;
    expect(content).toContain("projects");
  });

  it("lists only Linear issue tools on an injected connector server", async () => {
    const listed = await handleMcpRequest(
      { id: 1, method: "tools/list" },
      async () => {
        throw new Error("unused");
      },
      LINEAR_AGENT_TOOLS,
      "tahcode-linear"
    );
    expect(listed?.result).toMatchObject({
      tools: expect.arrayContaining([
        expect.objectContaining({ name: "list_linear_issues" }),
        expect.objectContaining({ name: "search_linear_issues" }),
        expect.objectContaining({ name: "list_linear_teams" }),
      ]),
    });
    const names = (
      listed?.result as { tools: { name: string }[] } | undefined
    )?.tools.map((tool) => tool.name);
    expect(names).not.toContain("list_orgs");
  });

  it("parses Content-Length frames and newline JSON", () => {
    const body = '{"jsonrpc":"2.0","id":1,"method":"ping"}';
    const framed = `Content-Length: ${Buffer.byteLength(body, "utf-8")}\r\n\r\n${body}`;
    expect(parseMcpBuffer(framed).messages[0]?.method).toBe("ping");
    expect(
      parseMcpBuffer('{"jsonrpc":"2.0","method":"ping","id":2}\n').messages[0]
        ?.id
    ).toBe(2);
  });
});
