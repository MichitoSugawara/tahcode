import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { stdin, stdout } from "node:process";

import {
  AGENT_TOOLS,
  agentToolJobEnv,
  formatAgentToolCatalog,
  isAgentToolName,
  parseAgentToolArgsJson,
  readAgentToolJobAuth,
} from "../../shared/agentTools.ts";
import type {
  AgentToolJobAuth,
  AgentToolName,
} from "../../shared/agentTools.ts";
import { posixShellQuote } from "../../shared/shellQuote.ts";
import {
  encodeMcpFrame,
  handleMcpRequest,
  parseMcpBuffer,
} from "./agentToolsMcp.ts";
import { RuntimeClient } from "./convexClient.ts";

export function jobAgentToolEnv(auth: AgentToolJobAuth): NodeJS.ProcessEnv {
  return {
    ...process.env,
    ...agentToolJobEnv(auth),
  };
}

export async function invokeAgentTool(
  auth: AgentToolJobAuth,
  name: AgentToolName,
  args: Record<string, unknown>
): Promise<unknown> {
  const client = new RuntimeClient(auth.url);
  const result = await client.invokeTool({
    argsJson: JSON.stringify(args),
    jobId: auth.jobId,
    leaseId: auth.leaseId,
    name,
    runtimeId: auth.runtimeId,
    token: auth.token,
  });
  return JSON.parse(result.resultJson) as unknown;
}

export async function writeAgentToolsMcpConfig(input: {
  auth: AgentToolJobAuth;
  cliEntry: string;
  dir: string;
  nodePath: string;
}): Promise<string> {
  const configPath = path.join(input.dir, "tahcode-mcp.json");
  const env = agentToolJobEnv(input.auth);
  const config = {
    mcpServers: {
      tahcode: {
        args: [input.cliEntry, "tool-mcp"],
        command: input.nodePath,
        env,
      },
    },
  };
  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf-8");
  return configPath;
}

export async function writeAgentToolShim(input: {
  cliEntry: string;
  dir: string;
  nodePath: string;
}): Promise<string> {
  const bin = path.join(input.dir, "bin");
  await mkdir(bin, { recursive: true });
  const script = `#!/usr/bin/env bash
exec ${posixShellQuote(input.nodePath)} ${posixShellQuote(input.cliEntry)} "$@"
`;
  await writeFile(path.join(bin, "tahcode"), script, { mode: 0o755 });
  return bin;
}

export function agentToolsPromptSuffix(): string {
  return formatAgentToolCatalog();
}

export async function runAgentToolCli(input: {
  argsJson?: string;
  name?: string;
}): Promise<number> {
  const auth = readAgentToolJobAuth(process.env);
  if (!auth) {
    console.error(
      "tahcode tool はジョブ実行中だけ使えます。ブリッジがセットする TAHCODE_JOB_ID / TAHCODE_LEASE_ID が必要です。"
    );
    return 2;
  }
  if (!input.name) {
    console.log(formatAgentToolCatalog());
    console.log("");
    console.log('例: tahcode tool list_sessions --args \'{"orgId":"…"}\'');
    return 0;
  }
  if (!isAgentToolName(input.name)) {
    console.error(
      `不明なツール: ${input.name}（${AGENT_TOOLS.map((tool) => tool.name).join(", ")}）`
    );
    return 2;
  }
  const args = parseAgentToolArgsJson(input.argsJson ?? "{}");
  const result = await invokeAgentTool(auth, input.name, args);
  console.log(JSON.stringify(result, null, 2));
  return 0;
}

export async function runAgentToolMcp(): Promise<void> {
  const auth = readAgentToolJobAuth(process.env);
  if (!auth) {
    throw new Error("Missing TAHCODE_JOB_* environment for tool-mcp");
  }
  let buffer = "";
  const invoke = async (name: string, args: Record<string, unknown>) => {
    if (!isAgentToolName(name)) {
      throw new Error("Unknown tool");
    }
    return await invokeAgentTool(auth, name, args);
  };
  stdin.setEncoding("utf-8");
  stdin.on("data", (chunk) => {
    buffer += chunk;
    const parsed = parseMcpBuffer(buffer);
    buffer = parsed.rest;
    for (const message of parsed.messages) {
      void handleMcpRequest(message, invoke).then((response) => {
        if (!response) {
          return;
        }
        stdout.write(encodeMcpFrame(response));
      });
    }
  });
  await new Promise<void>((resolve) => {
    stdin.on("end", () => resolve());
  });
}
