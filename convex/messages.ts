import { v } from "convex/values";

import type { Doc } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { assertChatVisible, getMembership } from "./lib/access";
import { postConnectorCardMessage } from "./lib/connectorCards";
import { authedMutation, authedQuery } from "./lib/customFunctions";
import { sendUserMessage } from "./lib/sendMessage";
import {
  connectorScope,
  messageDoc,
  optionSelection,
  providerKind,
} from "./lib/validators";

async function enrichMessages(
  ctx: { db: QueryCtx["db"] },
  rows: Doc<"messages">[]
) {
  const out = [];
  for (const row of rows) {
    let authorName: string | undefined;
    let authorHandle: string | undefined;
    if (row.authorId) {
      const author = await ctx.db.get("users", row.authorId);
      authorName = author?.name;
      authorHandle = author?.handle;
    }
    out.push({ ...row, authorName, authorHandle });
  }
  return out;
}

export const list = authedQuery({
  args: {
    chatId: v.id("chats"),
    cursor: v.optional(v.union(v.string(), v.null())),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const chat = await ctx.db.get("chats", args.chatId);
    if (!chat) {
      throw new Error("Chat not found");
    }
    const membership = await getMembership(ctx, chat.orgId, ctx.user._id);
    if (!membership) {
      throw new Error("Not a member of this organization");
    }
    await assertChatVisible(ctx, chat, ctx.user._id, membership.role);
    const limit = Math.min(Math.max(args.limit ?? 80, 1), 200);
    const result = await ctx.db
      .query("messages")
      .withIndex("by_chat", (q) => q.eq("chatId", args.chatId))
      .order("desc")
      .paginate({ cursor: args.cursor ?? null, numItems: limit });
    return {
      continueCursor: result.continueCursor,
      isDone: result.isDone,
      messages: await enrichMessages(ctx, [...result.page].reverse()),
    };
  },
  returns: v.object({
    continueCursor: v.string(),
    isDone: v.boolean(),
    messages: v.array(messageDoc),
  }),
});

export const send = authedMutation({
  args: {
    chatId: v.id("chats"),
    body: v.string(),
    runtimeId: v.optional(v.id("runtimes")),
    /* the composer's provider / model pick; wins over the chat binding, loses to an explicit @mention */
    driverKind: v.optional(providerKind),
    model: v.optional(v.string()),
    options: v.optional(v.array(optionSelection)),
  },
  handler: async (ctx, args) => await sendUserMessage(ctx, ctx.user, args),
  returns: v.object({
    messageId: v.id("messages"),
    dispatched: v.boolean(),
    assistantMessageId: v.optional(v.id("messages")),
    jobId: v.optional(v.id("jobs")),
    driverKind: v.optional(providerKind),
    model: v.optional(v.string()),
  }),
});

export const suggestConnector = authedMutation({
  args: {
    chatId: v.id("chats"),
    provider: v.optional(v.string()),
    scope: v.optional(connectorScope),
  },
  handler: async (ctx, args) =>
    await postConnectorCardMessage(ctx, {
      chatId: args.chatId,
      provider: args.provider,
      scope: args.scope,
      userId: ctx.user._id,
    }),
  returns: v.object({
    messageId: v.id("messages"),
    provider: v.string(),
    scope: connectorScope,
  }),
});
