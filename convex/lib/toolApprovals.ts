import {
  HITL_DEMO_ARGS,
  HITL_DEMO_TOOL_NAME,
  approvalArgsHash,
  approvalArgsPreview,
  approvalSummary,
  hitlPendingResultJson,
  hitlRejectedResultJson,
  hitlToolLabel,
  toolNeedsApproval,
} from "../../shared/toolApprovals.ts";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { loadVisibleParentChat, requireVisibleParentChat } from "./sideChat";

const LIST_MAX = 20;
const OPEN_SCAN = 8;

type Ctx = QueryCtx | MutationCtx;

export type ToolApprovalGate =
  | { approvalId: Id<"toolApprovals">; status: "pending" }
  | { approvalId: Id<"toolApprovals">; status: "rejected" }
  | { approvalId?: Id<"toolApprovals">; status: "proceed" };

export function toToolApprovalView(row: Doc<"toolApprovals">) {
  return {
    _creationTime: row._creationTime,
    _id: row._id,
    argsPreview: approvalArgsPreview(row.argsJson),
    chatId: row.chatId,
    decidedAt: row.decidedAt ?? null,
    executedAt: row.executedAt ?? null,
    jobId: row.jobId ?? null,
    name: row.name,
    source: row.source,
    status: row.status,
    summary: row.summary,
    title: hitlToolLabel(row.name),
  };
}

export async function listVisibleApprovals(
  ctx: Ctx,
  chatId: Id<"chats">,
  userId: Id<"users">,
  jobId?: Id<"jobs">
) {
  const chat = await loadVisibleParentChat(ctx, chatId, userId);
  if (!chat) {
    return null;
  }
  const rows = jobId
    ? await ctx.db
        .query("toolApprovals")
        .withIndex("by_job", (q) => q.eq("jobId", jobId))
        .order("desc")
        .take(LIST_MAX)
    : await ctx.db
        .query("toolApprovals")
        .withIndex("by_chat", (q) => q.eq("chatId", chatId))
        .order("desc")
        .take(LIST_MAX);
  const items = rows
    .filter((row) => !jobId || String(row.chatId) === String(chatId))
    .map((row) => toToolApprovalView(row));
  items.sort((left, right) => {
    const leftPending = left.status === "pending" ? 0 : 1;
    const rightPending = right.status === "pending" ? 0 : 1;
    if (leftPending !== rightPending) {
      return leftPending - rightPending;
    }
    return right._creationTime - left._creationTime;
  });
  return { chatId, items };
}

export async function requireToolApproval(
  ctx: MutationCtx,
  input: {
    argsJson: string;
    job: Doc<"jobs">;
    name: string;
    userId: Id<"users">;
  }
): Promise<ToolApprovalGate> {
  if (!toolNeedsApproval(input.name)) {
    return { status: "proceed" };
  }
  const argsHash = approvalArgsHash(input.argsJson);
  const open = await findOpenApproval(ctx, {
    argsHash,
    jobId: input.job._id,
    name: input.name,
  });
  if (open?.status === "approved") {
    return { approvalId: open._id, status: "proceed" };
  }
  if (open?.status === "rejected") {
    return { approvalId: open._id, status: "rejected" };
  }
  if (open?.status === "pending") {
    return { approvalId: open._id, status: "pending" };
  }
  const approvalId = await ctx.db.insert("toolApprovals", {
    argsHash,
    argsJson: input.argsJson.slice(0, 20_000),
    chatId: input.job.chatId,
    jobId: input.job._id,
    name: input.name,
    orgId: input.job.orgId,
    requestedBy: input.userId,
    source: "job",
    status: "pending",
    summary: approvalSummary(input.name, input.argsJson),
  });
  return { approvalId, status: "pending" };
}

export function gateResultJson(status: "pending" | "rejected"): string {
  return status === "rejected"
    ? hitlRejectedResultJson()
    : hitlPendingResultJson();
}

export async function markToolApprovalExecuted(
  ctx: MutationCtx,
  approvalId: Id<"toolApprovals"> | undefined
): Promise<void> {
  if (!approvalId) {
    return;
  }
  const row = await ctx.db.get("toolApprovals", approvalId);
  if (!row || row.status !== "approved" || row.executedAt !== undefined) {
    return;
  }
  await ctx.db.patch("toolApprovals", approvalId, { executedAt: Date.now() });
}

export async function cancelOpenApprovalsForJob(
  ctx: MutationCtx,
  jobId: Id<"jobs">
): Promise<void> {
  const rows = await ctx.db
    .query("toolApprovals")
    .withIndex("by_job", (q) => q.eq("jobId", jobId))
    .take(50);
  const now = Date.now();
  for (const row of rows) {
    if (row.status !== "pending") {
      continue;
    }
    await ctx.db.patch("toolApprovals", row._id, {
      decidedAt: now,
      status: "cancelled",
    });
  }
}

export async function decideToolApproval(
  ctx: MutationCtx,
  input: {
    approvalId: Id<"toolApprovals">;
    decision: "approved" | "rejected";
    userId: Id<"users">;
  }
): Promise<Doc<"toolApprovals">> {
  const row = await ctx.db.get("toolApprovals", input.approvalId);
  if (!row) {
    throw new Error("確認カードが見つかりません");
  }
  await requireVisibleParentChat(ctx, row.chatId, input.userId);
  if (row.status !== "pending") {
    throw new Error("この確認はすでに決まっています");
  }
  await ctx.db.patch("toolApprovals", row._id, {
    decidedAt: Date.now(),
    decidedBy: input.userId,
    status: input.decision,
  });
  const next = await ctx.db.get("toolApprovals", row._id);
  if (!next) {
    throw new Error("確認カードが見つかりません");
  }
  return next;
}

export async function requestDemoApproval(
  ctx: MutationCtx,
  input: { chatId: Id<"chats">; userId: Id<"users"> }
): Promise<Doc<"toolApprovals">> {
  const chat = await requireVisibleParentChat(ctx, input.chatId, input.userId);
  const existing = await ctx.db
    .query("toolApprovals")
    .withIndex("by_chat_and_status", (q) =>
      q.eq("chatId", input.chatId).eq("status", "pending")
    )
    .take(10);
  const pendingDemo = existing.find((row) => row.source === "demo");
  if (pendingDemo) {
    return pendingDemo;
  }
  const argsJson = JSON.stringify(HITL_DEMO_ARGS);
  const approvalId = await ctx.db.insert("toolApprovals", {
    argsHash: approvalArgsHash(argsJson),
    argsJson,
    chatId: chat._id,
    name: HITL_DEMO_TOOL_NAME,
    orgId: chat.orgId,
    requestedBy: input.userId,
    source: "demo",
    status: "pending",
    summary: approvalSummary(HITL_DEMO_TOOL_NAME, argsJson),
  });
  const created = await ctx.db.get("toolApprovals", approvalId);
  if (!created) {
    throw new Error("確認カードを作成できませんでした");
  }
  return created;
}

export async function deleteChatToolApprovals(
  ctx: MutationCtx,
  chatId: Id<"chats">
): Promise<void> {
  for (let round = 0; round < 20; round++) {
    const rows = await ctx.db
      .query("toolApprovals")
      .withIndex("by_chat", (q) => q.eq("chatId", chatId))
      .take(200);
    if (rows.length === 0) {
      return;
    }
    for (const row of rows) {
      await ctx.db.delete("toolApprovals", row._id);
    }
    if (rows.length < 200) {
      return;
    }
  }
  throw new Error("Too many related records to delete at once");
}

async function findOpenApproval(
  ctx: MutationCtx,
  input: { argsHash: string; jobId: Id<"jobs">; name: string }
): Promise<Doc<"toolApprovals"> | null> {
  const rows = await ctx.db
    .query("toolApprovals")
    .withIndex("by_job_name_hash", (q) =>
      q
        .eq("jobId", input.jobId)
        .eq("name", input.name)
        .eq("argsHash", input.argsHash)
    )
    .take(OPEN_SCAN);
  return (
    rows.find(
      (row) =>
        row.status === "pending" ||
        (row.status === "approved" && row.executedAt === undefined)
    ) ?? null
  );
}
