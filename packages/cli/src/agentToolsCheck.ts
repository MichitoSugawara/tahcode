import { existsSync, realpathSync } from "node:fs";
import path from "node:path";

import { probeToolSubcommand } from "../../../runtime/src/agentToolsHost.ts";
import {
  AGENT_TOOLS_MIN_CLI_VERSION,
  CLI_VERSION,
  cliHasAgentTools,
  staleCliAgentToolsMessage,
} from "../../../shared/cliVersion.ts";
import { code, fail, heading, ok, warn } from "./ui.ts";

export function warnStaleAgentToolsOnStart(): void {
  if (cliHasAgentTools(CLI_VERSION)) {
    return;
  }
  warn(staleCliAgentToolsMessage(CLI_VERSION));
}

/** Returns true when doctor should exit non-zero. */
export function reportDoctorAgentTools(): boolean {
  heading("エージェントツール");
  let failed = false;
  if (cliHasAgentTools(CLI_VERSION)) {
    ok(
      `CLI ${CLI_VERSION} · ${code("tahcode tool")} / ${code("tahcode tool-mcp")}（${AGENT_TOOLS_MIN_CLI_VERSION}+）`
    );
  } else {
    fail(staleCliAgentToolsMessage(CLI_VERSION));
    failed = true;
  }

  const selfEntry = process.argv[1];
  if (selfEntry && looksLikeBundledCli(selfEntry)) {
    const probe = probeToolSubcommand([process.execPath, selfEntry, "tool"]);
    if (probe.status === "unknown-command") {
      fail(
        `${code("tahcode tool")} がありません。${staleCliAgentToolsMessage(CLI_VERSION)}`
      );
      failed = true;
    } else if (probe.status === "ok") {
      ok(`${code("tahcode tool")} をこのバイナリで確認しました`);
    }
  }

  const pathCli = findTahcodeOnPath();
  if (!pathCli) {
    return failed;
  }
  const thisEntry = selfEntry ? safeRealpath(selfEntry) : null;
  const pathReal = safeRealpath(pathCli);
  if (pathReal && thisEntry && pathReal === thisEntry) {
    return failed;
  }
  const probe = probeToolSubcommand([pathCli, "tool"]);
  if (probe.status === "unknown-command") {
    warn(
      `PATH の ${code(pathCli)} は ${code("tahcode tool")} を知りません。${staleCliAgentToolsMessage()}`
    );
  }
  return failed;
}

function looksLikeBundledCli(entry: string): boolean {
  const base = path.basename(entry);
  return base === "tahcode" || base === "tahcode.mjs" || base.endsWith(".js");
}

function findTahcodeOnPath(): string | null {
  for (const dir of (process.env.PATH ?? "").split(path.delimiter)) {
    if (!dir) {
      continue;
    }
    const candidate = path.join(dir, "tahcode");
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

function safeRealpath(file: string): string | null {
  try {
    return realpathSync(file);
  } catch {
    return null;
  }
}
