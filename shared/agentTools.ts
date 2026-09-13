/**
 * Native tahcode agent tools (Phase 1).
 *
 * These are in-app tools the job's acting user can call — not a published
 * MCP product. The bridge injects the catalog (names + descriptions only)
 * and `tahcode tool` / an optional stdio host call Convex `agentTools:invoke`
 * with the runtime token + job lease. Skill bodies are never inlined here.
 */

export const BRIDGE_CAPABILITY_AGENT_TOOLS = "agentTools";

export const AGENT_TOOL_NAMES = [
  "list_orgs",
  "list_projects",
  "list_sessions",
  "get_session",
  "create_session",
  "switch_session",
  "send_message",
  "list_runtimes",
  "get_runtime_status",
] as const;

export type AgentToolName = (typeof AGENT_TOOL_NAMES)[number];

export const AGENT_TOOL_ENV = {
  JOB_ID: "TAHCODE_JOB_ID",
  LEASE_ID: "TAHCODE_LEASE_ID",
  RUNTIME_ID: "TAHCODE_RUNTIME_ID",
  TOKEN: "TAHCODE_TOKEN",
  URL: "TAHCODE_URL",
} as const;

export type AgentToolDefinition = {
  description: string;
  inputSchema: Record<string, unknown>;
  name: AgentToolName;
};

export type AgentToolJobAuth = {
  jobId: string;
  leaseId: string;
  runtimeId: string;
  token: string;
  url: string;
};

const STRING = { type: "string" } as const;
const BOOLEAN = { type: "boolean" } as const;
const INTEGER = { type: "integer" } as const;

export const AGENT_TOOLS: readonly AgentToolDefinition[] = [
  {
    description: "List organizations the acting user belongs to.",
    inputSchema: {
      additionalProperties: false,
      properties: {},
      type: "object",
    },
    name: "list_orgs",
  },
  {
    description:
      "List projects visible in an organization (defaults to the job org).",
    inputSchema: {
      additionalProperties: false,
      properties: { orgId: STRING },
      type: "object",
    },
    name: "list_projects",
  },
  {
    description:
      "List chats (sessions) the acting user can see. Defaults to the job org.",
    inputSchema: {
      additionalProperties: false,
      properties: {
        kind: { enum: ["dm", "project"], type: "string" },
        orgId: STRING,
        projectId: STRING,
      },
      type: "object",
    },
    name: "list_sessions",
  },
  {
    description:
      "Get one chat (session) plus recent messages. Defaults to the active tool session.",
    inputSchema: {
      additionalProperties: false,
      properties: { chatId: STRING, limit: INTEGER },
      type: "object",
    },
    name: "get_session",
  },
  {
    description:
      "Create a project chat or ensure the acting user's personal DM in an org.",
    inputSchema: {
      additionalProperties: false,
      properties: {
        driverKind: STRING,
        kind: { enum: ["dm", "project"], type: "string" },
        model: STRING,
        orgId: STRING,
        projectId: STRING,
        title: STRING,
        visibility: { enum: ["inherit", "private"], type: "string" },
      },
      type: "object",
    },
    name: "create_session",
  },
  {
    description:
      "Set the active tool session for later get_session / send_message calls on this job.",
    inputSchema: {
      additionalProperties: false,
      properties: { chatId: STRING },
      required: ["chatId"],
      type: "object",
    },
    name: "switch_session",
  },
  {
    description:
      "Send a message as the acting user. Defaults to the active tool session. Does not start another job in the chat this job is already running in unless dispatch is true.",
    inputSchema: {
      additionalProperties: false,
      properties: {
        body: STRING,
        chatId: STRING,
        dispatch: BOOLEAN,
        runtimeId: STRING,
      },
      required: ["body"],
      type: "object",
    },
    name: "send_message",
  },
  {
    description:
      "List machines in an organization and whether the acting user may use each (default-deny grants).",
    inputSchema: {
      additionalProperties: false,
      properties: { orgId: STRING },
      type: "object",
    },
    name: "list_runtimes",
  },
  {
    description:
      "Get one machine's online/offline status, staleness, installed CLIs, and whether the acting user may use it.",
    inputSchema: {
      additionalProperties: false,
      properties: { runtimeId: STRING },
      type: "object",
    },
    name: "get_runtime_status",
  },
] as const;

const TOOL_BY_NAME = new Map(
  AGENT_TOOLS.map((tool) => [tool.name, tool] as const)
);

export function isAgentToolName(value: string): value is AgentToolName {
  return TOOL_BY_NAME.has(value as AgentToolName);
}

export function agentToolDefinition(
  name: AgentToolName
): AgentToolDefinition | undefined {
  return TOOL_BY_NAME.get(name);
}

export function formatAgentToolCatalog(): string {
  const lines = AGENT_TOOLS.map(
    (tool) => `- ${tool.name}: ${tool.description}`
  );
  return [
    "tahcode tools (invoke with `tahcode tool <name> --args '{...}'` while this job runs; names and descriptions only — do not inline skill bodies):",
    ...lines,
  ].join("\n");
}

export function parseAgentToolArgsJson(raw: string): Record<string, unknown> {
  const trimmed = raw.trim();
  if (trimmed.length < 1) {
    return {};
  }
  if (trimmed.length > 20_000) {
    throw new Error("Tool arguments are too long");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed) as unknown;
  } catch {
    throw new Error("Tool arguments must be a JSON object");
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Tool arguments must be a JSON object");
  }
  return parsed as Record<string, unknown>;
}

export function optionalString(
  args: Record<string, unknown>,
  key: string
): string | undefined {
  const value = args[key];
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== "string") {
    throw new TypeError(`${key} must be a string`);
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function requiredString(
  args: Record<string, unknown>,
  key: string
): string {
  const value = optionalString(args, key);
  if (!value) {
    throw new Error(`${key} is required`);
  }
  return value;
}

export function optionalBoolean(
  args: Record<string, unknown>,
  key: string
): boolean | undefined {
  const value = args[key];
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== "boolean") {
    throw new TypeError(`${key} must be a boolean`);
  }
  return value;
}

export function optionalInteger(
  args: Record<string, unknown>,
  key: string,
  min: number,
  max: number
): number | undefined {
  const value = args[key];
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new TypeError(`${key} must be an integer`);
  }
  return Math.min(max, Math.max(min, value));
}

export function readAgentToolJobAuth(
  env: Record<string, string | undefined>
): AgentToolJobAuth | null {
  const url = env[AGENT_TOOL_ENV.URL]?.trim();
  const runtimeId = env[AGENT_TOOL_ENV.RUNTIME_ID]?.trim();
  const token = env[AGENT_TOOL_ENV.TOKEN]?.trim();
  const jobId = env[AGENT_TOOL_ENV.JOB_ID]?.trim();
  const leaseId = env[AGENT_TOOL_ENV.LEASE_ID]?.trim();
  if (!url || !runtimeId || !token || !jobId || !leaseId) {
    return null;
  }
  return { jobId, leaseId, runtimeId, token, url };
}

export function agentToolJobEnv(
  auth: AgentToolJobAuth
): Record<string, string> {
  return {
    [AGENT_TOOL_ENV.JOB_ID]: auth.jobId,
    [AGENT_TOOL_ENV.LEASE_ID]: auth.leaseId,
    [AGENT_TOOL_ENV.RUNTIME_ID]: auth.runtimeId,
    [AGENT_TOOL_ENV.TOKEN]: auth.token,
    [AGENT_TOOL_ENV.URL]: auth.url,
  };
}

/** Claude's headless CLI accepts `--mcp-config`. Other CLIs use `tahcode tool`. */
export function agentToolsMcpFlags(
  kind: string,
  mcpConfigPath: string | undefined
): string[] {
  if (!mcpConfigPath || kind !== "claudeAgent") {
    return [];
  }
  return ["--mcp-config", mcpConfigPath];
}
