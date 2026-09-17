import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { assertChatVisible, getMembership } from "./access";

export const SIDE_CHAT_BODY_MAX = 4000;
export const SIDE_CHAT_KEEP = 80;
export const SIDE_CHAT_LIST_MAX = 40;
export const SIDE_CHAT_MIGRATE_MAX = 40;

type Ctx = QueryCtx | MutationCtx;

export function normalizeSideChatBody(body: string): string {
  const trimmed = body.trim();
  if (trimmed.length < 1) {
    throw new Error("Message is required");
  }
  if (trimmed.length > SIDE_CHAT_BODY_MAX) {
    throw new Error("Message is too long");
  }
  return trimmed;
}

export async function loadVisibleParentChat(
  ctx: Ctx,
  chatId: Id<"chats">,
  userId: Id<"users">
): Promise<Doc<"chats"> | null> {
  const chat = await ctx.db.get("chats", chatId);
  if (!chat) {
    return null;
  }
  const membership = await getMembership(ctx, chat.orgId, userId);
  if (!membership) {
    return null;
  }
  try {
    await assertChatVisible(ctx, chat, userId, membership.role);
  } catch {
    return null;
  }
  return chat;
}

export async function requireVisibleParentChat(
  ctx: Ctx,
  chatId: Id<"chats">,
  userId: Id<"users">
): Promise<Doc<"chats">> {
  const chat = await ctx.db.get("chats", chatId);
  if (!chat) {
    throw new Error("Chat not found");
  }
  const membership = await getMembership(ctx, chat.orgId, userId);
  if (!membership) {
    throw new Error("Not a member of this organization");
  }
  await assertChatVisible(ctx, chat, userId, membership.role);
  return chat;
}

export async function pruneSideChatTurns(
  ctx: MutationCtx,
  chatId: Id<"chats">
): Promise<void> {
  const rows = await ctx.db
    .query("sideChatTurns")
    .withIndex("by_chat", (q) => q.eq("chatId", chatId))
    .order("desc")
    .take(SIDE_CHAT_KEEP + 20);
  if (rows.length <= SIDE_CHAT_KEEP) {
    return;
  }
  for (const row of rows.slice(SIDE_CHAT_KEEP)) {
    await ctx.db.delete("sideChatTurns", row._id);
  }
}

export async function insertSideChatTurn(
  ctx: MutationCtx,
  input: {
    authorId: Id<"users">;
    body: string;
    chat: Doc<"chats">;
  }
): Promise<Id<"sideChatTurns">> {
  const turnId = await ctx.db.insert("sideChatTurns", {
    authorId: input.authorId,
    body: input.body,
    chatId: input.chat._id,
    orgId: input.chat.orgId,
  });
  await pruneSideChatTurns(ctx, input.chat._id);
  return turnId;
}
