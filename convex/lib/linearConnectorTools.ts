import type { LinearAgentToolName } from "../../shared/linearAgentTools.ts";
import { runConnectorAction } from "./connectorActionTools";

/** Linear slice of the generic connector Action catalog. */
export async function runLinearConnectorTool(input: {
  args: Record<string, unknown>;
  connectedAccountId: string;
  name: LinearAgentToolName;
  oauthAlias: string | null;
}): Promise<unknown> {
  return await runConnectorAction(input);
}
