import { v } from "convex/values";

import type { Doc } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { authedMutation, authedQuery } from "./lib/customFunctions";
import {
  insertSideChatTurn,
  loadVisibleParentChat,
  normalizeSideChatBody,
  requireVisibleParentChat,
  SIDE_CHAT_LIST_MAX,
  SIDE_CHAT_MIGRATE_MAX,
} from "./lib/sideChat";
import { sideChatTurnView } from "./lib/validators";

const listResult = v.union(
  v.null(),
  v.object({
    chatId: v.id("chats"),
    turns: v.array(sideChatTurnView),
  })
);

async function enrichTurns(
  ctx: { db: QueryCtx["db"] },
  rows: Doc<"sideChatTurns">[]
) {
  const turns = [];
  for (const row of rows) {
    const author = await ctx.db.get("users", row.authorId);
    turns.push({
      _creationTime: row._creationTime,
      _id: row._id,
      authorHandle: author?.handle,
      authorId: row.authorId,
      authorName: author?.name,
      body: row.body,
      chatId: row.chatId,
    });
  }
  return turns;
}

export const list = authedQuery({
  args: {
    chatId: v.id("chats"),
  },
  handler: async (ctx, args) => {
    const chat = await loadVisibleParentChat(ctx, args.chatId, ctx.user._id);
    if (!chat) {
      return null;
    }
    const rows = await ctx.db
      .query("sideChatTurns")
      .withIndex("by_chat", (q) => q.eq("chatId", args.chatId))
      .order("desc")
      .take(SIDE_CHAT_LIST_MAX);
    return {
      chatId: args.chatId,
      turns: await enrichTurns(ctx, [...rows].reverse()),
    };
  },
  returns: listResult,
});

export const send = authedMutation({
  args: {
    body: v.string(),
    chatId: v.id("chats"),
  },
  handler: async (ctx, args) => {
    const chat = await requireVisibleParentChat(ctx, args.chatId, ctx.user._id);
    const body = normalizeSideChatBody(args.body);
    const turnId = await insertSideChatTurn(ctx, {
      authorId: ctx.user._id,
      body,
      chat,
    });
    return { dispatched: false as const, turnId };
  },
  returns: v.object({
    dispatched: v.literal(false),
    turnId: v.id("sideChatTurns"),
  }),
});

export const migrateLocalDrafts = authedMutation({
  args: {
    bodies: v.array(v.string()),
    chatId: v.id("chats"),
  },
  handler: async (ctx, args) => {
    const chat = await requireVisibleParentChat(ctx, args.chatId, ctx.user._id);
    let inserted = 0;
    for (const raw of args.bodies.slice(0, SIDE_CHAT_MIGRATE_MAX)) {
      let body: string;
      try {
        body = normalizeSideChatBody(raw);
      } catch {
        continue;
      }
      await insertSideChatTurn(ctx, {
        authorId: ctx.user._id,
        body,
        chat,
      });
      inserted += 1;
    }
    return { dispatched: false as const, inserted };
  },
  returns: v.object({
    dispatched: v.literal(false),
    inserted: v.number(),
  }),
});
