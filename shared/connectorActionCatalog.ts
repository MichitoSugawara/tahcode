/**
 * Generic connector Action catalog (TAH-65).
 *
 * Connector Actions are declared once here, then materialized into the same
 * tool list for Claude `--mcp-config` and Cursor `tahcode tool`. Adding a
 * Linear Action is a catalog row — not a new tool file, Convex handler, or
 * MCP host switch. Tokens and gateway URLs stay on Convex.
 *
 * Agent-facing names and descriptions use product terms only — never
 * OpenConnector / OOMOL / workers.dev.
 */

const STRING_SCHEMA = { type: "string" } as const;
const BOOLEAN_SCHEMA = { type: "boolean" } as const;
const INTEGER_SCHEMA = { type: "integer" } as const;

export const LINEAR_LIST_ISSUES_ACTION = "linear.list_linear_issues";
export const LINEAR_SEARCH_ISSUES_ACTION = "linear.search_issues";
export const LINEAR_CREATE_ISSUE_ACTION = "linear.create_linear_issue";
export const LINEAR_UPDATE_ISSUE_ACTION = "linear.update_issue";
export const LINEAR_LIST_TEAMS_ACTION = "linear.list_linear_teams";
export const GITHUB_LIST_REPOS_ACTION = "github.list_my_repositories";
export const GITHUB_LIST_ISSUES_ACTION = "github.list_repository_issues";
export const GITHUB_SEARCH_ISSUES_ACTION =
  "github.search_issues_and_pull_requests";
export const GITHUB_CREATE_ISSUE_ACTION = "github.create_issue";
export const GITHUB_UPDATE_ISSUE_ACTION = "github.update_issue";

export type ConnectorActionFieldType = "boolean" | "integer" | "string";

export type ConnectorActionField = {
  /** Backend Action input key. Defaults to `name`. `null` omits the field. */
  actionKey?: string | null;
  aliases?: readonly string[];
  integerMax?: number;
  integerMin?: number;
  name: string;
  omitFromAction?: boolean;
  required?: boolean;
  type: ConnectorActionFieldType;
};

export type ConnectorActionDescriptor = {
  actionId: string;
  description: string;
  fields: readonly ConnectorActionField[];
  provider: string;
  toolName: string;
};

export type ConnectorToolDefinition = {
  description: string;
  inputSchema: Record<string, unknown>;
  name: string;
};

const CONNECTION_ID_FIELD = {
  name: "connectionId",
  omitFromAction: true,
  type: "string",
} as const satisfies ConnectorActionField;

const PAGE_SIZE_FIELD = {
  actionKey: "first",
  aliases: ["first"],
  integerMax: 50,
  integerMin: 1,
  name: "limit",
  type: "integer",
} as const satisfies ConnectorActionField;

export const CONNECTOR_ACTION_CATALOG = [
  {
    actionId: LINEAR_LIST_ISSUES_ACTION,
    description:
      "List issues from the tahcode-owned Linear connector mentioned in this job (`@linear`). Not Cursor marketplace MCP.",
    fields: [
      { name: "after", type: "string" },
      {
        actionKey: "assignee_id",
        aliases: ["assignee_id"],
        name: "assigneeId",
        type: "string",
      },
      CONNECTION_ID_FIELD,
      PAGE_SIZE_FIELD,
      {
        actionKey: "project_id",
        aliases: ["project_id"],
        name: "projectId",
        type: "string",
      },
    ],
    provider: "linear",
    toolName: "list_linear_issues",
  },
  {
    actionId: LINEAR_SEARCH_ISSUES_ACTION,
    description:
      "Search issues on the tahcode-owned Linear connector mentioned in this job.",
    fields: [
      { name: "after", type: "string" },
      CONNECTION_ID_FIELD,
      {
        actionKey: "include_archived",
        name: "includeArchived",
        type: "boolean",
      },
      PAGE_SIZE_FIELD,
      { name: "query", required: true, type: "string" },
    ],
    provider: "linear",
    toolName: "search_linear_issues",
  },
  {
    actionId: LINEAR_CREATE_ISSUE_ACTION,
    description:
      "Create a Linear issue on the mentioned tahcode-owned connector. teamId is required.",
    fields: [
      { actionKey: "assignee_id", name: "assigneeId", type: "string" },
      CONNECTION_ID_FIELD,
      { name: "description", type: "string" },
      {
        actionKey: "team_id",
        aliases: ["team_id"],
        name: "teamId",
        required: true,
        type: "string",
      },
      { name: "title", required: true, type: "string" },
    ],
    provider: "linear",
    toolName: "create_linear_issue",
  },
  {
    actionId: LINEAR_UPDATE_ISSUE_ACTION,
    description:
      "Update a Linear issue on the mentioned tahcode-owned connector. issueId is required.",
    fields: [
      CONNECTION_ID_FIELD,
      { name: "description", type: "string" },
      {
        aliases: ["issue_id"],
        name: "issueId",
        required: true,
        type: "string",
      },
      { name: "stateId", type: "string" },
      { name: "title", type: "string" },
    ],
    provider: "linear",
    toolName: "update_linear_issue",
  },
  {
    actionId: LINEAR_LIST_TEAMS_ACTION,
    description:
      "List teams on the mentioned tahcode-owned Linear connector. Use before create_linear_issue when teamId is unknown.",
    fields: [CONNECTION_ID_FIELD],
    provider: "linear",
    toolName: "list_linear_teams",
  },
  {
    actionId: GITHUB_LIST_REPOS_ACTION,
    description:
      "List repositories visible to the tahcode-owned GitHub connector mentioned in this job (`@github`). Not Cursor marketplace MCP.",
    fields: [
      CONNECTION_ID_FIELD,
      {
        actionKey: "perPage",
        integerMax: 100,
        integerMin: 1,
        name: "limit",
        type: "integer",
      },
      { integerMin: 1, name: "page", type: "integer" },
      { name: "visibility", type: "string" },
    ],
    provider: "github",
    toolName: "list_github_repos",
  },
  {
    actionId: GITHUB_LIST_ISSUES_ACTION,
    description:
      "List issues on a repository via the mentioned tahcode-owned GitHub connector. owner and repo are required.",
    fields: [
      CONNECTION_ID_FIELD,
      {
        actionKey: "perPage",
        integerMax: 100,
        integerMin: 1,
        name: "limit",
        type: "integer",
      },
      { name: "owner", required: true, type: "string" },
      { integerMin: 1, name: "page", type: "integer" },
      { name: "repo", required: true, type: "string" },
      { name: "state", type: "string" },
    ],
    provider: "github",
    toolName: "list_github_issues",
  },
  {
    actionId: GITHUB_SEARCH_ISSUES_ACTION,
    description:
      "Search issues and pull requests on the mentioned tahcode-owned GitHub connector.",
    fields: [
      CONNECTION_ID_FIELD,
      {
        actionKey: "perPage",
        integerMax: 100,
        integerMin: 1,
        name: "limit",
        type: "integer",
      },
      { name: "owner", type: "string" },
      { integerMin: 1, name: "page", type: "integer" },
      { name: "query", type: "string" },
      { name: "repo", type: "string" },
      { name: "state", type: "string" },
    ],
    provider: "github",
    toolName: "search_github_issues",
  },
  {
    actionId: GITHUB_CREATE_ISSUE_ACTION,
    description:
      "Create a GitHub issue on the mentioned tahcode-owned connector. owner, repo, and title are required.",
    fields: [
      { name: "body", type: "string" },
      CONNECTION_ID_FIELD,
      { name: "owner", required: true, type: "string" },
      { name: "repo", required: true, type: "string" },
      { name: "title", required: true, type: "string" },
    ],
    provider: "github",
    toolName: "create_github_issue",
  },
  {
    actionId: GITHUB_UPDATE_ISSUE_ACTION,
    description:
      "Update a GitHub issue on the mentioned tahcode-owned connector. owner, repo, and issueNumber are required.",
    fields: [
      { name: "body", type: "string" },
      CONNECTION_ID_FIELD,
      {
        integerMin: 1,
        name: "issueNumber",
        required: true,
        type: "integer",
      },
      { name: "owner", required: true, type: "string" },
      { name: "repo", required: true, type: "string" },
      { name: "state", type: "string" },
      { name: "title", type: "string" },
    ],
    provider: "github",
    toolName: "update_github_issue",
  },
] as const satisfies readonly ConnectorActionDescriptor[];

export type ConnectorActionToolName =
  (typeof CONNECTOR_ACTION_CATALOG)[number]["toolName"];

export function connectorActionToolNames(
  catalog: readonly ConnectorActionDescriptor[] = CONNECTOR_ACTION_CATALOG
): string[] {
  return catalog.map((row) => row.toolName);
}

const CATALOG_BY_TOOL_NAME = new Map<string, ConnectorActionDescriptor>(
  CONNECTOR_ACTION_CATALOG.map((row) => [row.toolName, row])
);

const SECRET_RESULT_KEY_RE =
  /^(alias|oauthAlias|oauthRequestId|accessToken|refreshToken|authorization|adminToken|runtimeToken|connectedAccountId)$/i;
const SECRET_RESULT_TEXT_RE =
  /openconnector|oomol|workers\.dev|oct_[a-z0-9]|Bearer\s+[A-Za-z0-9._-]+/i;

export function connectorActionByToolName(
  name: string,
  catalog: readonly ConnectorActionDescriptor[] = CONNECTOR_ACTION_CATALOG
): ConnectorActionDescriptor | undefined {
  if (catalog === CONNECTOR_ACTION_CATALOG) {
    return CATALOG_BY_TOOL_NAME.get(name);
  }
  return catalog.find((row) => row.toolName === name);
}

export function isConnectorActionToolName(
  value: string,
  catalog: readonly ConnectorActionDescriptor[] = CONNECTOR_ACTION_CATALOG
): value is ConnectorActionToolName {
  return connectorActionByToolName(value, catalog) !== undefined;
}

export function hasConnectorActions(
  provider: string,
  catalog: readonly ConnectorActionDescriptor[] = CONNECTOR_ACTION_CATALOG
): boolean {
  return catalog.some((row) => row.provider === provider);
}

export function connectorActionProviders(
  catalog: readonly ConnectorActionDescriptor[] = CONNECTOR_ACTION_CATALOG
): string[] {
  const seen = new Set<string>();
  const providers: string[] = [];
  for (const row of catalog) {
    if (seen.has(row.provider)) {
      continue;
    }
    seen.add(row.provider);
    providers.push(row.provider);
  }
  return providers;
}

export function materializeConnectorTools(
  providers: string | readonly string[],
  catalog: readonly ConnectorActionDescriptor[] = CONNECTOR_ACTION_CATALOG
): ConnectorToolDefinition[] {
  const wanted = new Set(
    (typeof providers === "string" ? [providers] : providers).filter(
      (provider) => provider.length > 0
    )
  );
  if (wanted.size < 1) {
    return [];
  }
  return catalog
    .filter((row) => wanted.has(row.provider))
    .map((row) => ({
      description: row.description,
      inputSchema: connectorActionInputSchema(row),
      name: row.toolName,
    }));
}

export function connectorActionInputSchema(
  action: ConnectorActionDescriptor
): Record<string, unknown> {
  const properties: Record<string, { type: ConnectorActionFieldType }> = {};
  const required: string[] = [];
  for (const field of action.fields) {
    properties[field.name] =
      field.type === "boolean"
        ? BOOLEAN_SCHEMA
        : field.type === "integer"
          ? INTEGER_SCHEMA
          : STRING_SCHEMA;
    if (field.required) {
      required.push(field.name);
    }
  }
  const schema: Record<string, unknown> = {
    additionalProperties: false,
    properties,
    type: "object",
  };
  if (required.length > 0) {
    schema.required = required;
  }
  return schema;
}

export function mapConnectorActionInput(
  name: string,
  args: Record<string, unknown>,
  catalog: readonly ConnectorActionDescriptor[] = CONNECTOR_ACTION_CATALOG
): { actionId: string; input: Record<string, unknown> } {
  const action = connectorActionByToolName(name, catalog);
  if (!action) {
    throw new Error("Unknown tool");
  }
  const input: Record<string, unknown> = {};
  for (const field of action.fields) {
    if (field.omitFromAction || field.actionKey === null) {
      continue;
    }
    const value = readActionField(args, field);
    if (value === undefined) {
      if (field.required) {
        throw new Error(`${field.name} is required`);
      }
      continue;
    }
    input[field.actionKey ?? field.name] = value;
  }
  return { actionId: action.actionId, input };
}

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

export function connectorProviderLabel(provider: string): string {
  if (provider === "linear") {
    return "Linear";
  }
  if (provider === "github") {
    return "GitHub";
  }
  return "Plugin";
}

function readActionField(
  args: Record<string, unknown>,
  field: ConnectorActionField
): string | boolean | number | undefined {
  const keys = [field.name, ...(field.aliases ?? [])];
  for (const key of keys) {
    if (!(key in args) || args[key] === undefined || args[key] === null) {
      continue;
    }
    if (field.type === "string") {
      return requiredFieldString(args, key);
    }
    if (field.type === "boolean") {
      return requiredFieldBoolean(args, key);
    }
    return requiredFieldInteger(
      args,
      key,
      field.integerMin ?? Number.MIN_SAFE_INTEGER,
      field.integerMax ?? Number.MAX_SAFE_INTEGER
    );
  }
  return undefined;
}

function requiredFieldString(
  args: Record<string, unknown>,
  key: string
): string | undefined {
  const value = args[key];
  if (typeof value !== "string") {
    throw new TypeError(`${key} must be a string`);
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function requiredFieldBoolean(
  args: Record<string, unknown>,
  key: string
): boolean {
  const value = args[key];
  if (typeof value !== "boolean") {
    throw new TypeError(`${key} must be a boolean`);
  }
  return value;
}

function requiredFieldInteger(
  args: Record<string, unknown>,
  key: string,
  min: number,
  max: number
): number {
  const value = args[key];
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new TypeError(`${key} must be an integer`);
  }
  return Math.min(max, Math.max(min, value));
}
