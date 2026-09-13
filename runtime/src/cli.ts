#!/usr/bin/env node
import { probeProviders } from "./providers.ts";
import { runLoop } from "./runner.ts";
import type { ProviderDriverKind } from "../../shared/providers.ts";

function flag(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  const value = process.argv[index + 1];
  if (index === -1 || !value || value.startsWith("--")) return undefined;
  return value;
}

function hasFlag(name: string): boolean {
  return process.argv.includes(name);
}

async function main(): Promise<void> {
  const command = process.argv[2] ?? "run";
  if (command === "providers") {
    const probes = await probeProviders();
    console.log("t3code-derived provider set (machine runtime):");
    for (const probe of probes) {
      console.log(
        `- ${probe.displayName} (${probe.kind}): ${probe.available ? `OK ${probe.binary ?? ""} ${probe.version ?? ""}`.trim() : "missing"} — ${probe.headlessSummary}`,
      );
    }
    return;
  }
  if (command === "run") {
    const convexUrl =
      flag("--convex-url") ?? process.env.CONVEX_URL ?? process.env.VITE_CONVEX_URL;
    const runtimeId = flag("--runtime-id") ?? process.env.HARNESS_RUNTIME_ID;
    const token = flag("--token") ?? process.env.HARNESS_RUNTIME_TOKEN;
    const cwd = flag("--cwd") ?? process.env.HARNESS_CWD ?? process.cwd();
    const preferred = flag("--provider") as ProviderDriverKind | undefined;
    if (!convexUrl || !runtimeId || !token) {
      console.error(
        "Missing --convex-url / --runtime-id / --token (or CONVEX_URL, HARNESS_RUNTIME_ID, HARNESS_RUNTIME_TOKEN). Register the machine in the web UI first: Runtimes → Register this machine.",
      );
      process.exit(1);
    }
    await runLoop({ convexUrl, runtimeId, token, cwd, preferredKind: preferred });
    return;
  }
  console.error(`Unknown command: ${command}`);
  console.error("Usage:");
  console.error("  npm run runtime -- providers");
  console.error("  npm run runtime -- run --convex-url https://... --runtime-id ... --token th_...");
  process.exit(1);
}

if (!hasFlag("--help")) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
} else {
  console.log("tahcode runtime: providers | run");
}
