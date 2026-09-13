import { v } from "convex/values";

import { assertChatVisible, getMembership } from "./lib/access";
import { authedMutation, authedQuery } from "./lib/customFunctions";

export const record = authedMutation({
  args: {
    chatId: v.optional(v.id("chats")),
    contentType: v.string(),
    key: v.string(),
    messageId: v.optional(v.id("messages")),
    name: v.string(),
    orgId: v.id("orgs"),
    size: v.number(),
  },
  handler: async (ctx, args) => {
    const membership = await getMembership(ctx, args.orgId, ctx.user._id);
    if (!membership) {
      throw new Error("Not a member of this organization");
    }
    if (args.chatId) {
      const chat = await ctx.db.get("chats", args.chatId);
      if (!chat) {
        throw new Error("Chat not found");
      }
      await assertChatVisible(ctx, chat, ctx.user._id, membership.role);
    }
    if (args.size <= 0 || args.size > 20 * 1024 * 1024) {
      throw new Error("File must be between 1 byte and 20MB");
    }
    return await ctx.db.insert("files", {
      orgId: args.orgId,
      chatId: args.chatId,
      messageId: args.messageId,
      key: args.key.slice(0, 300),
      name: args.name.slice(0, 120),
      contentType: args.contentType.slice(0, 120),
      size: args.size,
      uploadedBy: ctx.user._id,
    });
  },
  returns: v.id("files"),
});

export const listByChat = authedQuery({
  args: { chatId: v.id("chats") },
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
    const rows = await ctx.db
      .query("files")
      .withIndex("by_chat", (q) => q.eq("chatId", args.chatId))
      .order("desc")
      .take(50);
    return rows.map((row) => ({
      _id: row._id,
      key: row.key,
      name: row.name,
      contentType: row.contentType,
      size: row.size,
      url: `/api/files/${encodeURIComponent(row.key)}`,
    }));
  },
  returns: v.array(
    v.object({
      _id: v.id("files"),
      key: v.string(),
      name: v.string(),
      contentType: v.string(),
      size: v.number(),
      url: v.string(),
    })
  ),
});
