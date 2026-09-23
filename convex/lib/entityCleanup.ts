import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { deleteChatToolApprovals } from "./toolApprovals";

const DELETE_BATCH = 200;
const DELETE_ROUNDS = 20;

async function deleteJobEvents(ctx: MutationCtx, jobId: Id<"jobs">) {
  for (let round = 0; round < DELETE_ROUNDS; round++) {
    const events = await ctx.db
      .query("jobEvents")
      .withIndex("by_job", (q) => q.eq("jobId", jobId))
      .take(DELETE_BATCH);
    if (events.length === 0) {
      return;
    }
    for (const event of events) {
      await ctx.db.delete("jobEvents", event._id);
    }
    if (events.length < DELETE_BATCH) {
      return;
    }
  }
  throw new Error("Too many related records to delete at once");
}

async function deleteChatJobs(ctx: MutationCtx, chatId: Id<"chats">) {
  for (let round = 0; round < DELETE_ROUNDS; round++) {
    const jobs = await ctx.db
      .query("jobs")
      .withIndex("by_chat", (q) => q.eq("chatId", chatId))
      .take(DELETE_BATCH);
    if (jobs.length === 0) {
      return;
    }
    for (const job of jobs) {
      await deleteJobEvents(ctx, job._id);
      await ctx.db.delete("jobs", job._id);
    }
    if (jobs.length < DELETE_BATCH) {
      return;
    }
  }
  throw new Error("Too many related records to delete at once");
}

async function deleteChatMessages(ctx: MutationCtx, chatId: Id<"chats">) {
  for (let round = 0; round < DELETE_ROUNDS; round++) {
    const messages = await ctx.db
      .query("messages")
      .withIndex("by_chat", (q) => q.eq("chatId", chatId))
      .take(DELETE_BATCH);
    if (messages.length === 0) {
      return;
    }
    for (const message of messages) {
      await ctx.db.delete("messages", message._id);
    }
    if (messages.length < DELETE_BATCH) {
      return;
    }
  }
  throw new Error("Too many related records to delete at once");
}

async function deleteChatFiles(ctx: MutationCtx, chatId: Id<"chats">) {
  for (let round = 0; round < DELETE_ROUNDS; round++) {
    const files = await ctx.db
      .query("files")
      .withIndex("by_chat", (q) => q.eq("chatId", chatId))
      .take(DELETE_BATCH);
    if (files.length === 0) {
      return;
    }
    for (const file of files) {
      await ctx.db.delete("files", file._id);
    }
    if (files.length < DELETE_BATCH) {
      return;
    }
  }
  throw new Error("Too many related records to delete at once");
}

async function deleteChatMembers(ctx: MutationCtx, chatId: Id<"chats">) {
  const members = await ctx.db
    .query("chatMembers")
    .withIndex("by_chat", (q) => q.eq("chatId", chatId))
    .take(200);
  for (const member of members) {
    await ctx.db.delete("chatMembers", member._id);
  }
}

async function deleteChatSideTurns(ctx: MutationCtx, chatId: Id<"chats">) {
  for (let round = 0; round < DELETE_ROUNDS; round++) {
    const turns = await ctx.db
      .query("sideChatTurns")
      .withIndex("by_chat", (q) => q.eq("chatId", chatId))
      .take(DELETE_BATCH);
    if (turns.length === 0) {
      return;
    }
    for (const turn of turns) {
      await ctx.db.delete("sideChatTurns", turn._id);
    }
    if (turns.length < DELETE_BATCH) {
      return;
    }
  }
  throw new Error("Too many related records to delete at once");
}

/** Drop a chat and its messages / jobs / memberships. R2 bytes are left to expire. */
export async function deleteChatTree(
  ctx: MutationCtx,
  chatId: Id<"chats">
): Promise<void> {
  await deleteChatJobs(ctx, chatId);
  await deleteChatMessages(ctx, chatId);
  await deleteChatSideTurns(ctx, chatId);
  await deleteChatToolApprovals(ctx, chatId);
  await deleteChatFiles(ctx, chatId);
  await deleteChatMembers(ctx, chatId);
  await ctx.db.delete("chats", chatId);
}

async function deleteProjectFolders(
  ctx: MutationCtx,
  projectId: Id<"projects">
) {
  const folders = await ctx.db
    .query("projectRuntimeFolders")
    .withIndex("by_project", (q) => q.eq("projectId", projectId))
    .take(50);
  for (const folder of folders) {
    await ctx.db.delete("projectRuntimeFolders", folder._id);
  }
}

async function deleteProjectMembers(
  ctx: MutationCtx,
  projectId: Id<"projects">
) {
  const members = await ctx.db
    .query("projectMembers")
    .withIndex("by_project", (q) => q.eq("projectId", projectId))
    .take(200);
  for (const member of members) {
    await ctx.db.delete("projectMembers", member._id);
  }
}

/** Drop a project, its chats, folders, and memberships. */
export async function deleteProjectTree(
  ctx: MutationCtx,
  projectId: Id<"projects">
): Promise<void> {
  for (let round = 0; round < DELETE_ROUNDS; round++) {
    const chats = await ctx.db
      .query("chats")
      .withIndex("by_project", (q) => q.eq("projectId", projectId))
      .take(DELETE_BATCH);
    if (chats.length === 0) {
      break;
    }
    for (const chat of chats) {
      await deleteChatTree(ctx, chat._id);
    }
    if (chats.length < DELETE_BATCH) {
      break;
    }
    if (round === DELETE_ROUNDS - 1) {
      throw new Error("Too many related records to delete at once");
    }
  }
  await deleteProjectFolders(ctx, projectId);
  await deleteProjectMembers(ctx, projectId);
  await ctx.db.delete("projects", projectId);
}
