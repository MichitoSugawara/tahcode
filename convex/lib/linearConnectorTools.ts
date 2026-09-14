import type { LinearAgentToolName } from "../../shared/linearAgentTools.ts";
import {
  linearActionInput,
  sanitizeConnectorToolResult,
} from "../../shared/linearAgentTools.ts";
import {
  executeLinearAction,
  getLinearManagedConnection,
  readOpenConnectorEnv,
} from "../../shared/openConnector.ts";

declare const process: { env: Record<string, string | undefined> };

export async function runLinearConnectorTool(input: {
  args: Record<string, unknown>;
  connectedAccountId: string;
  name: LinearAgentToolName;
  oauthAlias: string | null;
}): Promise<unknown> {
  const config = readOpenConnectorEnv(process.env);
  if (!config.runtimeToken && !config.adminToken) {
    throw new Error("Linear connector is unavailable on this deployment");
  }
  const mapped = linearActionInput(input.name, input.args);
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
      throw new Error("Linear is not connected. Reconnect it from Connectors.");
    }
    const raw = await executeLinearAction({
      actionId: mapped.actionId,
      config,
      connectionAlias: alias,
      input: mapped.input,
    });
    return sanitizeConnectorToolResult(raw);
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.startsWith("Linear is not connected")
    ) {
      throw error;
    }
    const message =
      error instanceof Error ? error.message : "Linear request failed";
    if (/openconnector|oomol|workers\.dev/i.test(message)) {
      throw new Error("Linear request failed", { cause: error });
    }
    throw error;
  }
}
