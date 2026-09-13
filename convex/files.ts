import { v } from "convex/values";

import {
  DOWNLOAD_TICKET_TTL_MS,
  MAX_FILE_BYTES,
  UPLOAD_TICKET_TTL_MS,
  normalizeContentType,
  sanitizeFileName,
} from "../shared/files.ts";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { internalMutation, internalQuery } from "./_generated/server";
import { assertChatVisible, getMembership } from "./lib/access";
import { authedMutation, authedQuery } from "./lib/customFunctions";
import { randomToken, sha256Hex } from "./lib/ids";

const fileView = v.object({
  _id: v.id("files"),
  contentType: v.string(),
  key: v.string(),
  name: v.string(),
  size: v.number(),
  url: v.string(),
});

async function requireVisibleChat(
  ctx: QueryCtx | MutationCtx,
  chatId: Id<"chats">,
  userId: Id<"users">
) {
  const chat = await ctx.db.get("chats", chatId);
  if (!chat) {
    throw new Error("Chat not found");
  }
  const membership = await getMembership(ctx, chat.orgId, userId);
  if (!membership) {
    throw new Error("Not a member of this organization");
  }
  await assertChatVisible(ctx, chat, userId, membership.role);
  return { chat, membership };
}

async function issueDownloadUrl(
  ctx: MutationCtx,
  file: Doc<"files">,
  userId: Id<"users">
) {
  const ticket = randomToken(18);
  await ctx.db.insert("fileTickets", {
    kind: "download",
    orgId: file.orgId,
    chatId: file.chatId,
    fileId: file._id,
    key: file.key,
    tokenHash: await sha256Hex(ticket),
    userId,
    expiresAt: Date.now() + DOWNLOAD_TICKET_TTL_MS,
    name: file.name,
    contentType: file.contentType,
  });
  return `/api/files/${encodeURIComponent(file.key)}?ticket=${ticket}`;
}

export const prepareUpload = authedMutation({
  args: {
    chatId: v.id("chats"),
    contentType: v.string(),
    name: v.string(),
    orgId: v.id("orgs"),
    size: v.number(),
  },
  handler: async (ctx, args) => {
    const { chat } = await requireVisibleChat(ctx, args.chatId, ctx.user._id);
    if (chat.orgId !== args.orgId) {
      throw new Error("Chat does not belong to this organization");
    }
    if (args.size <= 0 || args.size > MAX_FILE_BYTES) {
      throw new Error("File must be between 1 byte and 20MB");
    }
    const name = sanitizeFileName(args.name);
    const contentType = normalizeContentType(args.contentType);
    const key = `${args.orgId}/${args.chatId}/${randomToken(16)}/${name}`;
    const ticket = randomToken(18);
    await ctx.db.insert("fileTickets", {
      kind: "upload",
      orgId: args.orgId,
      chatId: args.chatId,
      key,
      tokenHash: await sha256Hex(ticket),
      userId: ctx.user._id,
      expiresAt: Date.now() + UPLOAD_TICKET_TTL_MS,
      name,
      contentType,
      size: args.size,
    });
    return { key, ticket };
  },
  returns: v.object({ key: v.string(), ticket: v.string() }),
});

export const record = authedMutation({
  args: {
    chatId: v.id("chats"),
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
    if (!args.chatId) {
      throw new Error("chatId is required");
    }
    const { chat } = await requireVisibleChat(ctx, args.chatId, ctx.user._id);
    if (chat.orgId !== args.orgId) {
      throw new Error("Chat does not belong to this organization");
    }
    if (args.messageId) {
      const message = await ctx.db.get("messages", args.messageId);
      if (!message || message.chatId !== args.chatId) {
        throw new Error("Message does not belong to this chat");
      }
    }
    if (args.size <= 0 || args.size > MAX_FILE_BYTES) {
      throw new Error("File must be between 1 byte and 20MB");
    }
    const tickets = await ctx.db
      .query("fileTickets")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .take(20);
    const owned = tickets.some(
      (ticket) =>
        ticket.kind === "upload" &&
        ticket.consumedAt !== undefined &&
        ticket.userId === ctx.user._id &&
        ticket.orgId === args.orgId &&
        ticket.chatId === args.chatId
    );
    if (!owned) {
      throw new Error("Unknown or unauthorized file key");
    }
    const existing = await ctx.db
      .query("files")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .unique();
    if (existing) {
      if (
        existing.orgId !== args.orgId ||
        existing.uploadedBy !== ctx.user._id
      ) {
        throw new Error("Unknown or unauthorized file key");
      }
      if (args.messageId && existing.messageId !== args.messageId) {
        await ctx.db.patch("files", existing._id, {
          messageId: args.messageId,
        });
      }
      return existing._id;
    }
    return await ctx.db.insert("files", {
      orgId: args.orgId,
      chatId: args.chatId,
      messageId: args.messageId,
      key: args.key.slice(0, 300),
      name: sanitizeFileName(args.name),
      contentType: normalizeContentType(args.contentType),
      size: args.size,
      uploadedBy: ctx.user._id,
    });
  },
  returns: v.id("files"),
});

export const listByChat = authedQuery({
  args: { chatId: v.id("chats") },
  handler: async (ctx, args) => {
    await requireVisibleChat(ctx, args.chatId, ctx.user._id);
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
      // Queries cannot mint download tickets; the client calls ticketForKey.
      url: `/api/files/${encodeURIComponent(row.key)}`,
    }));
  },
  returns: v.array(fileView),
});

export const ticketForKey = authedMutation({
  args: { key: v.string() },
  handler: async (ctx, args) => {
    const file = await ctx.db
      .query("files")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .unique();
    if (!file?.chatId) {
      throw new Error("File not found");
    }
    await requireVisibleChat(ctx, file.chatId, ctx.user._id);
    return await issueDownloadUrl(ctx, file, ctx.user._id);
  },
  returns: v.string(),
});

export const consumeUploadTicket = internalMutation({
  args: { ticket: v.string() },
  handler: async (ctx, args) => {
    const tokenHash = await sha256Hex(args.ticket);
    const row = await ctx.db
      .query("fileTickets")
      .withIndex("by_token_hash", (q) => q.eq("tokenHash", tokenHash))
      .unique();
    if (!row || row.kind !== "upload") {
      throw new Error("Invalid upload ticket");
    }
    if (row.expiresAt < Date.now()) {
      throw new Error("Upload ticket expired");
    }
    if (row.consumedAt !== undefined) {
      throw new Error("Upload ticket already used");
    }
    await ctx.db.patch("fileTickets", row._id, { consumedAt: Date.now() });
    return {
      key: row.key,
      name: row.name ?? "upload.bin",
      contentType: row.contentType ?? "application/octet-stream",
      size: row.size ?? 0,
    };
  },
  returns: v.object({
    contentType: v.string(),
    key: v.string(),
    name: v.string(),
    size: v.number(),
  }),
});

export const authorizeDownloadTicket = internalQuery({
  args: { key: v.string(), ticket: v.string() },
  handler: async (ctx, args) => {
    const tokenHash = await sha256Hex(args.ticket);
    const row = await ctx.db
      .query("fileTickets")
      .withIndex("by_token_hash", (q) => q.eq("tokenHash", tokenHash))
      .unique();
    if (!row || row.kind !== "download") {
      return null;
    }
    if (row.expiresAt < Date.now()) {
      return null;
    }
    if (row.key !== args.key) {
      return null;
    }
    return {
      contentType: row.contentType ?? "application/octet-stream",
      name: row.name ?? "file",
    };
  },
  returns: v.union(
    v.object({ contentType: v.string(), name: v.string() }),
    v.null()
  ),
});
