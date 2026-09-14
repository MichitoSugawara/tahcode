import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  AGENT_TOOLS_MIN_CLI_VERSION,
  CLI_VERSION,
  classifyToolSubcommandOutput,
  cliHasAgentTools,
  compareCliSemver,
  isUnknownToolCommandOutput,
  staleAgentToolsHostLogLine,
  staleCliAgentToolsMessage,
} from "../shared/cliVersion.ts";

describe("CLI version / agent tools gate", () => {
  it("stays in sync with packages/cli and registers tool commands", () => {
    const pkg = JSON.parse(
      readFileSync("packages/cli/package.json", "utf-8")
    ) as { version: string };
    expect(CLI_VERSION).toBe(pkg.version);
    expect(cliHasAgentTools(CLI_VERSION)).toBeTruthy();
    expect(AGENT_TOOLS_MIN_CLI_VERSION).toBe("0.1.1");
    const src = readFileSync("packages/cli/src/index.ts", "utf-8");
    expect(src).toContain('case "tool":');
    expect(src).toContain('case "tool-mcp":');
  });

  it("treats 0.1.0 as too old for tahcode tool", () => {
    expect(cliHasAgentTools("0.1.0")).toBeFalsy();
    expect(cliHasAgentTools("0.1.1")).toBeTruthy();
    expect(compareCliSemver("0.1.1", "0.1.0")).toBe(1);
  });

  it("tells operators to restart without service install", () => {
    const message = staleCliAgentToolsMessage("0.1.0");
    expect(message).toContain("0.1.1");
    expect(message).toContain("tahcode restart");
    expect(message).toContain("service install");
  });

  it("classifies unknown-command output from the 0.1.0 CLI", () => {
    expect(isUnknownToolCommandOutput("不明なコマンド: tool\n")).toBeTruthy();
    expect(classifyToolSubcommandOutput("不明なコマンド: tool\n使い方")).toBe(
      "unknown-command"
    );
    expect(
      classifyToolSubcommandOutput(
        "tahcode tool はジョブ実行中だけ使えます。ブリッジがセットする TAHCODE_JOB_ID / TAHCODE_LEASE_ID が必要です。"
      )
    ).toBe("ok");
    expect(classifyToolSubcommandOutput("boom")).toBe("indeterminate");
  });

  it("logs a one-line bridge warning only when the host cannot run", () => {
    expect(
      staleAgentToolsHostLogLine({ status: "ok", version: "0.1.1" })
    ).toBeNull();
    expect(
      staleAgentToolsHostLogLine({
        status: "unknown-command",
        version: "0.1.0",
      })
    ).toContain("tahcode tool / tool-mcp unavailable");
    expect(staleAgentToolsHostLogLine({ version: "0.1.0" })).toContain(
      "0.1.1+"
    );
  });
});
