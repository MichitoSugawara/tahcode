import { ConvexHttpClient } from "convex/browser";

import type { ProviderDriverKind } from "../../shared/providers.ts";

export interface ClaimedJob {
  _id: string;
  chatId: string;
  triggerMessageId: string;
  assistantMessageId: string;
  leaseId: string;
  runtimeId: string;
  driverKind: ProviderDriverKind;
  /** `@provider/model` slug for the CLI's model flag; absent = CLI default */
  model?: string;
  status: string;
  prompt: string;
  contextJson: string;
}

export class RuntimeClient {
  private client: ConvexHttpClient;

  constructor(convexUrl: string) {
    this.client = new ConvexHttpClient(convexUrl);
  }

  async heartbeat(input: {
    runtimeId: string;
    token: string;
    hostname?: string;
    providers: {
      driverKind: ProviderDriverKind;
      available: boolean;
      version?: string;
      binaryPath?: string;
    }[];
  }): Promise<void> {
    await this.client.mutation(
      "jobs:heartbeat" as never,
      {
        hostname: input.hostname,
        providers: input.providers,
        runtimeId: input.runtimeId,
        token: input.token,
      } as never
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
