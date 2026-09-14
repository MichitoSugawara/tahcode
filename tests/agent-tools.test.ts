import { describe, expect, it } from "vitest";

import { headlessArgs } from "../runtime/src/providers.ts";
import {
  AGENT_TOOL_NAMES,
  agentToolsMcpFlags,
  formatAgentToolCatalog,
  isAgentToolName,
  parseAgentToolArgsJson,
  readAgentToolJobAuth,
} from "../shared/agentTools.ts";

describe("agent tool catalog", () => {
  it("lists the Phase 1 tools without skill bodies", () => {
    const text = formatAgentToolCatalog();
    for (const name of AGENT_TOOL_NAMES) {
      expect(text).toContain(name);
    }
    expect(text).not.toMatch(/---\nname:/);
    expect(isAgentToolName("list_orgs")).toBeTruthy();
    expect(isAgentToolName("rm_rf")).toBeFalsy();
  });

  it("parses object arguments and rejects arrays", () => {
    expect(parseAgentToolArgsJson('{"orgId":"abc"}')).toStrictEqual({
      orgId: "abc",
    });
    expect(parseAgentToolArgsJson("")).toStrictEqual({});
    expect(() => parseAgentToolArgsJson("[1]")).toThrow(/JSON object/);
  });

  it("reads job auth from the env the bridge sets", () => {
    expect(
      readAgentToolJobAuth({
        TAHCODE_JOB_ID: "job",
        TAHCODE_LEASE_ID: "lease",
        TAHCODE_RUNTIME_ID: "rt",
        TAHCODE_TOKEN: "th_x",
        TAHCODE_URL: "https://example.convex.cloud",
      })
    ).toStrictEqual({
      jobId: "job",
      leaseId: "lease",
      runtimeId: "rt",
      token: "th_x",
      url: "https://example.convex.cloud",
    });
    expect(readAgentToolJobAuth({})).toBeNull();
  });

  it("adds Claude MCP flags only", () => {
    const claude = headlessArgs(
      "claudeAgent",
      "hi",
      undefined,
      undefined,
      "/tmp/mcp.json"
    );
    const cursor = headlessArgs(
      "cursor",
      "hi",
      undefined,
      undefined,
      "/tmp/mcp.json"
    );
    expect({
      claudeFlags: agentToolsMcpFlags("claudeAgent", "/tmp/mcp.json"),
      claudeHasBypass: claude.includes("--permission-mode"),
      claudeHasMcp:
        claude.includes("--mcp-config") &&
        claude.includes("--allowedTools") &&
        claude.includes("mcp__tahcode__*"),
      codexFlags: agentToolsMcpFlags("codex", "/tmp/mcp.json"),
      cursorHasMcp:
        cursor.includes("--mcp-config") || cursor.includes("--allowedTools"),
    }).toStrictEqual({
      claudeFlags: [
        "--mcp-config",
        "/tmp/mcp.json",
        "--allowedTools",
        "mcp__tahcode__*",
      ],
      claudeHasBypass: false,
      claudeHasMcp: true,
      codexFlags: [],
      cursorHasMcp: false,
    });
  });
});
