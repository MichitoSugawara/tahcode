import { spawnSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { stdin, stdout } from "node:process";

import {
  AGENT_TOOLS,
  AGENT_TOOL_ENV,
  agentToolJobEnv,
  catalogTools,
  formatAgentToolCatalog,
  isInvocableToolName,
  parseAgentToolArgsJson,
  parseInjectedConnectorsEnv,
  readAgentToolJobAuth,
} from "../../shared/agentTools.ts";
import type {
  AgentToolJobAuth,
  InvocableToolName,
} from "../../shared/agentTools.ts";
import { classifyToolSubcommandOutput } from "../../shared/cliVersion.ts";
import { materializeConnectorTools } from "../../shared/connectorActionCatalog.ts";
import type {
  JobConnectorSnapshot,
  MentionedConnector,
} from "../../shared/opsMcp.ts";
import {
  JOB_MCP_CONFIG_FILENAME,
  buildJobMcpConfig,
} from "../../shared/opsMcp.ts";
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
  name: InvocableToolName,
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
  connections?: readonly JobConnectorSnapshot[];
  dir: string;
  mentionedConnectors?: readonly MentionedConnector[];
  nodePath: string;
}): Promise<string> {
  const configPath = path.join(input.dir, JOB_MCP_CONFIG_FILENAME);
  const env = agentToolJobEnv(input.auth);
  const config = buildJobMcpConfig({
    connections: input.connections ?? [],
    mentionedConnectors: input.mentionedConnectors ?? [],
    tahcodeOps: {
      args: [input.cliEntry, "tool-mcp"],
      command: input.nodePath,
      env,
    },
  });
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

export function agentToolsPromptSuffix(
  includeLinear = false,
  providers?: readonly string[]
): string {
  return formatAgentToolCatalog({ includeLinear, providers });
}

export function probeToolSubcommand(command: readonly string[]): {
  output: string;
  status: "ok" | "unknown-command" | "indeterminate";
} {
  const [bin, ...args] = command;
  if (!bin) {
    return { output: "", status: "indeterminate" };
  }
  const result = spawnSync(bin, args, {
    encoding: "utf-8",
    env: {
      ...process.env,
      TAHCODE_JOB_ID: "",
      TAHCODE_LEASE_ID: "",
    },
    timeout: 8000,
  });
  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  return { output, status: classifyToolSubcommandOutput(output) };
}

function jobConnectorProviders(): string[] {
  const injected = parseInjectedConnectorsEnv(
    process.env[AGENT_TOOL_ENV.INJECTED_CONNECTORS]
  ).map((row) => row.provider);
  const bound = process.env[AGENT_TOOL_ENV.CONNECTOR_PROVIDER]?.trim();
  const providers = new Set(injected);
  if (bound) {
    providers.add(bound);
  } else if (process.env[AGENT_TOOL_ENV.CONNECTOR_CONNECTION_ID]?.trim()) {
    providers.add("linear");
  }
  return [...providers];
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
  const providers = jobConnectorProviders();
  const tools = catalogTools({ providers });
  if (!input.name) {
    console.log(formatAgentToolCatalog({ providers }));
    console.log("");
    console.log('例: tahcode tool list_sessions --args \'{"orgId":"…"}\'');
    return 0;
  }
  if (
    !isInvocableToolName(input.name) ||
    !tools.some((tool) => tool.name === input.name)
  ) {
    console.error(
      `不明なツール: ${input.name}（${tools.map((tool) => tool.name).join(", ")}）`
    );
    return 2;
  }
  const args = parseAgentToolArgsJson(input.argsJson ?? "{}");
  const boundId = process.env[AGENT_TOOL_ENV.CONNECTOR_CONNECTION_ID]?.trim();
  if (boundId && args.connectionId === undefined) {
    args.connectionId = boundId;
  }
  const result = await invokeAgentTool(auth, input.name, args);
  console.log(JSON.stringify(result, null, 2));
  return 0;
}

export async function runAgentToolMcp(): Promise<void> {
  const auth = readAgentToolJobAuth(process.env);
  if (!auth) {
    throw new Error("Missing TAHCODE_JOB_* environment for tool-mcp");
  }
  const boundId = process.env[AGENT_TOOL_ENV.CONNECTOR_CONNECTION_ID]?.trim();
  const boundProvider =
    process.env[AGENT_TOOL_ENV.CONNECTOR_PROVIDER]?.trim() || "linear";
  const tools = boundId
    ? materializeConnectorTools(boundProvider)
    : AGENT_TOOLS;
  const serverName = boundId ? `tahcode-${boundProvider}` : "tahcode";
  let buffer = "";
  const invoke = async (name: string, args: Record<string, unknown>) => {
    if (!tools.some((tool) => tool.name === name)) {
      throw new Error("Unknown tool");
    }
    const next = { ...args };
    if (boundId && next.connectionId === undefined) {
      next.connectionId = boundId;
    }
    return await invokeAgentTool(auth, name as InvocableToolName, next);
  };
  stdin.setEncoding("utf-8");
  stdin.on("data", (chunk) => {
    buffer += chunk;
    const parsed = parseMcpBuffer(buffer);
    buffer = parsed.rest;
    for (const message of parsed.messages) {
      void handleMcpRequest(message, invoke, tools, serverName).then(
        (response) => {
          if (!response) {
            return;
          }
          stdout.write(encodeMcpFrame(response));
        }
      );
    }
  });
  await new Promise<void>((resolve) => {
    stdin.on("end", () => resolve());
  });
}
