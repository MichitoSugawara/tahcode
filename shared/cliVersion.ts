/**
 * Published `tahcode` CLI semver. Keep in sync with `packages/cli/package.json`.
 * 0.1.0 (2026-09-13) predates agent tools; `tahcode tool` / `tool-mcp` ship in 0.1.1+.
 * 0.1.2 adds Cursor headless `--force` so `tahcode tool` is not rejected (TAH-63).
 */
export const CLI_VERSION = "0.1.2";

/** First CLI that understands `tahcode tool` / `tahcode tool-mcp` (TAH-54 / TAH-55). */
export const AGENT_TOOLS_MIN_CLI_VERSION = "0.1.1";

export function parseCliSemver(raw: string): [number, number, number] | null {
  const match = raw.trim().match(/(\d+)\.(\d+)\.(\d+)/);
  if (!match) {
    return null;
  }
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

export function compareCliSemver(a: string, b: string): number {
  const left = parseCliSemver(a);
  const right = parseCliSemver(b);
  if (!left || !right) {
    return 0;
  }
  for (let i = 0; i < 3; i += 1) {
    const diff = left[i]! - right[i]!;
    if (diff !== 0) {
      return diff > 0 ? 1 : -1;
    }
  }
  return 0;
}

export function cliHasAgentTools(version: string): boolean {
  return compareCliSemver(version, AGENT_TOOLS_MIN_CLI_VERSION) >= 0;
}

export function isUnknownToolCommandOutput(text: string): boolean {
  return /不明なコマンド:\s*tool(?:-mcp)?\b/.test(text);
}

export function classifyToolSubcommandOutput(
  text: string
): "ok" | "unknown-command" | "indeterminate" {
  if (isUnknownToolCommandOutput(text)) {
    return "unknown-command";
  }
  if (
    text.includes("tahcode tool はジョブ実行中だけ") ||
    text.includes("Missing TAHCODE_JOB")
  ) {
    return "ok";
  }
  return "indeterminate";
}

export function staleCliAgentToolsMessage(version?: string): string {
  const current = version ? `（いま ${version}）` : "";
  return `tahcode tool / tool-mcp には CLI ${AGENT_TOOLS_MIN_CLI_VERSION} 以上が必要です${current}。npm i -g tahcode@${AGENT_TOOLS_MIN_CLI_VERSION} のあと tahcode restart してください。バイナリを拾うだけなら tahcode service install は不要です。`;
}

export const STALE_CLI_TOOL_PROMPT_HINT =
  "If `tahcode tool` prints 「不明なコマンド: tool」, stop immediately and tell the user the tahcode CLI is older than 0.1.1. They must `npm i -g tahcode@0.1.1` then `tahcode restart`. `tahcode service install` is unnecessary for a binary upgrade (it now keeps launchd auth, but restart is enough). Do not search other Linear MCP paths.";

export function staleAgentToolsHostLogLine(input: {
  status?: "ok" | "unknown-command" | "indeterminate";
  version?: string;
}): string | null {
  const version = input.version ?? CLI_VERSION;
  const staleVersion = !cliHasAgentTools(version);
  const missingCommand = input.status === "unknown-command";
  if (!staleVersion && !missingCommand) {
    return null;
  }
  return `[runtime] tahcode tool / tool-mcp unavailable (CLI ${version}). Cursor @linear needs ${AGENT_TOOLS_MIN_CLI_VERSION}+. npm i -g tahcode@${AGENT_TOOLS_MIN_CLI_VERSION} && tahcode restart (service install is not required).`;
}
