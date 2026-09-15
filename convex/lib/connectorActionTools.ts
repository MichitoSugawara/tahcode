import {
  connectorActionByToolName,
  connectorProviderLabel,
  mapConnectorActionInput,
  sanitizeConnectorToolResult,
} from "../../shared/connectorActionCatalog.ts";
import {
  executeLinearAction,
  getLinearManagedConnection,
  readOpenConnectorEnv,
} from "../../shared/openConnector.ts";

declare const process: { env: Record<string, string | undefined> };

export async function runConnectorAction(input: {
  args: Record<string, unknown>;
  connectedAccountId: string;
  name: string;
  oauthAlias: string | null;
}): Promise<unknown> {
  const action = connectorActionByToolName(input.name);
  if (!action) {
    throw new Error("Unknown tool");
  }
  const config = readOpenConnectorEnv(process.env);
  if (!config.runtimeToken && !config.adminToken) {
    throw new Error(
      `${connectorProviderLabel(action.provider)} connector is unavailable on this deployment`
    );
  }
  const mapped = mapConnectorActionInput(input.name, input.args);
  const disconnected = `${connectorProviderLabel(action.provider)} is not connected. Reconnect it from Connectors.`;
  try {
    let alias = input.oauthAlias?.trim() ?? "";
    if (alias.length < 1) {
      const managed = await getLinearManagedConnection({
        appId: input.connectedAccountId,
        config,
      });
      alias = managed.alias;
    }
    if (alias.length < 1) {
      throw new Error(disconnected);
    }
    const raw = await executeLinearAction({
      actionId: mapped.actionId,
      config,
      connectionAlias: alias,
      input: mapped.input,
    });
    return sanitizeConnectorToolResult(raw);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith(disconnected)) {
      throw error;
    }
    const message =
      error instanceof Error
        ? error.message
        : `${action.provider} request failed`;
    if (/openconnector|oomol|workers\.dev/i.test(message)) {
      throw new Error(
        `${connectorProviderLabel(action.provider)} request failed`,
        {
          cause: error,
        }
      );
    }
    throw error;
  }
}
