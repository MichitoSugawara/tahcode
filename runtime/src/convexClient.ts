import { ConvexHttpClient } from "convex/browser";

import { isConnectorActionToolName } from "../../shared/connectorActionCatalog.ts";
import { convexSiteUrl } from "../../shared/convexUrls.ts";
import type { FsBrowseResult } from "../../shared/filesystemBrowse.ts";
import type { ProviderOptionSelection } from "../../shared/modelOptions.ts";
import type { JobOpsBundle } from "../../shared/opsMcp.ts";
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

export type ClaimedFsBrowse = {
  _id: string;
  path: string;
};

export type ClaimedPtyOpen = {
  _id: string;
  cols: number;
  cwd: string;
  rows: number;
  terminalId: string;
};

export type ClaimedPtyInput = {
  close: boolean;
  cols?: number;
  data: string;
  rows?: number;
};

export type ClaimedPreview = {
  _id: string;
  url: string;
};

export type ClaimedScreen = {
  _id: string;
};

export type ClaimedScreenInputs = {
  displayHeight?: number;
  displayWidth?: number;
  events: {
    button?: string;
    code?: string;
    count?: number;
    dx?: number;
    dy?: number;
    key?: string;
    kind: string;
    modifiers?: string[];
    text?: string;
    x?: number;
    y?: number;
  }[];
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
  /** TAH-55/54: tahcode ops + mentioned Linear MCP inject plan. */
  opsBundle?: JobOpsBundle;
  prompt: string;
  runtimeId: string;
  skills?: {
    body: string;
    description: string;
    name: string;
    slug: string;
  }[];
  status: string;
  triggerMessageId: string;
}

export class RuntimeClient {
  private client: ConvexHttpClient;
  private convexUrl: string;

  constructor(convexUrl: string) {
    this.client = new ConvexHttpClient(convexUrl);
    this.convexUrl = convexUrl;
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

  async claimNextFsBrowse(
    runtimeId: string,
    token: string
  ): Promise<ClaimedFsBrowse | null> {
    return await this.client.mutation(
      "runtimeFs:claimNext" as never,
      { runtimeId, token } as never
    );
  }

  async completeFsBrowse(input: {
    error?: string;
    requestId: string;
    result?: FsBrowseResult;
    runtimeId: string;
    token: string;
  }): Promise<void> {
    await this.client.mutation("runtimeFs:complete" as never, input as never);
  }

  async claimNextPtyOpen(
    runtimeId: string,
    token: string
  ): Promise<ClaimedPtyOpen | null> {
    return await this.client.mutation(
      "workbenchPty:claimNextOpen" as never,
      { runtimeId, token } as never
    );
  }

  async listActivePty(runtimeId: string, token: string): Promise<string[]> {
    return await this.client.mutation(
      "workbenchPty:listActive" as never,
      { runtimeId, token } as never
    );
  }

  async reportPtyStarted(input: {
    error?: string;
    pid?: number;
    runtimeId: string;
    sessionId: string;
    token: string;
  }): Promise<void> {
    await this.client.mutation(
      "workbenchPty:reportStarted" as never,
      input as never
    );
  }

  async takePtyInput(input: {
    runtimeId: string;
    sessionId: string;
    token: string;
  }): Promise<ClaimedPtyInput | null> {
    return await this.client.mutation(
      "workbenchPty:takeInput" as never,
      input as never
    );
  }

  async appendPtyOutput(input: {
    data: string;
    runtimeId: string;
    sessionId: string;
    token: string;
  }): Promise<void> {
    await this.client.mutation(
      "workbenchPty:appendOutput" as never,
      input as never
    );
  }

  async reportPtyExited(input: {
    error?: string;
    exitCode?: number;
    runtimeId: string;
    sessionId: string;
    token: string;
  }): Promise<void> {
    await this.client.mutation(
      "workbenchPty:reportExited" as never,
      input as never
    );
  }

  async claimNextPreview(
    runtimeId: string,
    token: string
  ): Promise<ClaimedPreview | null> {
    return await this.client.mutation(
      "workbenchPreview:claimNext" as never,
      { runtimeId, token } as never
    );
  }

  async completePreview(input: {
    body?: string;
    contentType?: string;
    error?: string;
    httpStatus?: number;
    requestId: string;
    runtimeId: string;
    title?: string;
    token: string;
    url?: string;
  }): Promise<void> {
    await this.client.mutation(
      "workbenchPreview:complete" as never,
      input as never
    );
  }

  async claimNextScreen(
    runtimeId: string,
    token: string
  ): Promise<ClaimedScreen | null> {
    return await this.client.mutation(
      "workbenchScreen:claimNext" as never,
      { runtimeId, token } as never
    );
  }

  async generateScreenUploadUrl(input: {
    runtimeId: string;
    sessionId: string;
    token: string;
  }): Promise<string> {
    return await this.client.mutation(
      "workbenchScreen:generateUploadUrl" as never,
      input as never
    );
  }

  async claimScreenInputs(
    runtimeId: string,
    token: string
  ): Promise<ClaimedScreenInputs> {
    return await this.client.mutation(
      "workbenchScreen:claimInputs" as never,
      { runtimeId, token } as never
    );
  }

  async reportScreenFrame(input: {
    bytes: number;
    contentType: string;
    displayHeight?: number;
    displayWidth?: number;
    height?: number;
    runtimeId: string;
    sessionId: string;
    storageId: string;
    token: string;
    width?: number;
  }): Promise<void> {
    await this.client.mutation(
      "workbenchScreen:reportFrame" as never,
      input as never
    );
  }

  async reportScreenError(input: {
    error: string;
    fatal?: boolean;
    runtimeId: string;
    sessionId: string;
    token: string;
  }): Promise<void> {
    await this.client.mutation(
      "workbenchScreen:reportError" as never,
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
    /** Always send the claim lease. tahcode@0.1.0 omitted this and broke on leased jobs. */
    leaseId: string;
    runtimeId: string;
    text: string;
    token: string;
    type: "thinking" | "tool" | "text" | "error" | "done";
  }): Promise<void> {
    await this.client.mutation("jobs:appendEvent" as never, input as never);
  }

  async invokeTool(input: {
    argsJson: string;
    jobId: string;
    leaseId: string;
    name: string;
    runtimeId: string;
    token: string;
  }): Promise<{ name: string; resultJson: string }> {
    if (isConnectorActionToolName(input.name)) {
      return await this.client.action(
        "agentTools:invokeConnector" as never,
        input as never
      );
    }
    return await this.client.mutation(
      "agentTools:invoke" as never,
      input as never
    );
  }

  async ingestArtifact(input: {
    bytes: Uint8Array;
    contentType: string;
    jobId: string;
    leaseId: string;
    localPath?: string;
    name: string;
    runtimeId: string;
    token: string;
  }): Promise<{ key: string; name: string }> {
    const site = convexSiteUrl(this.convexUrl, {
      siteUrl: process.env.TAHCODE_SITE_URL ?? process.env.CONVEX_SITE_URL,
    });
    const headers: Record<string, string> = {
      "Content-Type": input.contentType,
      "X-File-Name": encodeURIComponent(input.name),
      "X-Job-Id": input.jobId,
      "X-Lease-Id": input.leaseId,
      "X-Runtime-Id": input.runtimeId,
      "X-Runtime-Token": input.token,
    };
    if (input.localPath) {
      headers["X-Local-Path"] = encodeURIComponent(input.localPath);
    }
    const response = await fetch(`${site}/artifacts/ingest`, {
      body: input.bytes,
      headers,
      method: "POST",
    });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(text || `Artifact ingest failed (${response.status})`);
    }
    const payload = (await response.json()) as {
      key?: unknown;
      name?: unknown;
    };
    if (typeof payload.key !== "string" || typeof payload.name !== "string") {
      throw new TypeError("Artifact ingest returned an invalid payload");
    }
    return { key: payload.key, name: payload.name };
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

  async shouldAbort(input: {
    jobId: string;
    leaseId: string;
    runtimeId: string;
    token: string;
  }): Promise<boolean> {
    return await this.client.mutation(
      "jobs:shouldAbort" as never,
      input as never
    );
  }
}
