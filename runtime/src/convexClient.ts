import { ConvexHttpClient } from "convex/browser";

import type { ProviderOptionSelection } from "../../shared/modelOptions.ts";
import type {
  InstallMethod,
  LiveModel,
  MaintenanceKind,
} from "../../shared/providerMaintenance.ts";
import type { ProviderDriverKind } from "../../shared/providers.ts";

/** One provider row in a heartbeat — mirrors `runtimeProviderReport` in convex/lib/validators.ts. */
export type ProviderReport = {
  available: boolean;
  binaryPath?: string;
  driverKind: ProviderDriverKind;
  installMethod?: InstallMethod;
  models?: LiveModel[];
  modelsCheckedAt?: number;
  modelsError?: string;
  updateCommand?: string;
  version?: string;
};

export type ClaimedCommand = {
  _id: string;
  driverKind: ProviderDriverKind;
  kind: MaintenanceKind;
};

export interface ClaimedJob {
  _id: string;
  assistantMessageId: string;
  chatId: string;
  contextJson: string;
  driverKind: ProviderDriverKind;
  leaseId: string;
  /** `@provider/model` slug for the CLI's model flag; absent = CLI default */
  model?: string;
  /** t3code option selections (effort / variant) applied as CLI flags */
  options?: ProviderOptionSelection[];
  prompt: string;
  runtimeId: string;
  status: string;
  triggerMessageId: string;
}

export class RuntimeClient {
  private client: ConvexHttpClient;

  constructor(convexUrl: string) {
    this.client = new ConvexHttpClient(convexUrl);
  }

  async heartbeat(input: {
    bridgeVersion?: string;
    capabilities?: string[];
    hostname?: string;
    providers: ProviderReport[];
    runtimeId: string;
    token: string;
  }): Promise<void> {
    await this.client.mutation(
      "jobs:heartbeat" as never,
      {
        bridgeVersion: input.bridgeVersion,
        capabilities: input.capabilities,
        hostname: input.hostname,
        providers: input.providers,
        runtimeId: input.runtimeId,
        token: input.token,
      } as never
    );
  }

  /* ── maintenance commands (owner-triggered, allowlisted on the machine) ── */

  async claimNextCommand(
    runtimeId: string,
    token: string
  ): Promise<ClaimedCommand | null> {
    return await this.client.mutation(
      "runtimeCommands:claimNext" as never,
      { runtimeId, token } as never
    );
  }

  async appendCommandLog(input: {
    command?: string;
    commandId: string;
    runtimeId: string;
    text: string;
    token: string;
    versionBefore?: string;
  }): Promise<void> {
    await this.client.mutation(
      "runtimeCommands:appendLog" as never,
      input as never
    );
  }

  async completeCommand(input: {
    commandId: string;
    error?: string;
    runtimeId: string;
    text?: string;
    token: string;
    versionAfter?: string;
  }): Promise<void> {
    await this.client.mutation(
      "runtimeCommands:complete" as never,
      input as never
    );
  }

  async claimNext(
    runtimeId: string,
    token: string
  ): Promise<ClaimedJob | null> {
    return await this.client.mutation(
      "jobs:claimNext" as never,
      {
        runtimeId,
        token,
      } as never
    );
  }

  async appendEvent(input: {
    jobId: string;
    leaseId: string;
    runtimeId: string;
    text: string;
    token: string;
    type: "thinking" | "tool" | "text" | "error" | "done";
  }): Promise<void> {
    await this.client.mutation("jobs:appendEvent" as never, input as never);
  }

  async complete(input: {
    error?: string;
    finalText?: string;
    jobId: string;
    leaseId: string;
    runtimeId: string;
    token: string;
  }): Promise<void> {
    await this.client.mutation("jobs:complete" as never, input as never);
  }
}
