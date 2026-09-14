/**
 * tahcode-owned Linear issue tools (TAH-54).
 *
 * These call OpenConnector Actions from Convex (`agentTools:invokeConnector`).
 * Tokens and gateway URLs stay on the server. Tool names are Linear product
 * terms — never OpenConnector / OOMOL / workers.dev.
 */

export const LINEAR_AGENT_TOOL_NAMES = [
  "list_linear_issues",
  "search_linear_issues",
  "create_linear_issue",
  "update_linear_issue",
] as const;

export type LinearAgentToolName = (typeof LINEAR_AGENT_TOOL_NAMES)[number];

export const LINEAR_LIST_ISSUES_ACTION = "linear.list_linear_issues";
export const LINEAR_SEARCH_ISSUES_ACTION = "linear.search_issues";
export const LINEAR_CREATE_ISSUE_ACTION = "linear.create_linear_issue";
export const LINEAR_UPDATE_ISSUE_ACTION = "linear.update_issue";

const STRING = { type: "string" } as const;
const BOOLEAN = { type: "boolean" } as const;
const INTEGER = { type: "integer" } as const;

export type LinearAgentToolDefinition = {
  description: string;
  inputSchema: Record<string, unknown>;
  name: LinearAgentToolName;
};

export const LINEAR_AGENT_TOOLS: readonly LinearAgentToolDefinition[] = [
  {
    description:
      "List issues from the tahcode-owned Linear connector mentioned in this job (`@linear`). Not Cursor marketplace MCP.",
    inputSchema: {
      additionalProperties: false,
      properties: {
        after: STRING,
        assigneeId: STRING,
        connectionId: STRING,
        limit: INTEGER,
        projectId: STRING,
      },
      type: "object",
    },
    name: "list_linear_issues",
  },
  {
    description:
      "Search issues on the tahcode-owned Linear connector mentioned in this job.",
    inputSchema: {
      additionalProperties: false,
      properties: {
        after: STRING,
        connectionId: STRING,
        includeArchived: BOOLEAN,
        limit: INTEGER,
        query: STRING,
      },
      required: ["query"],
      type: "object",
    },
    name: "search_linear_issues",
  },
  {
    description:
      "Create a Linear issue on the mentioned tahcode-owned connector. teamId is required.",
    inputSchema: {
      additionalProperties: false,
      properties: {
        assigneeId: STRING,
        connectionId: STRING,
        description: STRING,
        teamId: STRING,
        title: STRING,
      },
      required: ["teamId", "title"],
      type: "object",
    },
    name: "create_linear_issue",
  },
  {
    description:
      "Update a Linear issue on the mentioned tahcode-owned connector. issueId is required.",
    inputSchema: {
      additionalProperties: false,
      properties: {
        connectionId: STRING,
        description: STRING,
        issueId: STRING,
        stateId: STRING,
        title: STRING,
      },
      required: ["issueId"],
      type: "object",
    },
    name: "update_linear_issue",
  },
];

const LINEAR_TOOL_BY_NAME = new Map(
  LINEAR_AGENT_TOOLS.map((tool) => [tool.name, tool] as const)
);

export function isLinearAgentToolName(
  value: string
): value is LinearAgentToolName {
  return LINEAR_TOOL_BY_NAME.has(value as LinearAgentToolName);
}

const SECRET_RESULT_KEY_RE =
  /^(alias|oauthAlias|oauthRequestId|accessToken|refreshToken|authorization|adminToken|runtimeToken|connectedAccountId)$/i;
const SECRET_RESULT_TEXT_RE =
  /openconnector|oomol|workers\.dev|oct_[a-z0-9]|Bearer\s+[A-Za-z0-9._-]+/i;

export function sanitizeConnectorToolResult(value: unknown): unknown {
  if (typeof value === "string") {
    return SECRET_RESULT_TEXT_RE.test(value) ? "[redacted]" : value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeConnectorToolResult(item));
  }
  if (value === null || typeof value !== "object") {
    return value;
  }
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    if (SECRET_RESULT_KEY_RE.test(key)) {
      continue;
    }
    out[key] = sanitizeConnectorToolResult(item);
  }
  return out;
}

function optionalString(
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

function requiredString(args: Record<string, unknown>, key: string): string {
  const value = optionalString(args, key);
  if (!value) {
    throw new Error(`${key} is required`);
  }
  return value;
}

function optionalBoolean(
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

function optionalInteger(
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

function compactRecord(
  record: Record<string, string | number | boolean | string[] | undefined>
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    if (value !== undefined) {
      out[key] = value;
    }
  }
  return out;
}

function pageSize(args: Record<string, unknown>): number | undefined {
  return (
    optionalInteger(args, "limit", 1, 50) ??
    optionalInteger(args, "first", 1, 50)
  );
}

function requiredAlias(
  args: Record<string, unknown>,
  keys: readonly [string, ...string[]]
): string {
  for (const key of keys) {
    const value = optionalString(args, key);
    if (value) {
      return value;
    }
  }
  return requiredString(args, keys[0]);
}

export function linearActionInput(
  name: LinearAgentToolName,
  args: Record<string, unknown>
): { actionId: string; input: Record<string, unknown> } {
  switch (name) {
    case "list_linear_issues":
      return {
        actionId: LINEAR_LIST_ISSUES_ACTION,
        input: compactRecord({
          after: optionalString(args, "after"),
          assignee_id:
            optionalString(args, "assigneeId") ??
            optionalString(args, "assignee_id"),
          first: pageSize(args),
          project_id:
            optionalString(args, "projectId") ??
            optionalString(args, "project_id"),
        }),
      };
    case "search_linear_issues":
      return {
        actionId: LINEAR_SEARCH_ISSUES_ACTION,
        input: compactRecord({
          after: optionalString(args, "after"),
          first: pageSize(args),
          include_archived: optionalBoolean(args, "includeArchived"),
          query: requiredString(args, "query"),
        }),
      };
    case "create_linear_issue":
      return {
        actionId: LINEAR_CREATE_ISSUE_ACTION,
        input: compactRecord({
          assignee_id: optionalString(args, "assigneeId"),
          description: optionalString(args, "description"),
          team_id: requiredAlias(args, ["teamId", "team_id"]),
          title: requiredString(args, "title"),
        }),
      };
    case "update_linear_issue":
      return {
        actionId: LINEAR_UPDATE_ISSUE_ACTION,
        input: compactRecord({
          description: optionalString(args, "description"),
          issueId: requiredAlias(args, ["issueId", "issue_id"]),
          stateId: optionalString(args, "stateId"),
          title: optionalString(args, "title"),
        }),
      };
    default: {
      const _exhaustive: never = name;
      return _exhaustive;
    }
  }
}
