import type { ConnectorScope, ConnectorStatus } from "./connectors.ts";
import { parseMentions } from "./mentions.ts";

/**
 * Shared tahcode ops MCP/tools platform (TAH-55).
 *
 * Every job can receive a generated MCP config + a `tahcode tool` catalog.
 * Claude headless is the first-class `--mcp-config` path. Cursor's `agent -p`
 * has no equivalent flag today — tools stay on `tahcode tool` + the prompt
 * catalog (do not fall back to Cursor marketplace MCP).
 *
 * TAH-54 rides `resolveConnectorMcpServer`: inject Linear (and later other
 * connector) tools from tahcode `connectorConnections`, on this same plan.
 */

export const JOB_MCP_CONFIG_FILENAME = "tahcode-mcp.json";
export const TAHCODE_OPS_MCP_NAME = "tahcode";

export type JobMcpAttachmentMode = "mcp-config" | "cli" | "unsupported";

export type JobConnectorSnapshot = {
  connectedAccountId: string;
  connectionId: string;
  displayLabel?: string;
  lastVerifiedAt?: number;
  orgId: string;
  provider: string;
  scope: ConnectorScope;
  status: ConnectorStatus;
};

export type MentionedConnector = {
  handle: string;
  provider: string;
};

export type JobMcpServerSpec = {
  args: string[];
  command: string;
  env?: Record<string, string>;
  name: string;
};

export type JobMcpConfig = {
  mcpServers: Record<
    string,
    {
      args: string[];
      command: string;
      env?: Record<string, string>;
    }
  >;
};

export type JobMcpServerPlan = {
  connectionId?: string;
  inject: boolean;
  kind: "tahcode-ops" | "connector";
  name: string;
  provider?: string;
};

export type JobOpsBundle = {
  connectors: JobConnectorSnapshot[];
  mcp: {
    attachment: JobMcpAttachmentMode;
    servers: JobMcpServerPlan[];
  };
  mentionedConnectors: MentionedConnector[];
};

export type ConnectorMcpResolver = (
  connection: JobConnectorSnapshot
) => JobMcpServerSpec | null;

/**
 * How this harness receives tahcode-owned tools.
 *
 * - `mcp-config`: Claude `claude -p --mcp-config <file>`
 * - `cli`: Codex / Cursor / Grok / OpenCode — `tahcode tool` on PATH
 * - `unsupported`: Antigravity has no headless CLI in Phase 1
 *
 * Cursor path (stub): `agent -p --trust` does not accept `--mcp-config`.
 * Do not attach Cursor marketplace Linear MCP. TAH-54 must inject through
 * `resolveConnectorMcpServer` + this plan (Claude file today; Cursor when
 * the CLI grows a config flag, otherwise keep `tahcode tool`).
 */
export function jobMcpAttachmentMode(kind: string): JobMcpAttachmentMode {
  if (kind === "claudeAgent") {
    return "mcp-config";
  }
  if (kind === "antigravity") {
    return "unsupported";
  }
  return "cli";
}

export function jobMcpCliFlags(
  kind: string,
  mcpConfigPath: string | undefined
): string[] {
  if (!mcpConfigPath || jobMcpAttachmentMode(kind) !== "mcp-config") {
    return [];
  }
  return ["--mcp-config", mcpConfigPath];
}

export function mentionedConnectorsFromText(
  text: string
): MentionedConnector[] {
  const found: MentionedConnector[] = [];
  const seen = new Set<string>();
  for (const mention of parseMentions(text)) {
    if (mention.kind !== "connector" || !mention.connectorProvider) {
      continue;
    }
    const key = mention.handle;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    found.push({
      handle: mention.handle,
      provider: mention.connectorProvider,
    });
  }
  return found;
}

export function connectorMcpServerName(
  connection: JobConnectorSnapshot
): string {
  const suffix = connection.connectionId.slice(-8);
  return `tahcode-${connection.provider}-${suffix}`;
}

/**
 * TAH-54 hook. Phase 1 always returns null — jobs list tahcode-owned
 * connector status, but do not spawn vendor MCP (Linear issues, etc.).
 *
 * Implement Linear here (or pass a resolver into `buildJobMcpConfig`) so
 * every provider shares one injection path. Do not add a Cursor-only
 * marketplace bypass.
 */
export function resolveConnectorMcpServer(
  connection: JobConnectorSnapshot
): JobMcpServerSpec | null {
  switch (connection.provider) {
    case "linear":
      return null;
    default:
      return null;
  }
}

export function planJobMcpServers(
  connections: readonly JobConnectorSnapshot[],
  resolve: ConnectorMcpResolver = resolveConnectorMcpServer
): JobMcpServerPlan[] {
  const servers: JobMcpServerPlan[] = [
    {
      inject: true,
      kind: "tahcode-ops",
      name: TAHCODE_OPS_MCP_NAME,
    },
  ];
  for (const connection of connections) {
    servers.push({
      connectionId: connection.connectionId,
      inject: resolve(connection) !== null,
      kind: "connector",
      name: connectorMcpServerName(connection),
      provider: connection.provider,
    });
  }
  return servers;
}

export function buildJobMcpConfig(input: {
  connections: readonly JobConnectorSnapshot[];
  resolveConnector?: ConnectorMcpResolver;
  tahcodeOps: {
    args: string[];
    command: string;
    env?: Record<string, string>;
  };
}): JobMcpConfig {
  const resolve = input.resolveConnector ?? resolveConnectorMcpServer;
  const tahcode: JobMcpConfig["mcpServers"][string] = {
    args: input.tahcodeOps.args,
    command: input.tahcodeOps.command,
  };
  if (input.tahcodeOps.env) {
    tahcode.env = input.tahcodeOps.env;
  }
  const mcpServers: JobMcpConfig["mcpServers"] = {
    [TAHCODE_OPS_MCP_NAME]: tahcode,
  };
  for (const connection of input.connections) {
    const server = resolve(connection);
    if (!server) {
      continue;
    }
    const spec: JobMcpConfig["mcpServers"][string] = {
      args: server.args,
      command: server.command,
    };
    if (server.env) {
      spec.env = server.env;
    }
    mcpServers[server.name] = spec;
  }
  return { mcpServers };
}

export function buildJobOpsBundle(input: {
  connections: readonly JobConnectorSnapshot[];
  driverKind: string;
  prompt: string;
  resolveConnector?: ConnectorMcpResolver;
}): JobOpsBundle {
  return {
    connectors: [...input.connections],
    mcp: {
      attachment: jobMcpAttachmentMode(input.driverKind),
      servers: planJobMcpServers(
        input.connections,
        input.resolveConnector ?? resolveConnectorMcpServer
      ),
    },
    mentionedConnectors: mentionedConnectorsFromText(input.prompt),
  };
}

export function formatJobOpsPromptSuffix(bundle: JobOpsBundle): string {
  const lines = [
    "tahcode connectors (workspace mappings owned by tahcode; use `tahcode tool list_connectors` / `get_connector_status`):",
  ];
  if (bundle.connectors.length < 1) {
    lines.push("- none visible in this organization");
  } else {
    for (const row of bundle.connectors) {
      const label = row.displayLabel ? ` · ${row.displayLabel}` : "";
      lines.push(
        `- ${row.provider} · ${row.scope} · ${row.status}${label} (${row.connectionId})`
      );
    }
  }
  lines.push(
    "Provider-specific issue tools are not injected yet; status is tahcode-owned."
  );
  return lines.join("\n");
}

export function formatJobMcpAttachNote(bundle: JobOpsBundle): string {
  const listed = bundle.connectors.length;
  const injected = bundle.mcp.servers.filter(
    (server) => server.kind === "connector" && server.inject
  ).length;
  if (bundle.mcp.attachment === "mcp-config") {
    return `tahcode ops MCP attached (--mcp-config). connectors: ${listed} listed, ${injected} injected.`;
  }
  if (bundle.mcp.attachment === "cli") {
    return `tahcode ops tools via \`tahcode tool\` (this CLI has no --mcp-config). connectors: ${listed} listed, ${injected} injected.`;
  }
  return `tahcode ops tools unavailable for this provider. connectors: ${listed} listed.`;
}
