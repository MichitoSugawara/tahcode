import { ConvexHttpClient } from "convex/browser";
import type { ProviderDriverKind } from "../../shared/providers.ts";

export type ClaimedJob = {
  _id: string;
  chatId: string;
  triggerMessageId: string;
  assistantMessageId: string;
  runtimeId: string;
  driverKind: ProviderDriverKind;
  status: string;
  prompt: string;
  contextJson: string;
};

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
    await this.client.mutation("jobs:heartbeat" as never, {
      runtimeId: input.runtimeId,
      token: input.token,
      hostname: input.hostname,
      providers: input.providers,
    } as never);
  }

  async claimNext(runtimeId: string, token: string): Promise<ClaimedJob | null> {
    return await this.client.mutation("jobs:claimNext" as never, {
      runtimeId,
      token,
    } as never);
  }

  async appendEvent(input: {
    runtimeId: string;
    token: string;
    jobId: string;
    type: "thinking" | "tool" | "text" | "error" | "done";
    text: string;
  }): Promise<void> {
    await this.client.mutation("jobs:appendEvent" as never, input as never);
  }

  async complete(input: {
    runtimeId: string;
    token: string;
    jobId: string;
    finalText?: string;
    error?: string;
  }): Promise<void> {
    await this.client.mutation("jobs:complete" as never, input as never);
  }
}
