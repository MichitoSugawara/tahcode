import os from "node:os";
import type { ProviderDriverKind } from "../../shared/providers.ts";
import { RuntimeClient } from "./convexClient.ts";
import { probeProviders, runHeadless, type ProviderProbe } from "./providers.ts";

export type RunnerOptions = {
  convexUrl: string;
  runtimeId: string;
  token: string;
  cwd?: string;
  pollMs?: number;
  heartbeatMs?: number;
  preferredKind?: ProviderDriverKind;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function runLoop(options: RunnerOptions): Promise<void> {
  const client = new RuntimeClient(options.convexUrl);
  const pollMs = options.pollMs ?? 2000;
  const heartbeatMs = options.heartbeatMs ?? 20000;
  let probes: ProviderProbe[] = [];
  let lastHeartbeat = 0;

  console.log(`[runtime] polling ${options.convexUrl} as ${options.runtimeId}`);

  for (;;) {
    try {
      if (Date.now() - lastHeartbeat > heartbeatMs || probes.length === 0) {
        probes = await probeProviders();
        await client.heartbeat({
          runtimeId: options.runtimeId,
          token: options.token,
          hostname: os.hostname(),
          providers: probes.map((probe) => ({
            driverKind: probe.kind,
            available: probe.available,
            version: probe.version ?? undefined,
            binaryPath: probe.binary ?? undefined,
          })),
        });
        lastHeartbeat = Date.now();
        const available = probes
          .filter((probe) => probe.available)
          .map((probe) => probe.kind)
          .join(", ");
        console.log(`[runtime] heartbeat ok (available: ${available || "none"})`);
      }

      const job = await client.claimNext(options.runtimeId, options.token);
      if (!job) {
        await sleep(pollMs);
        continue;
      }
      console.log(`[runtime] claimed job ${job._id} (${job.driverKind}${job.model ? `/${job.model}` : ""})`);
      await executeJob(client, options, job, probes);
    } catch (error) {
      console.error("[runtime] loop error", error instanceof Error ? error.message : error);
      await sleep(pollMs);
    }
  }
}

async function executeJob(
  client: RuntimeClient,
  options: RunnerOptions,
  job: {
    _id: string;
    driverKind: ProviderDriverKind;
    model?: string;
    prompt: string;
    contextJson: string;
  },
  probes: ProviderProbe[],
): Promise<void> {
  const controller = new AbortController();
  // `tahcode start --provider <kind>` pins every job to one CLI on this
  // machine; a pinned provider ignores the mention's model, since model slugs
  // are provider-specific.
  const pinned = options.preferredKind !== undefined && options.preferredKind !== job.driverKind;
  const wanted = options.preferredKind ?? job.driverKind;
  const model = pinned ? undefined : job.model;
  const probe = probes.find((item) => item.kind === wanted && item.available);
  const anyAvailable = probes.find((item) => item.available);
  const send = async (
    type: "thinking" | "tool" | "text" | "error" | "done",
    text: string,
  ) => {
    if (!text) return;
    try {
      await client.appendEvent({
        runtimeId: options.runtimeId,
        token: options.token,
        jobId: job._id,
        type,
        text: text.slice(0, 8000),
      });
    } catch (error) {
      console.error("[runtime] append failed", error instanceof Error ? error.message : error);
    }
  };

  if (!probe || !probe.binary) {
    // Never substitute another provider: the chat asked for this one.
    const wantedName = probes.find((item) => item.kind === wanted)?.displayName ?? wanted;
    const message = anyAvailable
      ? `${wantedName} CLI is not installed on this machine (${os.hostname()}). Installed: ${probes
          .filter((item) => item.available)
          .map((item) => item.displayName)
          .join(", ")}. Install / sign in to ${wantedName}, or mention one of the installed providers.`
      : "No provider CLI is installed on this machine. Install one of: `codex login`, `claude auth login`, `agent login`, `grok login`, or `opencode auth login` (t3code provider set).";
    await client.complete({
      runtimeId: options.runtimeId,
      token: options.token,
      jobId: job._id,
      error: message,
      finalText: message,
    });
    return;
  }

  const contextSummary = summarizeContext(job.contextJson);
  const prompt = `${job.prompt}\n\n---\nTeam context (history + mentions + project link):\n${contextSummary}`;
  await send("thinking", `Running ${probe.kind}${model ? ` (${model})` : ""} via ${probe.binary}…`);

  try {
    const started = Date.now();
    const result = await runHeadless(
      probe.kind,
      probe.binary,
      prompt,
      options.cwd,
      {
        onText: (chunk) => send("text", chunk),
        onTool: (line) => send("tool", line),
        onThinking: (line) => send("thinking", line),
      },
      controller.signal,
      model,
    );
    const elapsed = ((Date.now() - started) / 1000).toFixed(1);
    if (result.exitCode === 0 && result.output) {
      await client.complete({
        runtimeId: options.runtimeId,
        token: options.token,
        jobId: job._id,
        finalText: `${result.output}\n\n_${probe.displayName}${model ? ` · ${model}` : ""} · ${elapsed}s · ${probe.binary}_`,
      });
    } else if (result.exitCode === 0) {
      await client.complete({
        runtimeId: options.runtimeId,
        token: options.token,
        jobId: job._id,
        finalText: `Done in ${elapsed}s, but the provider returned no text.`,
      });
    } else {
      await client.complete({
        runtimeId: options.runtimeId,
        token: options.token,
        jobId: job._id,
        error: `${probe.displayName} exited with code ${result.exitCode}`,
        finalText: result.output || `${probe.displayName} failed (exit ${result.exitCode}).`,
      });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await client.complete({
      runtimeId: options.runtimeId,
      token: options.token,
      jobId: job._id,
      error: message.slice(0, 2000),
      finalText: `Runtime error: ${message}`.slice(0, 10000),
    });
  }
}

function summarizeContext(contextJson: string): string {
  try {
    const context = JSON.parse(contextJson) as {
      chat?: { title?: string; kind?: string };
      project?: { name?: string; cwd?: string; repoUrl?: string } | null;
      mentions?: { raw?: string }[];
      history?: { author?: string; body?: string }[];
    };
    const lines: string[] = [];
    if (context.chat) lines.push(`chat: ${context.chat.kind} / ${context.chat.title}`);
    if (context.project) {
      lines.push(
        `project: ${context.project.name} ${context.project.cwd ?? ""} ${context.project.repoUrl ?? ""}`.trim(),
      );
    }
    if (context.mentions && context.mentions.length > 0) {
      lines.push(`mentions: ${context.mentions.map((mention) => mention.raw).join(" ")}`);
    }
    for (const item of context.history ?? []) {
      lines.push(`${item.author}: ${(item.body ?? "").slice(0, 500)}`);
    }
    return lines.join("\n").slice(0, 6000);
  } catch {
    return contextJson.slice(0, 6000);
  }
}
