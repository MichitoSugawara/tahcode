/**
 * First-party HITL gate for destructive tahcode tools (TAH-84).
 *
 * CopilotKit's interaction model (interrupt → approve/reject → resume) is
 * ported here. The Convex job + Mac bridge stay the backend of record —
 * we do not wrap the app in CopilotKitProvider or swap the agent runtime.
 *
 * @see https://docs.copilotkit.ai/human-in-the-loop
 * @see https://github.com/CopilotKit/CopilotKit
 */

import { parseAgentToolArgsJson } from "./agentTools.ts";

export const HITL_WRITE_TOOL_NAMES = [
  "create_session",
  "send_message",
  "create_linear_issue",
  "update_linear_issue",
  "create_github_issue",
  "update_github_issue",
] as const;

export type HitlWriteToolName = (typeof HITL_WRITE_TOOL_NAMES)[number];

export const TOOL_APPROVAL_STATUSES = [
  "pending",
  "approved",
  "rejected",
  "cancelled",
] as const;

export type ToolApprovalStatus = (typeof TOOL_APPROVAL_STATUSES)[number];

export const TOOL_APPROVAL_SOURCES = ["job", "demo"] as const;

export type ToolApprovalSource = (typeof TOOL_APPROVAL_SOURCES)[number];

export const HITL_DEMO_TOOL_NAME = "create_linear_issue" as const;

export const HITL_DEMO_ARGS = {
  teamId: "demo",
  title: "確認カードの試用",
} as const;

export const HITL_PENDING_RESULT = {
  message:
    "Human approval required before this tool runs. The action has not executed.",
  ok: false,
  status: "pending_approval",
} as const;

export const HITL_REJECTED_RESULT = {
  cancelled: true,
  message: "The user rejected this tool. The action did not run.",
  ok: false,
  status: "rejected",
} as const;

export const HITL_POLL_MS = 1000;
export const HITL_MAX_WAIT_MS = 10 * 60 * 1000;

const HITL_WRITE_SET = new Set<string>(HITL_WRITE_TOOL_NAMES);

const SECRET_ARG_KEYS = /token|secret|password|authorization|cookie/i;

const TOOL_LABELS: Record<HitlWriteToolName, string> = {
  create_github_issue: "GitHub の Issue を作成",
  create_linear_issue: "Linear の課題を作成",
  create_session: "チャットを作成",
  send_message: "メッセージを送信",
  update_github_issue: "GitHub の Issue を更新",
  update_linear_issue: "Linear の課題を更新",
};

export function isHitlWriteToolName(value: string): value is HitlWriteToolName {
  return HITL_WRITE_SET.has(value);
}

export function toolNeedsApproval(name: string): boolean {
  return isHitlWriteToolName(name);
}

export function hitlToolLabel(name: string): string {
  if (isHitlWriteToolName(name)) {
    return TOOL_LABELS[name];
  }
  return name.replaceAll("_", " ");
}

export function approvalArgsHash(argsJson: string): string {
  const normalized = stableJson(parseAgentToolArgsJson(argsJson));
  let hash = 2_166_136_261;
  for (const char of normalized) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16_777_619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function approvalArgsPreview(argsJson: string, max = 180): string {
  let parsed: Record<string, unknown>;
  try {
    parsed = parseAgentToolArgsJson(argsJson);
  } catch {
    return "";
  }
  const parts: string[] = [];
  for (const [key, value] of Object.entries(parsed)) {
    if (SECRET_ARG_KEYS.test(key)) {
      continue;
    }
    parts.push(`${key}=${previewValue(value)}`);
  }
  const joined = parts.join(" · ");
  return joined.length > max ? `${joined.slice(0, max - 1)}…` : joined;
}

export function approvalSummary(name: string, argsJson: string): string {
  const preview = approvalArgsPreview(argsJson);
  const label = hitlToolLabel(name);
  return preview.length > 0 ? `${label}（${preview}）` : label;
}

export function hitlPendingResultJson(): string {
  return JSON.stringify(HITL_PENDING_RESULT);
}

export function hitlRejectedResultJson(): string {
  return JSON.stringify(HITL_REJECTED_RESULT);
}

export function isPendingApprovalResult(resultJson: string): boolean {
  return parseApprovalResultStatus(resultJson) === "pending_approval";
}

export type GatedToolInvokeResult = {
  approval?: {
    id: string;
    status: "pending" | "rejected";
  };
  name: string;
  resultJson: string;
};

export async function settleGatedToolInvoke(input: {
  invoke: () => Promise<GatedToolInvokeResult>;
  isAbort?: () => Promise<boolean>;
  maxWaitMs?: number;
  poll: (approvalId: string) => Promise<ToolApprovalStatus>;
  pollMs?: number;
  sleep?: (ms: number) => Promise<void>;
}): Promise<GatedToolInvokeResult> {
  const pollMs = input.pollMs ?? HITL_POLL_MS;
  const maxWaitMs = input.maxWaitMs ?? HITL_MAX_WAIT_MS;
  const sleep = input.sleep ?? defaultSleep;
  const started = Date.now();
  let result = await input.invoke();
  while (result.approval?.status === "pending") {
    if (input.isAbort && (await input.isAbort())) {
      return rejectedInvokeResult(result.name);
    }
    if (Date.now() - started > maxWaitMs) {
      throw new Error("Timed out waiting for tool approval");
    }
    const status = await input.poll(result.approval.id);
    if (status === "rejected" || status === "cancelled") {
      return rejectedInvokeResult(result.name);
    }
    if (status !== "approved" && status !== "pending") {
      return rejectedInvokeResult(result.name);
    }
    if (status === "pending") {
      await sleep(pollMs);
      continue;
    }
    result = await input.invoke();
  }
  if (result.approval?.status === "rejected") {
    return rejectedInvokeResult(result.name);
  }
  return result;
}

function rejectedInvokeResult(name: string): GatedToolInvokeResult {
  return {
    name,
    resultJson: hitlRejectedResultJson(),
  };
}

function parseApprovalResultStatus(resultJson: string): string | null {
  try {
    const parsed: unknown = JSON.parse(resultJson);
    if (
      parsed &&
      typeof parsed === "object" &&
      "status" in parsed &&
      typeof parsed.status === "string"
    ) {
      return parsed.status;
    }
  } catch {
    return null;
  }
  return null;
}

function previewValue(value: unknown): string {
  if (typeof value === "string") {
    return value.slice(0, 48);
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return "…";
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableJson(item)).join(",")}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>).sort(
    ([left], [right]) => left.localeCompare(right)
  );
  return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(",")}}`;
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
