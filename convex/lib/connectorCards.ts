import { normalizeConnectorCardAttachment } from "../../shared/connectors.ts";
import type { ConnectorScope } from "../../shared/connectors.ts";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { assertChatVisible, getMembership } from "./access";

export type PostedConnectorCard = {
  messageId: Id<"messages">;
  provider: string;
  scope: ConnectorScope;
};

export async function postConnectorCardMessage(
  ctx: MutationCtx,
  input: {
    chatId: Id<"chats">;
    provider?: string;
    scope?: string;
    userId: Id<"users">;
  }
): Promise<PostedConnectorCard> {
  const chat = await ctx.db.get("chats", input.chatId);
  if (!chat) {
    throw new Error("Chat not found");
  }
  const membership = await getMembership(ctx, chat.orgId, input.userId);
  if (!membership) {
    throw new Error("Not a member of this organization");
  }
  await assertChatVisible(ctx, chat, input.userId, membership.role);
  const attachment = normalizeConnectorCardAttachment({
    provider: input.provider,
    scope: input.scope,
  });
  const displayName =
    attachment.provider === "linear" ? "Linear" : attachment.provider;
  const body =
    attachment.scope === "user"
      ? `${displayName} を個人アカウントとして接続します。`
      : `${displayName} をこの org に接続します。`;
  const messageId = await ctx.db.insert("messages", {
    attachments: [attachment],
    authorId: input.userId,
    authorType: "system",
    body,
    chatId: input.chatId,
    mentions: [],
  });
  return {
    messageId,
    provider: attachment.provider,
    scope: attachment.scope,
  };
}
