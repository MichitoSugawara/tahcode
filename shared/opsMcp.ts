import {
  hasConnectorActions,
  materializeConnectorTools,
} from "./connectorActionCatalog.ts";
import { selectInjectedConnections } from "./connectorMentions.ts";
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
 * TAH-65 rides `resolveConnectorMcpServer`: inject catalogued connector
 * Actions from tahcode `connectorConnections` when the prompt mentions
 * that provider (`@linear` today).
 */

export const JOB_MCP_CONFIG_FILENAME = "tahcode-mcp.json";
export const TAHCODE_OPS_MCP_NAME = "tahcode";
/** Claude `--allowedTools` glob for every tool on the tahcode ops server. */
export const TAHCODE_OPS_MCP_ALLOWED_TOOLS = `mcp__${TAHCODE_OPS_MCP_NAME}__*`;
/** Sentinel command: `buildJobMcpConfig` rewrites this to the job's tahcode CLI. */
export const CONNECTOR_MCP_HOST_COMMAND = "tahcode";

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
 * - `mcp-config`: Claude `claude -p --mcp-config <file> --allowedTools mcp__tahcode__*`
 * - `cli`: Codex / Cursor / Grok / OpenCode — `tahcode tool` on PATH
 * - `unsupported`: Antigravity has no headless CLI in Phase 1
 *
 * Cursor path (stub): `agent -p --trust --force` does not accept `--mcp-config`.
 * `--force` is required so headless shell (`tahcode tool`) is not rejected
 * (TAH-63). Do not attach Cursor marketplace Linear MCP. TAH-54 must inject
 * through `resolveConnectorMcpServer` + this plan (Claude file today; Cursor
 * when the CLI grows a config flag, otherwise keep `tahcode tool`).
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

export function mcpAllowedToolsValue(
  injectedServerNames: readonly string[] = []
): string {
  const names = [TAHCODE_OPS_MCP_NAME, ...injectedServerNames];
  const unique: string[] = [];
  const seen = new Set<string>();
  for (const name of names) {
    if (seen.has(name)) {
      continue;
    }
    seen.add(name);
    unique.push(name);
  }
  return unique.map((name) => `mcp__${name}__*`).join(",");
}

export function jobMcpCliFlags(
  kind: string,
  mcpConfigPath: string | undefined,
  injectedServerNames: readonly string[] = []
): string[] {
  if (!mcpConfigPath || jobMcpAttachmentMode(kind) !== "mcp-config") {
    return [];
  }
  // `-p` starts in permission mode `default`. With no TTY the first MCP
  // call is denied as 権限未承認. `--allowedTools mcp__<server>__*` is
  // the documented allow-glob for one named server (unanchored `mcp__*`
  // is ignored). Narrower than `--permission-mode bypassPermissions`.
  return [
    "--mcp-config",
    mcpConfigPath,
    "--allowedTools",
    mcpAllowedToolsValue(injectedServerNames),
  ];
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
 * Connector MCP host. A spec is returned when the provider has catalogued
 * Actions and the mapping is `connected`. Mention filtering happens in
 * `buildJobMcpConfig` / `planJobMcpServers` so disconnected or unmentioned
 * accounts stay off the Claude `--mcp-config` file.
 *
 * The command is rewritten to the job's `tahcode tool-mcp` host so tokens
 * never go in the prompt — Convex `agentTools:invokeConnector` holds them.
 */
export function resolveConnectorMcpServer(
  connection: JobConnectorSnapshot
): JobMcpServerSpec | null {
  if (
    connection.status !== "connected" ||
    !hasConnectorActions(connection.provider)
  ) {
    return null;
  }
  return {
    args: ["tool-mcp"],
    command: CONNECTOR_MCP_HOST_COMMAND,
    env: {
      TAHCODE_CONNECTOR_CONNECTION_ID: connection.connectionId,
      TAHCODE_CONNECTOR_PROVIDER: connection.provider,
    },
    name: connectorMcpServerName(connection),
  };
}

export function injectedConnectorConnections(
  connections: readonly JobConnectorSnapshot[],
  mentions: readonly MentionedConnector[],
  resolve: ConnectorMcpResolver = resolveConnectorMcpServer
): JobConnectorSnapshot[] {
  return selectInjectedConnections(connections, mentions).filter(
    (connection) => resolve(connection) !== null
  );
}

export function injectedMcpServerNames(
  connections: readonly JobConnectorSnapshot[],
  mentions: readonly MentionedConnector[],
  resolve: ConnectorMcpResolver = resolveConnectorMcpServer
): string[] {
  return injectedConnectorConnections(connections, mentions, resolve).map(
    (connection) =>
      resolve(connection)?.name ?? connectorMcpServerName(connection)
  );
}

export function planJobMcpServers(
  connections: readonly JobConnectorSnapshot[],
  resolve: ConnectorMcpResolver = resolveConnectorMcpServer,
  mentions: readonly MentionedConnector[] = []
): JobMcpServerPlan[] {
  const injected = new Set(
    injectedConnectorConnections(connections, mentions, resolve).map(
      (connection) => connection.connectionId
    )
  );
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
      inject: injected.has(connection.connectionId),
      kind: "connector",
      name: connectorMcpServerName(connection),
      provider: connection.provider,
    });
  }
  return servers;
}

function materializeConnectorServer(
  spec: JobMcpServerSpec,
  tahcodeOps: {
    args: string[];
    command: string;
    env?: Record<string, string>;
  }
): JobMcpConfig["mcpServers"][string] {
  const viaTahcodeHost = spec.command === CONNECTOR_MCP_HOST_COMMAND;
  const next: JobMcpConfig["mcpServers"][string] = {
    args: viaTahcodeHost ? tahcodeOps.args : spec.args,
    command: viaTahcodeHost ? tahcodeOps.command : spec.command,
  };
  const env = {
    ...(viaTahcodeHost ? tahcodeOps.env : undefined),
    ...spec.env,
  };
  if (Object.keys(env).length > 0) {
    next.env = env;
  }
  return next;
}

export function buildJobMcpConfig(input: {
  connections: readonly JobConnectorSnapshot[];
  mentionedConnectors?: readonly MentionedConnector[];
  resolveConnector?: ConnectorMcpResolver;
  tahcodeOps: {
    args: string[];
    command: string;
    env?: Record<string, string>;
  };
}): JobMcpConfig {
  const resolve = input.resolveConnector ?? resolveConnectorMcpServer;
  const mentions = input.mentionedConnectors ?? [];
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
  for (const connection of injectedConnectorConnections(
    input.connections,
    mentions,
    resolve
  )) {
    const server = resolve(connection);
    if (!server) {
      continue;
    }
    mcpServers[server.name] = materializeConnectorServer(
      server,
      input.tahcodeOps
    );
  }
  return { mcpServers };
}

export function buildJobOpsBundle(input: {
  connections: readonly JobConnectorSnapshot[];
  driverKind: string;
  prompt: string;
  resolveConnector?: ConnectorMcpResolver;
}): JobOpsBundle {
  const mentionedConnectors = mentionedConnectorsFromText(input.prompt);
  const resolve = input.resolveConnector ?? resolveConnectorMcpServer;
  return {
    connectors: [...input.connections],
    mcp: {
      attachment: jobMcpAttachmentMode(input.driverKind),
      servers: planJobMcpServers(
        input.connections,
        resolve,
        mentionedConnectors
      ),
    },
    mentionedConnectors,
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
  const injected = bundle.mcp.servers.filter(
    (server) => server.kind === "connector" && server.inject
  );
  const injectedProviders = [
    ...new Set(
      injected
        .map((server) => server.provider)
        .filter((provider): provider is string => Boolean(provider))
    ),
  ];
  const connectorTools = materializeConnectorTools(injectedProviders);
  if (connectorTools.length > 0) {
    const names = connectorTools
      .map((tool) => `\`tahcode tool ${tool.name}\``)
      .join(" / ");
    const label =
      injectedProviders.length === 1 && injectedProviders[0] === "linear"
        ? "Linear issue tools for mentioned `@linear` accounts"
        : "Connector tools for mentioned accounts";
    lines.push(
      `${label}: ${names} (same Convex invoke as ops tools; Claude also has them on the injected MCP server). Not Cursor marketplace MCP.`
    );
  } else {
    lines.push(
      "Provider-specific issue tools are injected only when the prompt mentions a connected `@linear` account."
    );
  }
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

/**
 * Tool-free turns (greetings, no `@linear`) skip MCP file / `--mcp-config`
 * and the connector prompt suffix. Mention ∩ connected still attaches.
 */
export function jobNeedsMcpAttachment(bundle: JobOpsBundle): boolean {
  if (bundle.mentionedConnectors.length > 0) {
    return true;
  }
  return bundle.mcp.servers.some(
    (server) => server.kind === "connector" && server.inject
  );
}

export function isJobMcpAttachNote(text: string): boolean {
  const trimmed = text.trim();
  return (
    trimmed.startsWith("tahcode ops MCP attached") ||
    trimmed.startsWith("tahcode ops tools via") ||
    trimmed.startsWith("tahcode ops tools unavailable")
  );
}
