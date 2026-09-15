/**
 * Thin Linear aliases over the generic connector Action catalog (TAH-65).
 *
 * New Linear Actions belong in `shared/connectorActionCatalog.ts`. This file
 * only re-exports the materialized Linear slice so TAH-54 call sites keep
 * working. Do not add another hand-written Linear tool switch here.
 */

import {
  CONNECTOR_ACTION_CATALOG,
  LINEAR_CREATE_ISSUE_ACTION,
  LINEAR_LIST_ISSUES_ACTION,
  LINEAR_LIST_TEAMS_ACTION,
  LINEAR_SEARCH_ISSUES_ACTION,
  LINEAR_UPDATE_ISSUE_ACTION,
  isConnectorActionToolName,
  mapConnectorActionInput,
  materializeConnectorTools,
  sanitizeConnectorToolResult,
} from "./connectorActionCatalog.ts";
import type {
  ConnectorActionToolName,
  ConnectorToolDefinition,
} from "./connectorActionCatalog.ts";

export {
  LINEAR_CREATE_ISSUE_ACTION,
  LINEAR_LIST_ISSUES_ACTION,
  LINEAR_LIST_TEAMS_ACTION,
  LINEAR_SEARCH_ISSUES_ACTION,
  LINEAR_UPDATE_ISSUE_ACTION,
  sanitizeConnectorToolResult,
};

export type LinearAgentToolName = Extract<
  ConnectorActionToolName,
  | "list_linear_issues"
  | "search_linear_issues"
  | "create_linear_issue"
  | "update_linear_issue"
  | "list_linear_teams"
>;

export type LinearAgentToolDefinition = ConnectorToolDefinition & {
  name: LinearAgentToolName;
};

export const LINEAR_AGENT_TOOLS = materializeConnectorTools(
  "linear"
) as LinearAgentToolDefinition[];

export const LINEAR_AGENT_TOOL_NAMES = LINEAR_AGENT_TOOLS.map(
  (tool) => tool.name
);

export function isLinearAgentToolName(
  value: string
): value is LinearAgentToolName {
  return (
    isConnectorActionToolName(value) &&
    CONNECTOR_ACTION_CATALOG.some(
      (row) => row.provider === "linear" && row.toolName === value
    )
  );
}

export function linearActionInput(
  name: LinearAgentToolName,
  args: Record<string, unknown>
): { actionId: string; input: Record<string, unknown> } {
  return mapConnectorActionInput(name, args);
}
