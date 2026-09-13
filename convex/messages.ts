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
import {
  parseMentions,
  preferredProvider,
  preferredTarget,
  shouldDispatchAgent,
  type AgentTarget,
} from "./lib/mentions";
import { isValidModelSlug, resolveModelSlug, type ProviderDriverKind } from "./lib/providers";
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
    /* the composer's provider / model pick; wins over the chat binding, loses to an explicit @mention */
    driverKind: v.optional(providerKind),
    model: v.optional(v.string()),
  },
  returns: v.object({
    messageId: v.id("messages"),
    dispatched: v.boolean(),
    assistantMessageId: v.optional(v.id("messages")),
    jobId: v.optional(v.id("jobs")),
    driverKind: v.optional(providerKind),
    model: v.optional(v.string()),
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
    const explicit = explicitTarget(args);

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

    // Fallback when nothing is @mentioned: composer pick > chat binding >
    // whatever the runtime has installed (legacy DMs / `@agent`).
    const bound: AgentTarget | undefined =
      explicit ?? (chat.driverKind ? { driverKind: chat.driverKind, model: chat.model } : undefined);
    const wantedKind = preferredProvider(mentions, bound?.driverKind ?? "codex");
    const runtime = await pickRuntime(ctx, {
      orgId: chat.orgId,
      userId: ctx.user._id,
      role: membership.role,
      hint: args.runtimeId,
      wantedKind,
    });
    const target = preferredTarget(
      mentions,
      bound ?? { driverKind: runtime?.installedDriver ?? "codex" },
    );
    const { driverKind, model } = target;

    if (!runtime) {
      const assistantMessageId = await ctx.db.insert("messages", {
        chatId: args.chatId,
        authorType: "agent",
        body: "オンラインのマシンランタイムがありません。Runtime タブでこのマシンを登録し、`npm i -g tahcode` → `tahcode link …` → `tahcode start` を実行してください。",
        mentions: [],
        status: "done",
        driverKind,
        model,
      });
      return { messageId, dispatched: true, assistantMessageId, driverKind, model };
    }

    const assistantMessageId = await ctx.db.insert("messages", {
      chatId: args.chatId,
      authorType: "agent",
      runtimeId: runtime.doc._id,
      body: "",
      mentions: [],
      status: "streaming",
      driverKind,
      model,
    });
    const jobId = await ctx.db.insert("jobs", {
      orgId: chat.orgId,
      projectId: chat.projectId,
      chatId: args.chatId,
      triggerMessageId: messageId,
      assistantMessageId,
      runtimeId: runtime.doc._id,
      driverKind,
      model,
      status: "queued",
      prompt: body,
      contextJson: JSON.stringify(context),
    });
    await ctx.db.patch("messages", assistantMessageId, { jobId });
    return { messageId, dispatched: true, assistantMessageId, jobId, driverKind, model };
  },
});

function explicitTarget(args: { driverKind?: ProviderDriverKind; model?: string }): AgentTarget | undefined {
  if (!args.driverKind) return undefined;
  const trimmed = args.model?.trim();
  if (trimmed && !isValidModelSlug(trimmed)) {
    throw new Error("Model must be 1-80 characters of letters, digits, dots, dashes, underscores or slashes");
  }
  return { driverKind: args.driverKind, model: resolveModelSlug(args.driverKind, trimmed) };
}

type RuntimePick = {
  doc: {
    _id: Id<"runtimes">;
    ownerUserId: Id<"users">;
  };
  /** the wanted provider when this machine reports it, else its first installed CLI */
  installedDriver: ProviderDriverKind | undefined;
} | null;

type CtxWithUser = MutationCtx & { user: Doc<"users"> };

/**
 * Pick the runtime a job goes to: the composer's explicit machine first, then
 * any usable online machine that actually has the wanted provider installed,
 * then any usable online machine (the runtime reports a clear "not installed"
 * error instead of silently running another provider).
 */
async function pickRuntime(
  ctx: CtxWithUser,
  input: {
    orgId: Id<"orgs">;
    userId: Id<"users">;
    role: "owner" | "admin" | "member";
    hint?: Id<"runtimes">;
    wantedKind: ProviderDriverKind;
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
  const usable: { doc: (typeof online)[number]; hasWanted: boolean; installed: ProviderDriverKind | undefined }[] = [];
  for (const runtime of online) {
    try {
      await assertCanUseRuntime(ctx, runtime, input.userId, input.role);
    } catch {
      continue;
    }
    const providers = await ctx.db
      .query("runtimeProviders")
      .withIndex("by_runtime", (q) => q.eq("runtimeId", runtime._id))
      .take(10);
    const available = providers.filter((provider) => provider.available);
    usable.push({
      doc: runtime,
      hasWanted: available.some((provider) => provider.driverKind === input.wantedKind),
      installed: available[0]?.driverKind,
    });
  }
  const hinted = input.hint ? usable.find((item) => String(item.doc._id) === String(input.hint)) : undefined;
  const pick = hinted ?? usable.find((item) => item.hasWanted) ?? usable[0];
  if (!pick) return null;
  return {
    doc: pick.doc,
    installedDriver: pick.hasWanted ? input.wantedKind : pick.installed,
  };
}
