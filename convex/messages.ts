import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import {
  assertCanUseRuntime,
  assertChatVisible,
  getMembership,
} from "./lib/access";
import { authedMutation, authedQuery } from "./lib/customFunctions";
import { buildAgentContext } from "./lib/context";
import { parseMentions, preferredProvider, shouldDispatchAgent } from "./lib/mentions";
import { messageDoc, providerKind } from "./lib/validators";

export const list = authedQuery({
  args: {
    chatId: v.id("chats"),
    limit: v.optional(v.number()),
  },
  returns: v.array(messageDoc),
  handler: async (ctx, args) => {
    const chat = await ctx.db.get("chats", args.chatId);
    if (!chat) throw new Error("Chat not found");
    const membership = await getMembership(ctx, chat.orgId, ctx.user._id);
    if (!membership) throw new Error("Not a member of this organization");
    await assertChatVisible(ctx, chat, ctx.user._id, membership.role);
    const limit = Math.min(Math.max(args.limit ?? 100, 1), 200);
    const rows = await ctx.db
      .query("messages")
      .withIndex("by_chat", (q) => q.eq("chatId", args.chatId))
      .order("asc")
      .take(limit);
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
  },
});

export const send = authedMutation({
  args: {
    chatId: v.id("chats"),
    body: v.string(),
    runtimeId: v.optional(v.id("runtimes")),
  },
  returns: v.object({
    messageId: v.id("messages"),
    dispatched: v.boolean(),
    assistantMessageId: v.optional(v.id("messages")),
    jobId: v.optional(v.id("jobs")),
    driverKind: v.optional(providerKind),
  }),
  handler: async (ctx, args) => {
    const chat = await ctx.db.get("chats", args.chatId);
    if (!chat) throw new Error("Chat not found");
    const membership = await getMembership(ctx, chat.orgId, ctx.user._id);
    if (!membership) throw new Error("Not a member of this organization");
    await assertChatVisible(ctx, chat, ctx.user._id, membership.role);

    const body = args.body.trim();
    if (body.length < 1) throw new Error("Message is required");
    if (body.length > 20000) throw new Error("Message is too long");

    const mentions = parseMentions(body);
    const messageId = await ctx.db.insert("messages", {
      chatId: args.chatId,
      authorType: "user",
      authorId: ctx.user._id,
      body,
      mentions: mentions.map((mention) => mention.raw),
    });

    const dispatch = shouldDispatchAgent({ chatKind: chat.kind, mentions });
    if (!dispatch) {
      return { messageId, dispatched: false };
    }

    const history = await ctx.db
      .query("messages")
      .withIndex("by_chat", (q) => q.eq("chatId", args.chatId))
      .order("desc")
      .take(30);
    const project = chat.projectId
      ? await ctx.db.get("projects", chat.projectId)
      : null;
    const context = buildAgentContext({
      chat,
      project,
      mentions,
      history: [...history].reverse(),
    });

    const runtime = await pickRuntime(ctx, {
      orgId: chat.orgId,
      userId: ctx.user._id,
      role: membership.role,
      hint: args.runtimeId,
      fallbackDriver: preferredProvider(mentions, "codex"),
    });
    const driverKind = preferredProvider(mentions, runtime?.defaultDriver ?? "codex");

    if (!runtime) {
      const assistantMessageId = await ctx.db.insert("messages", {
        chatId: args.chatId,
        authorType: "agent",
        body: "オンラインのマシンランタイムがありません。Runtimes で登録して `npm run runtime` を起動してください。",
        mentions: [],
        status: "done",
        driverKind,
      });
      return { messageId, dispatched: true, assistantMessageId, driverKind };
    }

    const assistantMessageId = await ctx.db.insert("messages", {
      chatId: args.chatId,
      authorType: "agent",
      runtimeId: runtime.doc._id,
      body: "",
      mentions: [],
      status: "streaming",
      driverKind,
    });
    const jobId = await ctx.db.insert("jobs", {
      orgId: chat.orgId,
      projectId: chat.projectId,
      chatId: args.chatId,
      triggerMessageId: messageId,
      assistantMessageId,
      runtimeId: runtime.doc._id,
      driverKind,
      status: "queued",
      prompt: body,
      contextJson: JSON.stringify(context),
    });
    await ctx.db.patch("messages", assistantMessageId, { jobId });
    return { messageId, dispatched: true, assistantMessageId, jobId, driverKind };
  },
});

type RuntimePick = {
  doc: {
    _id: Id<"runtimes">;
    ownerUserId: Id<"users">;
  };
  defaultDriver: "codex" | "claudeAgent" | "cursor" | "grok" | "opencode" | "antigravity";
} | null;

type CtxWithUser = MutationCtx & { user: Doc<"users"> };

async function pickRuntime(
  ctx: CtxWithUser,
  input: {
    orgId: Id<"orgs">;
    userId: Id<"users">;
    role: "owner" | "admin" | "member";
    hint?: Id<"runtimes">;
    fallbackDriver: NonNullable<RuntimePick>["defaultDriver"];
  },
): Promise<RuntimePick> {
  const candidates = await ctx.db
    .query("runtimes")
    .withIndex("by_org", (q) => q.eq("orgId", input.orgId))
    .take(50);
  // A runtime whose heartbeat stopped stays "online" in the DB; treat it as
  // offline after 90s so jobs don't queue onto a dead machine forever.
  // (Runtime loop heartbeats every ~20s.)
  const staleBefore = Date.now() - 90_000;
  const online = candidates.filter(
    (runtime) =>
      runtime.status === "online" &&
      runtime.lastSeenAt !== undefined &&
      runtime.lastSeenAt > staleBefore,
  );
  const ordered = [
    ...online.filter((runtime) =>
      input.hint ? String(runtime._id) === String(input.hint) : false,
    ),
    ...online.filter((runtime) =>
      input.hint ? String(runtime._id) !== String(input.hint) : true,
    ),
  ];
  for (const runtime of ordered) {
    try {
      await assertCanUseRuntime(ctx, runtime, input.userId, input.role);
    } catch {
      continue;
    }
    const providers = await ctx.db
      .query("runtimeProviders")
      .withIndex("by_runtime", (q) => q.eq("runtimeId", runtime._id))
      .take(10);
    const available = providers.find((provider) => provider.available);
    return {
      doc: runtime,
      defaultDriver: available?.driverKind ?? input.fallbackDriver,
    };
  }
  return null;
}
