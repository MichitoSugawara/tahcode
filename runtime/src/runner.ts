import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  AGENT_TOOL_ENV,
  BRIDGE_CAPABILITY_AGENT_TOOLS,
  formatInjectedConnectorsEnv,
} from "../../shared/agentTools.ts";
import type { StreamArtifact } from "../../shared/artifacts.ts";
import { staleAgentToolsHostLogLine } from "../../shared/cliVersion.ts";
import { applyImagegenDraft } from "../../shared/harnessFeatures.ts";
import { BRIDGE_CAPABILITY_JOB_CANCEL } from "../../shared/jobs.ts";
import type { ProviderOptionSelection } from "../../shared/modelOptions.ts";
import {
  formatJobMcpAttachNote,
  formatJobOpsPromptSuffix,
  injectedConnectorConnections,
  injectedMcpServerNames,
} from "../../shared/opsMcp.ts";
import type { JobOpsBundle } from "../../shared/opsMcp.ts";
import {
  BRIDGE_CAPABILITY_LIVE_MODELS,
  BRIDGE_CAPABILITY_MAINTENANCE,
  PROVIDER_MAINTENANCE,
  modelsCommandLabel,
  supportsLiveModels,
  updateCommandLabel,
} from "../../shared/providerMaintenance.ts";
import type { ProviderDriverKind } from "../../shared/providers.ts";
import {
  agentToolsPromptSuffix,
  jobAgentToolEnv,
  probeToolSubcommand,
  writeAgentToolShim,
  writeAgentToolsMcpConfig,
} from "./agentToolsHost.ts";
import { composeFinalText, materializeJobArtifacts } from "./artifacts.ts";
import type { ClaimedCommand, ProviderReport } from "./convexClient.ts";
import { RuntimeClient } from "./convexClient.ts";
import type { ModelsDiscovery } from "./maintenance.ts";
import { discoverModels, plannedUpdate, runUpdate } from "./maintenance.ts";
import type { ProviderProbe } from "./providers.ts";
import { probeProviders, probeVersion, runHeadless } from "./providers.ts";
import { skillSyncSummary, syncProfileSkills } from "./skillsSync.ts";

export interface RunnerOptions {
  convexUrl: string;
  runtimeId: string;
  token: string;
  cwd?: string;
  pollMs?: number;
  heartbeatMs?: number;
  /** How often to re-run each CLI's `models` command (they hit the network). */
  modelsRefreshMs?: number;
  preferredKind?: ProviderDriverKind;
  /** tahcode CLI version, reported so the UI can tell an old bridge from a missing feature. */
  bridgeVersion?: string;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const BRIDGE_CAPABILITIES = [
  BRIDGE_CAPABILITY_MAINTENANCE,
  BRIDGE_CAPABILITY_LIVE_MODELS,
  BRIDGE_CAPABILITY_AGENT_TOOLS,
  BRIDGE_CAPABILITY_JOB_CANCEL,
];

/**
 * Live model catalogs, one per provider, refreshed lazily: a CLI's `models`
 * command talks to the vendor, so it runs at startup, every `modelsRefreshMs`,
 * and right after a refresh / update command — not on every heartbeat.
 */
class ModelCache {
  private entries = new Map<ProviderDriverKind, ModelsDiscovery>();
  private refreshMs: number;

  constructor(refreshMs: number) {
    this.refreshMs = refreshMs;
  }

  get(kind: ProviderDriverKind): ModelsDiscovery | undefined {
    return this.entries.get(kind);
  }

  stale(kind: ProviderDriverKind): boolean {
    const entry = this.entries.get(kind);
    return !entry || Date.now() - entry.checkedAt > this.refreshMs;
  }

  async refresh(probe: ProviderProbe): Promise<ModelsDiscovery> {
    const discovery = await discoverModels(probe.kind, probe.binary);
    this.entries.set(probe.kind, discovery);
    return discovery;
  }

  /** Refresh whatever is stale among installed providers that have a models command. */
  async refreshStale(probes: ProviderProbe[]): Promise<void> {
    for (const probe of probes) {
      if (
        !probe.available ||
        !supportsLiveModels(probe.kind) ||
        !this.stale(probe.kind)
      ) {
        continue;
      }
      const discovery = await this.refresh(probe);
      console.log(
        `[runtime] models ${probe.kind}: ${discovery.models.length > 0 ? `${discovery.models.length} live` : `static (${discovery.error ?? "none"})`}`
      );
    }
  }

  forget(kind: ProviderDriverKind): void {
    this.entries.delete(kind);
  }
}

export function reportFor(
  probe: ProviderProbe,
  models?: ModelsDiscovery
): ProviderReport {
  const report: ProviderReport = {
    available: probe.available,
    binaryPath: probe.binary ?? undefined,
    driverKind: probe.kind,
    installMethod: probe.installMethod,
    updateCommand: probe.updateCommand,
    version: probe.version ?? undefined,
  };
  if (models) {
    report.models = models.models;
    report.modelsCheckedAt = models.checkedAt;
    report.modelsError = models.error;
    return report;
  }
  if (probe.available && !supportsLiveModels(probe.kind)) {
    report.models = [];
    report.modelsCheckedAt = Date.now();
    report.modelsError = PROVIDER_MAINTENANCE[probe.kind].modelsHint;
  }
  return report;
}

export async function runLoop(options: RunnerOptions): Promise<void> {
  const client = new RuntimeClient(options.convexUrl);
  const pollMs = options.pollMs ?? 2000;
  const heartbeatMs = options.heartbeatMs ?? 20_000;
  const models = new ModelCache(options.modelsRefreshMs ?? 30 * 60_000);
  let probes: ProviderProbe[] = [];
  let lastHeartbeat = 0;

  console.log(`[runtime] polling ${options.convexUrl} as ${options.runtimeId}`);
  const cliEntry = process.argv[1];
  const toolProbe = cliEntry
    ? probeToolSubcommand([process.execPath, cliEntry, "tool"])
    : { status: "indeterminate" as const };
  const staleHost = staleAgentToolsHostLogLine({
    status: toolProbe.status,
    version: options.bridgeVersion,
  });
  if (staleHost) {
    console.error(staleHost);
  }

  const heartbeat = async () => {
    probes = await probeProviders();
    await client.heartbeat({
      runtimeId: options.runtimeId,
      token: options.token,
      hostname: os.hostname(),
      providers: probes.map((probe) =>
        reportFor(probe, models.get(probe.kind))
      ),
      bridgeVersion: options.bridgeVersion,
      capabilities: BRIDGE_CAPABILITIES,
    });
    lastHeartbeat = Date.now();
    const available = probes
      .filter((probe) => probe.available)
      .map((probe) => probe.kind)
      .join(", ");
    console.log(`[runtime] heartbeat ok (available: ${available || "none"})`);
  };

  for (;;) {
    try {
      if (Date.now() - lastHeartbeat > heartbeatMs || probes.length === 0) {
        await heartbeat();
        // Discovery after the heartbeat so a slow `models` call never delays "online".
        const before = probes
          .map((probe) => models.get(probe.kind)?.checkedAt)
          .join(",");
        await models.refreshStale(probes);
        const after = probes
          .map((probe) => models.get(probe.kind)?.checkedAt)
          .join(",");
        if (before !== after) {
          await heartbeat();
        }
      }

      const job = await client.claimNext(options.runtimeId, options.token);
      if (job) {
        console.log(
          `[runtime] claimed job ${job._id} (${job.driverKind}${job.model ? `/${job.model}` : ""}${job.options?.length ? ` +${job.options.length} opt` : ""})`
        );
        await executeJob(client, options, job, probes, heartbeatMs, models);
        continue;
      }

      const command = await client.claimNextCommand(
        options.runtimeId,
        options.token
      );
      if (command) {
        console.log(
          `[runtime] claimed ${command.kind} for ${command.driverKind}`
        );
        await executeCommand(client, options, command, probes, models);
        await heartbeat();
        continue;
      }

      await sleep(pollMs);
    } catch (error) {
      console.error(
        "[runtime] loop error",
        error instanceof Error ? error.message : error
      );
      await sleep(pollMs);
    }
  }
}

/**
 * Run one owner-triggered maintenance command. The server only sent
 * `(kind, driverKind)`; the argv comes from the allowlist on this machine.
 */
async function executeCommand(
  client: RuntimeClient,
  options: RunnerOptions,
  command: ClaimedCommand,
  probes: ProviderProbe[],
  models: ModelCache
): Promise<void> {
  const probe = probes.find((item) => item.kind === command.driverKind);
  const auth = {
    runtimeId: options.runtimeId,
    token: options.token,
    commandId: command._id,
  };
  let buffered = "";
  let flushTimer: NodeJS.Timeout | null = null;
  const flush = async () => {
    if (!buffered) {
      return;
    }
    const text = buffered;
    buffered = "";
    try {
      await client.appendCommandLog({ ...auth, text });
    } catch (error) {
      console.error(
        "[runtime] command log failed",
        error instanceof Error ? error.message : error
      );
    }
  };
  const onLine = (line: string) => {
    buffered += `${line.slice(0, 500)}\n`;
    if (!flushTimer) {
      flushTimer = setTimeout(() => {
        flushTimer = null;
        void flush();
      }, 700);
    }
  };
  const finish = async (input: {
    error?: string;
    versionAfter?: string;
    text?: string;
  }) => {
    if (flushTimer) {
      clearTimeout(flushTimer);
    }
    flushTimer = null;
    await flush();
    await client.completeCommand({ ...auth, ...input });
  };

  try {
    if (command.kind === "refreshModels") {
      if (!probe?.available) {
        await finish({
          error: `${command.driverKind} CLI is not installed on ${os.hostname()}`,
        });
        return;
      }
      const label =
        modelsCommandLabel(
          probe.kind,
          probe.binary ? path.basename(probe.binary) : null
        ) ?? `${probe.kind} models`;
      await client.appendCommandLog({
        ...auth,
        text: `$ ${label}\n`,
        command: label,
      });
      const discovery = await models.refresh(probe);
      if (discovery.models.length === 0) {
        await finish({
          error: discovery.error ?? "no models found",
          text: "→ 静的カタログにフォールバックします\n",
        });
        return;
      }
      await finish({
        text: `${discovery.models.map((model) => `  ${model.slug}${model.default ? " (default)" : ""}`).join("\n")}\n✓ ${discovery.models.length} models\n`,
      });
      return;
    }

    // updateCli
    if (!probe?.available || !probe.binary) {
      await finish({
        error: `${command.driverKind} CLI is not installed on ${os.hostname()} — install it first`,
      });
      return;
    }
    const versionBefore = probe.version ?? undefined;
    const plan = plannedUpdate(probe.kind, probe.binary);
    if (!plan) {
      await finish({
        error: `no supported update path for ${probe.displayName} on this install (${PROVIDER_MAINTENANCE[probe.kind].manualHint})`,
      });
      return;
    }
    // Report the command before spawning so the UI shows what is running.
    const label = updateCommandLabel(plan) ?? plan.argv.join(" ");
    await client.appendCommandLog({
      ...auth,
      text: `$ ${label}\n`,
      command: label,
      versionBefore,
    });
    const started = Date.now();
    const outcome = await runUpdate(probe.kind, probe.binary, onLine);
    if (!outcome.ok) {
      await finish({
        error: outcome.error ?? `update failed (exit ${outcome.exitCode})`,
      });
      return;
    }
    const after = await probeVersion(probe.kind);
    models.forget(probe.kind);
    if (after.binary && supportsLiveModels(probe.kind)) {
      await models.refresh({
        ...probe,
        binary: after.binary,
        version: after.version,
      });
    }
    const elapsed = ((Date.now() - started) / 1000).toFixed(1);
    const changed =
      after.version && versionBefore && after.version !== versionBefore;
    await finish({
      versionAfter: after.version ?? undefined,
      text: `✓ ${label} finished in ${elapsed}s${after.version ? ` · ${changed ? `${versionBefore} → ${after.version}` : `${after.version} (already latest)`}` : ""}\n`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await finish({ error: message.slice(0, 2000) });
  }
}

async function executeJob(
  client: RuntimeClient,
  options: RunnerOptions,
  job: {
    _id: string;
    contextJson: string;
    driverKind: ProviderDriverKind;
    leaseId: string;
    model?: string;
    opsBundle?: JobOpsBundle;
    options?: ProviderOptionSelection[];
    prompt: string;
    skills?: {
      body: string;
      description: string;
      name: string;
      slug: string;
    }[];
  },
  probes: ProviderProbe[],
  heartbeatMs: number,
  modelCache?: ModelCache
): Promise<void> {
  const controller = new AbortController();
  // `tahcode start --provider <kind>` pins every job to one CLI on this
  // machine; a pinned provider ignores the mention's model, since model slugs
  // are provider-specific.
  const pinned =
    options.preferredKind !== undefined &&
    options.preferredKind !== job.driverKind;
  const wanted = options.preferredKind ?? job.driverKind;
  const model = pinned ? undefined : job.model;
  const jobOptions = pinned ? undefined : job.options;
  const probe = probes.find((item) => item.kind === wanted && item.available);
  const anyAvailable = probes.find((item) => item.available);
  const send = async (
    type: "thinking" | "tool" | "text" | "error" | "done",
    text: string
  ) => {
    if (!text) {
      return;
    }
    try {
      await client.appendEvent({
        jobId: job._id,
        leaseId: job.leaseId,
        runtimeId: options.runtimeId,
        text: text.slice(0, 8000),
        token: options.token,
        type,
      });
    } catch (error) {
      console.error(
        "[runtime] append failed",
        error instanceof Error ? error.message : error
      );
    }
  };

  if (!probe || !probe.binary) {
    // Never substitute another provider: the chat asked for this one.
    const wantedName =
      probes.find((item) => item.kind === wanted)?.displayName ?? wanted;
    const message = anyAvailable
      ? `${wantedName} CLI is not installed on this machine (${os.hostname()}). Installed: ${probes
          .filter((item) => item.available)
          .map((item) => item.displayName)
          .join(
            ", "
          )}. Install / sign in to ${wantedName}, or mention one of the installed providers.`
      : "No provider CLI is installed on this machine. Install one of: `codex login`, `claude auth login`, `agent login`, `grok login`, or `opencode auth login` (t3code provider set).";
    await client.complete({
      error: message,
      finalText: message,
      jobId: job._id,
      leaseId: job.leaseId,
      runtimeId: options.runtimeId,
      token: options.token,
    });
    return;
  }

  const contextSummary = summarizeContext(job.contextJson);
  const opsSuffix = job.opsBundle
    ? `\n\n---\n${formatJobOpsPromptSuffix(job.opsBundle)}`
    : "";
  const injectedConnections = injectedConnectorConnections(
    job.opsBundle?.connectors ?? [],
    job.opsBundle?.mentionedConnectors ?? []
  );
  const injectedServers = injectedMcpServerNames(
    job.opsBundle?.connectors ?? [],
    job.opsBundle?.mentionedConnectors ?? []
  );
  const injectedProviders = [
    ...new Set(injectedConnections.map((row) => row.provider)),
  ];
  const prompt = `${applyImagegenDraft(wanted, job.prompt)}\n\n---\nTeam context (history + mentions + project link):\n${contextSummary}\n\n---\n${agentToolsPromptSuffix(false, injectedProviders)}${opsSuffix}`;
  const toolAuth = {
    jobId: job._id,
    leaseId: job.leaseId,
    runtimeId: options.runtimeId,
    token: options.token,
    url: options.convexUrl,
  };
  let jobEnv: NodeJS.ProcessEnv = jobAgentToolEnv(toolAuth);
  let mcpConfigPath: string | undefined;
  try {
    const jobDir = await mkdtemp(path.join(os.tmpdir(), "tahcode-job-"));
    const cliEntry = process.argv[1] ?? "tahcode";
    const bin = await writeAgentToolShim({
      cliEntry,
      dir: jobDir,
      nodePath: process.execPath,
    });
    mcpConfigPath = await writeAgentToolsMcpConfig({
      auth: toolAuth,
      cliEntry,
      connections: job.opsBundle?.connectors ?? [],
      dir: jobDir,
      mentionedConnectors: job.opsBundle?.mentionedConnectors ?? [],
      nodePath: process.execPath,
    });
    jobEnv = {
      ...jobEnv,
      PATH: `${bin}${path.delimiter}${process.env.PATH ?? ""}`,
    };
    if (injectedConnections.length > 0) {
      jobEnv[AGENT_TOOL_ENV.INJECTED_CONNECTORS] =
        formatInjectedConnectorsEnv(injectedConnections);
    }
    if (job.opsBundle) {
      await send("thinking", formatJobMcpAttachNote(job.opsBundle));
    }
  } catch (error) {
    await send(
      "thinking",
      `tahcode tools host skipped: ${error instanceof Error ? error.message : String(error)}`
    );
  }
  const effortTag = jobOptions?.find(
    (item) => typeof item.value === "string"
  )?.value;
  const cancelAuth = {
    jobId: job._id,
    leaseId: job.leaseId,
    runtimeId: options.runtimeId,
    token: options.token,
  };
  const requestAbort = () => {
    if (controller.signal.aborted) {
      return;
    }
    controller.abort();
  };
  const pollCancel = () => {
    void client
      .shouldAbort(cancelAuth)
      .then((abort) => {
        if (abort) {
          requestAbort();
        }
      })
      .catch((error: unknown) => {
        console.error(
          "[runtime] cancel poll failed",
          error instanceof Error ? error.message : error
        );
      });
  };
  const watchCancel = setInterval(pollCancel, 1000);
  pollCancel();
  try {
    const sync = await syncProfileSkills({
      cwd: options.cwd,
      driverKind: wanted,
      homeDir: os.homedir(),
      skills: job.skills ?? [],
    });
    await send("thinking", skillSyncSummary(sync));
  } catch (error) {
    await send(
      "thinking",
      `Skill sync failed (job continues): ${error instanceof Error ? error.message : String(error)}`
    );
  }
  if (controller.signal.aborted) {
    clearInterval(watchCancel);
    await client.complete({
      jobId: job._id,
      leaseId: job.leaseId,
      runtimeId: options.runtimeId,
      token: options.token,
    });
    return;
  }
  await send(
    "thinking",
    `Running ${probe.kind}${model ? ` (${model})` : ""}${typeof effortTag === "string" ? ` · ${effortTag}` : ""} via ${probe.binary}…`
  );

  const keepAlive = setInterval(() => {
    void client
      .heartbeat({
        bridgeVersion: options.bridgeVersion,
        capabilities: BRIDGE_CAPABILITIES,
        hostname: os.hostname(),
        providers: probes.map((probe) => ({
          available: probe.available,
          binaryPath: probe.binary ?? undefined,
          driverKind: probe.kind,
          installMethod: probe.installMethod,
          updateCommand: probe.updateCommand,
          version: probe.version ?? undefined,
        })),
        runtimeId: options.runtimeId,
        token: options.token,
      })
      .catch((error: unknown) => {
        console.error(
          "[runtime] mid-job heartbeat failed",
          error instanceof Error ? error.message : error
        );
      });
  }, heartbeatMs);

  try {
    const started = Date.now();
    if (controller.signal.aborted) {
      await client.complete({
        jobId: job._id,
        leaseId: job.leaseId,
        runtimeId: options.runtimeId,
        token: options.token,
      });
      return;
    }
    const streamArtifacts: StreamArtifact[] = [];
    const result = await runHeadless(
      probe.kind,
      probe.binary,
      prompt,
      options.cwd,
      {
        onArtifact: async (artifact) => {
          streamArtifacts.push(artifact);
          await send("tool", `image_generation: ${artifact.name}`);
        },
        onText: (chunk) => send("text", chunk),
        onThinking: (line) => send("thinking", line),
        onTool: (line) => send("tool", line),
      },
      controller.signal,
      model,
      jobOptions,
      {
        env: jobEnv,
        injectedMcpServerNames: injectedServers,
        liveModelSlugs: modelCache
          ?.get(wanted)
          ?.models.map((item) => item.slug),
        mcpConfigPath,
      }
    );
    if (controller.signal.aborted) {
      await client.complete({
        jobId: job._id,
        leaseId: job.leaseId,
        runtimeId: options.runtimeId,
        token: options.token,
      });
      return;
    }
    const artifacts = await materializeJobArtifacts({
      client,
      cwd: options.cwd,
      jobId: job._id,
      leaseId: job.leaseId,
      prompt,
      runtimeId: options.runtimeId,
      sinceMs: started,
      stream: streamArtifacts,
      text: result.output,
      token: options.token,
    });
    if (artifacts.uploadedMarkdown) {
      await send("text", `\n${artifacts.uploadedMarkdown}\n`);
    }
    const elapsed = ((Date.now() - started) / 1000).toFixed(1);
    const finalText = composeFinalText({
      artifactMarkdown: artifacts.uploadedMarkdown,
      elapsed,
      fallbackMarkdown: artifacts.fallbackMarkdown,
      model,
      output:
        result.output ||
        (result.exitCode === 0
          ? `Done in ${elapsed}s, but the provider returned no text.`
          : `${probe.displayName} failed (exit ${result.exitCode}).`),
      probeBinary: probe.binary,
      probeName: probe.displayName,
    });
    if (result.exitCode === 0) {
      await client.complete({
        finalText,
        jobId: job._id,
        leaseId: job.leaseId,
        runtimeId: options.runtimeId,
        token: options.token,
      });
    } else {
      await client.complete({
        error: `${probe.displayName} exited with code ${result.exitCode}`,
        finalText,
        jobId: job._id,
        leaseId: job.leaseId,
        runtimeId: options.runtimeId,
        token: options.token,
      });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await client.complete({
      error: message.slice(0, 2000),
      finalText: `Runtime error: ${message}`.slice(0, 10_000),
      jobId: job._id,
      leaseId: job.leaseId,
      runtimeId: options.runtimeId,
      token: options.token,
    });
  } finally {
    clearInterval(keepAlive);
    clearInterval(watchCancel);
  }
}

function summarizeContext(contextJson: string): string {
  try {
    const context = JSON.parse(contextJson) as {
      chat?: { title?: string; kind?: string };
      project?: { name?: string; cwd?: string; repoUrl?: string } | null;
      mentions?: { raw?: string }[];
      history?: { author?: string; body?: string }[];
      skills?: { name?: string; slug?: string }[];
    };
    const lines: string[] = [];
    if (context.chat) {
      lines.push(`chat: ${context.chat.kind} / ${context.chat.title}`);
    }
    if (context.project) {
      lines.push(
        `project: ${context.project.name} ${context.project.cwd ?? ""} ${context.project.repoUrl ?? ""}`.trim()
      );
    }
    if (context.mentions && context.mentions.length > 0) {
      lines.push(
        `mentions: ${context.mentions.map((mention) => mention.raw).join(" ")}`
      );
    }
    if (context.skills && context.skills.length > 0) {
      lines.push(
        `skills (synced to local harness store; load on demand, bodies not inlined): ${context.skills
          .map((skill) => skill.slug ?? skill.name)
          .filter(Boolean)
          .join(", ")}`
      );
    }
    for (const item of context.history ?? []) {
      lines.push(`${item.author}: ${(item.body ?? "").slice(0, 500)}`);
    }
    return lines.join("\n").slice(0, 6000);
  } catch {
    return contextJson.slice(0, 6000);
  }
}
