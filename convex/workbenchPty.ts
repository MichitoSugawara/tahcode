import { v } from "convex/values";

import { isSafeBrowsePath } from "../shared/filesystemBrowse.ts";
import {
  clampTerminalCols,
  clampTerminalRows,
  clipTerminalWrite,
  DEFAULT_TERMINAL_ID,
  isTerminalId,
  nextTerminalHistory,
  PTY_STALE_RUNNING_MS,
  PTY_STALE_STARTING_MS,
} from "../shared/workbenchTerminal.ts";
import type { Id } from "./_generated/dataModel";
import { mutation } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { authedMutation, authedQuery } from "./lib/customFunctions";
import { getRuntimeByToken } from "./lib/runtimeAuth";
import { ptySessionStatus } from "./lib/validators";
import {
  canSeeWorkbenchSession,
  requirePtyRuntime,
} from "./lib/workbenchAccess";

const HISTORY_CAP = 20;

const sessionView = v.object({
  _id: v.id("ptySessions"),
  chatId: v.optional(v.id("chats")),
  cols: v.number(),
  cwd: v.string(),
  error: v.optional(v.string()),
  exitCode: v.optional(v.number()),
  history: v.string(),
  label: v.string(),
  lastBridgeAt: v.optional(v.number()),
  pid: v.optional(v.number()),
  rows: v.number(),
  runtimeId: v.id("runtimes"),
  status: ptySessionStatus,
  terminalId: v.string(),
});

async function failStalePty(ctx: MutationCtx, runtimeId: Id<"runtimes">) {
  const now = Date.now();
  const starting = await ctx.db
    .query("ptySessions")
    .withIndex("by_runtime_and_status", (q) =>
      q.eq("runtimeId", runtimeId).eq("status", "starting")
    )
    .take(20);
  for (const row of starting) {
    const started = row.claimedAt ?? row._creationTime;
    if (now - started > PTY_STALE_STARTING_MS) {
      await ctx.db.patch("ptySessions", row._id, {
        completedAt: now,
        error: "The bridge did not start this terminal.",
        status: "error",
      });
    }
  }
  const running = await ctx.db
    .query("ptySessions")
    .withIndex("by_runtime_and_status", (q) =>
      q.eq("runtimeId", runtimeId).eq("status", "running")
    )
    .take(20);
  for (const row of running) {
    const seen = row.lastBridgeAt ?? row.claimedAt ?? row._creationTime;
    if (now - seen > PTY_STALE_RUNNING_MS) {
      await ctx.db.patch("ptySessions", row._id, {
        completedAt: now,
        error: "The bridge stopped updating this terminal.",
        status: "error",
      });
    }
  }
}

async function pruneOldPty(ctx: MutationCtx, runtimeId: Id<"runtimes">) {
  const rows = await ctx.db
    .query("ptySessions")
    .withIndex("by_runtime", (q) => q.eq("runtimeId", runtimeId))
    .take(HISTORY_CAP + 12);
  if (rows.length <= HISTORY_CAP) {
    return;
  }
  const extra = rows.slice(HISTORY_CAP);
  for (const row of extra) {
    if (row.status === "starting" || row.status === "running") {
      continue;
    }
    await ctx.db.delete("ptySessions", row._id);
  }
}

function toView(row: {
  _id: Id<"ptySessions">;
  chatId?: Id<"chats">;
  cols: number;
  cwd: string;
  error?: string;
  exitCode?: number;
  history: string;
  label: string;
  lastBridgeAt?: number;
  pid?: number;
  rows: number;
  runtimeId: Id<"runtimes">;
  status: "starting" | "running" | "exited" | "error" | "closed";
  terminalId: string;
}) {
  return {
    _id: row._id,
    chatId: row.chatId,
    cols: row.cols,
    cwd: row.cwd,
    error: row.error,
    exitCode: row.exitCode,
    history: row.history,
    label: row.label,
    lastBridgeAt: row.lastBridgeAt,
    pid: row.pid,
    rows: row.rows,
    runtimeId: row.runtimeId,
    status: row.status,
    terminalId: row.terminalId,
  };
}

export const open = authedMutation({
  args: {
    chatId: v.optional(v.id("chats")),
    cols: v.optional(v.number()),
    cwd: v.optional(v.string()),
    rows: v.optional(v.number()),
    runtimeId: v.id("runtimes"),
    terminalId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { runtime } = await requirePtyRuntime(
      ctx,
      args.runtimeId,
      ctx.user._id
    );
    const terminalId = args.terminalId?.trim() || DEFAULT_TERMINAL_ID;
    if (!isTerminalId(terminalId)) {
      throw new Error("Terminal id is invalid");
    }
    const cwd = (args.cwd ?? runtime.cwd ?? "").trim();
    if (cwd.length > 0 && !isSafeBrowsePath(cwd)) {
      throw new Error("Terminal cwd is invalid");
    }
    const cols = clampTerminalCols(args.cols ?? 80);
    const rows = clampTerminalRows(args.rows ?? 24);
    const existing = await ctx.db
      .query("ptySessions")
      .withIndex("by_runtime_owner_terminal", (q) =>
        q
          .eq("runtimeId", args.runtimeId)
          .eq("requestedBy", ctx.user._id)
          .eq("terminalId", terminalId)
      )
      .take(8);
    const live = existing.find(
      (row) => row.status === "starting" || row.status === "running"
    );
    if (live) {
      await ctx.db.patch("ptySessions", live._id, {
        chatId: args.chatId ?? live.chatId,
        cols,
        cwd: cwd || live.cwd,
        pendingCols: cols,
        pendingRows: rows,
        rows,
      });
      return live._id;
    }
    await pruneOldPty(ctx, args.runtimeId);
    return await ctx.db.insert("ptySessions", {
      chatId: args.chatId,
      cols,
      cwd,
      history: "",
      label: "shell",
      orgId: runtime.orgId,
      pendingInput: "",
      requestedBy: ctx.user._id,
      rows,
      runtimeId: args.runtimeId,
      status: "starting",
      terminalId,
    });
  },
  returns: v.id("ptySessions"),
});

export const write = authedMutation({
  args: {
    data: v.string(),
    sessionId: v.id("ptySessions"),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db.get("ptySessions", args.sessionId);
    if (!row) {
      throw new Error("Terminal session not found");
    }
    if (row.requestedBy !== ctx.user._id) {
      throw new Error("Unauthorized");
    }
    if (row.status !== "starting" && row.status !== "running") {
      throw new Error("Terminal is not running");
    }
    const chunk = clipTerminalWrite(args.data);
    if (chunk.length === 0) {
      return null;
    }
    await ctx.db.patch("ptySessions", row._id, {
      pendingInput: clipTerminalWrite(`${row.pendingInput}${chunk}`),
    });
    return null;
  },
  returns: v.null(),
});

export const resize = authedMutation({
  args: {
    cols: v.number(),
    rows: v.number(),
    sessionId: v.id("ptySessions"),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db.get("ptySessions", args.sessionId);
    if (!row) {
      throw new Error("Terminal session not found");
    }
    if (row.requestedBy !== ctx.user._id) {
      throw new Error("Unauthorized");
    }
    const cols = clampTerminalCols(args.cols);
    const rows = clampTerminalRows(args.rows);
    await ctx.db.patch("ptySessions", row._id, {
      cols,
      pendingCols: cols,
      pendingRows: rows,
      rows,
    });
    return null;
  },
  returns: v.null(),
});

export const close = authedMutation({
  args: { sessionId: v.id("ptySessions") },
  handler: async (ctx, args) => {
    const row = await ctx.db.get("ptySessions", args.sessionId);
    if (!row) {
      return null;
    }
    if (row.requestedBy !== ctx.user._id) {
      throw new Error("Unauthorized");
    }
    if (row.status === "starting" || row.status === "running") {
      await ctx.db.patch("ptySessions", row._id, { pendingClose: true });
      return null;
    }
    await ctx.db.patch("ptySessions", row._id, {
      completedAt: Date.now(),
      status: "closed",
    });
    return null;
  },
  returns: v.null(),
});

export const get = authedQuery({
  args: { sessionId: v.id("ptySessions") },
  handler: async (ctx, args) => {
    const row = await ctx.db.get("ptySessions", args.sessionId);
    if (!row) {
      return null;
    }
    const visible = await canSeeWorkbenchSession(
      ctx,
      row.orgId,
      row.runtimeId,
      row.requestedBy,
      ctx.user._id
    );
    if (!visible) {
      return null;
    }
    return toView(row);
  },
  returns: v.union(sessionView, v.null()),
});

export const claimNextOpen = mutation({
  args: { runtimeId: v.id("runtimes"), token: v.string() },
  handler: async (ctx, args) => {
    await getRuntimeByToken(ctx, args.runtimeId, args.token);
    await failStalePty(ctx, args.runtimeId);
    const queued = await ctx.db
      .query("ptySessions")
      .withIndex("by_runtime_and_status", (q) =>
        q.eq("runtimeId", args.runtimeId).eq("status", "starting")
      )
      .order("asc")
      .take(8);
    const row = queued.find((item) => item.claimedAt === undefined);
    if (!row) {
      return null;
    }
    const now = Date.now();
    await ctx.db.patch("ptySessions", row._id, {
      claimedAt: now,
      lastBridgeAt: now,
    });
    return {
      _id: row._id,
      cols: row.cols,
      cwd: row.cwd,
      rows: row.rows,
      terminalId: row.terminalId,
    };
  },
  returns: v.union(
    v.object({
      _id: v.id("ptySessions"),
      cols: v.number(),
      cwd: v.string(),
      rows: v.number(),
      terminalId: v.string(),
    }),
    v.null()
  ),
});

export const reportStarted = mutation({
  args: {
    error: v.optional(v.string()),
    pid: v.optional(v.number()),
    runtimeId: v.id("runtimes"),
    sessionId: v.id("ptySessions"),
    token: v.string(),
  },
  handler: async (ctx, args) => {
    await getRuntimeByToken(ctx, args.runtimeId, args.token);
    const row = await ctx.db.get("ptySessions", args.sessionId);
    if (!row || String(row.runtimeId) !== String(args.runtimeId)) {
      throw new Error("Terminal session not found");
    }
    const now = Date.now();
    if (args.error) {
      await ctx.db.patch("ptySessions", row._id, {
        completedAt: now,
        error: args.error.slice(0, 2000),
        lastBridgeAt: now,
        status: "error",
      });
      return null;
    }
    await ctx.db.patch("ptySessions", row._id, {
      lastBridgeAt: now,
      pid: args.pid,
      status: "running",
    });
    return null;
  },
  returns: v.null(),
});

export const takeInput = mutation({
  args: {
    runtimeId: v.id("runtimes"),
    sessionId: v.id("ptySessions"),
    token: v.string(),
  },
  handler: async (ctx, args) => {
    await getRuntimeByToken(ctx, args.runtimeId, args.token);
    const row = await ctx.db.get("ptySessions", args.sessionId);
    if (!row || String(row.runtimeId) !== String(args.runtimeId)) {
      return null;
    }
    if (row.status !== "starting" && row.status !== "running") {
      return {
        close: true,
        data: "",
        cols: undefined,
        rows: undefined,
      };
    }
    await ctx.db.patch("ptySessions", row._id, {
      lastBridgeAt: Date.now(),
      pendingClose: undefined,
      pendingCols: undefined,
      pendingInput: "",
      pendingRows: undefined,
    });
    return {
      close: row.pendingClose === true,
      cols: row.pendingCols,
      data: row.pendingInput,
      rows: row.pendingRows,
    };
  },
  returns: v.union(
    v.object({
      close: v.boolean(),
      cols: v.optional(v.number()),
      data: v.string(),
      rows: v.optional(v.number()),
    }),
    v.null()
  ),
});

export const listActive = mutation({
  args: { runtimeId: v.id("runtimes"), token: v.string() },
  handler: async (ctx, args) => {
    await getRuntimeByToken(ctx, args.runtimeId, args.token);
    await failStalePty(ctx, args.runtimeId);
    const starting = await ctx.db
      .query("ptySessions")
      .withIndex("by_runtime_and_status", (q) =>
        q.eq("runtimeId", args.runtimeId).eq("status", "starting")
      )
      .take(20);
    const running = await ctx.db
      .query("ptySessions")
      .withIndex("by_runtime_and_status", (q) =>
        q.eq("runtimeId", args.runtimeId).eq("status", "running")
      )
      .take(20);
    return [...starting, ...running].map((row) => row._id);
  },
  returns: v.array(v.id("ptySessions")),
});

export const appendOutput = mutation({
  args: {
    data: v.string(),
    runtimeId: v.id("runtimes"),
    sessionId: v.id("ptySessions"),
    token: v.string(),
  },
  handler: async (ctx, args) => {
    await getRuntimeByToken(ctx, args.runtimeId, args.token);
    const row = await ctx.db.get("ptySessions", args.sessionId);
    if (!row || String(row.runtimeId) !== String(args.runtimeId)) {
      throw new Error("Terminal session not found");
    }
    if (args.data.length === 0) {
      await ctx.db.patch("ptySessions", row._id, {
        lastBridgeAt: Date.now(),
      });
      return null;
    }
    await ctx.db.patch("ptySessions", row._id, {
      history: nextTerminalHistory(row.history, args.data),
      lastBridgeAt: Date.now(),
    });
    return null;
  },
  returns: v.null(),
});

export const reportExited = mutation({
  args: {
    error: v.optional(v.string()),
    exitCode: v.optional(v.number()),
    runtimeId: v.id("runtimes"),
    sessionId: v.id("ptySessions"),
    token: v.string(),
  },
  handler: async (ctx, args) => {
    await getRuntimeByToken(ctx, args.runtimeId, args.token);
    const row = await ctx.db.get("ptySessions", args.sessionId);
    if (!row || String(row.runtimeId) !== String(args.runtimeId)) {
      throw new Error("Terminal session not found");
    }
    const now = Date.now();
    await ctx.db.patch("ptySessions", row._id, {
      completedAt: now,
      error: args.error?.slice(0, 2000),
      exitCode: args.exitCode,
      lastBridgeAt: now,
      pendingClose: undefined,
      pendingInput: "",
      status: args.error ? "error" : "exited",
    });
    return null;
  },
  returns: v.null(),
});
