import {
  NO_ONLINE_RUNTIME_BODY,
  QUEUED_CLAIM_TIMEOUT_MS,
} from "../../shared/runtimeHealth.ts";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import {
  assertCanUseRuntime,
  assertChatVisible,
  getMembership,
} from "./access";
import { buildAgentContext } from "./context";
import type { AgentTarget } from "./mentions";
import {
  expandResolvedMentions,
  parseMentions,
  preferredProvider,
  preferredTarget,
  shouldDispatchAgent,
} from "./mentions";
import type { ProviderOptionSelection } from "./modelOptions";
import { sanitizeOptionSelections } from "./modelOptions";
import type { ProviderDriverKind } from "./providers";
import {
  cursorEffortFromOptions,
  isValidModelSlug,
  resolveCursorCliModel,
  resolveModelSlug,
} from "./providers";
import { STALE_RUNTIME_MS } from "./runtimeHealth";
import { loadJobSkills } from "./skills";

export type SendMessageResult = {
  assistantMessageId?: Id<"messages">;
  dispatched: boolean;
  driverKind?: ProviderDriverKind;
  jobId?: Id<"jobs">;
  messageId: Id<"messages">;
  model?: string;
};

export type SendUserMessageArgs = {
  body: string;
  chatId: Id<"chats">;
  dispatch?: boolean;
  driverKind?: ProviderDriverKind;
  model?: string;
  options?: ProviderOptionSelection[];
  runtimeId?: Id<"runtimes">;
};

export async function sendUserMessage(
  ctx: MutationCtx,
  user: Doc<"users">,
  args: SendUserMessageArgs
): Promise<SendMessageResult> {
  const chat = await ctx.db.get("chats", args.chatId);
  if (!chat) {
    throw new Error("Chat not found");
  }
  const membership = await getMembership(ctx, chat.orgId, user._id);
  if (!membership) {
    throw new Error("Not a member of this organization");
  }
  await assertChatVisible(ctx, chat, user._id, membership.role);

  const trimmed = args.body.trim();
  if (trimmed.length < 1) {
    throw new Error("Message is required");
  }
  if (trimmed.length > 20_000) {
    throw new Error("Message is too long");
  }
  const explicit = explicitTarget(args);
  const previewMentions = parseMentions(trimmed);
  const dispatch =
    args.dispatch ??
    shouldDispatchAgent({ chatKind: chat.kind, mentions: previewMentions });
  const bound: AgentTarget | undefined =
    explicit ??
    (chat.driverKind
      ? {
          driverKind: chat.driverKind,
          model: chat.model,
          options: chat.options,
        }
      : undefined);
  const wantedKind = preferredProvider(
    previewMentions,
    bound?.driverKind ?? "codex"
  );
  const runtime = dispatch
    ? await pickRuntime(ctx, {
        hint: args.runtimeId,
        orgId: chat.orgId,
        role: membership.role,
        userId: user._id,
        wantedKind,
      })
    : null;
  const body = expandResolvedMentions(trimmed);
  if (body.length > 20_000) {
    throw new Error("Message is too long");
  }
  const mentions = parseMentions(body);
  const messageId = await ctx.db.insert("messages", {
    authorId: user._id,
    authorType: "user",
    body,
    chatId: args.chatId,
    mentions: mentions.map((mention) => mention.raw),
  });

  if (!dispatch) {
    return { dispatched: false, messageId };
  }

  const history = await ctx.db
    .query("messages")
    .withIndex("by_chat", (q) => q.eq("chatId", args.chatId))
    .order("desc")
    .take(30);
  const project = chat.projectId
    ? await ctx.db.get("projects", chat.projectId)
    : null;
  const jobSkills = await loadJobSkills(ctx, chat);
  const context = buildAgentContext({
    chat,
    history: [...history].reverse(),
    mentions,
    project,
    skills: jobSkills.map((skill) => ({
      description: skill.description,
      name: skill.name,
      slug: skill.slug,
    })),
  });
  const target = preferredTarget(
    mentions,
    bound ?? { driverKind: runtime?.installedDriver ?? "codex" }
  );
  const { driverKind, options } = target;
  const model =
    driverKind === "cursor" && target.model
      ? resolveCursorCliModel(
          target.model,
          runtime?.liveSlugs,
          cursorEffortFromOptions(options)
        )
      : target.model;

  if (!runtime) {
    const assistantMessageId = await ctx.db.insert("messages", {
      authorType: "agent",
      body: NO_ONLINE_RUNTIME_BODY,
      chatId: args.chatId,
      driverKind,
      mentions: [],
      model,
      status: "done",
    });
    return {
      assistantMessageId,
      dispatched: true,
      driverKind,
      messageId,
      model,
    };
  }

  const assistantMessageId = await ctx.db.insert("messages", {
    authorType: "agent",
    body: "",
    chatId: args.chatId,
    driverKind,
    mentions: [],
    model,
    runtimeId: runtime.doc._id,
    status: "streaming",
  });
  const jobId = await ctx.db.insert("jobs", {
    assistantMessageId,
    chatId: args.chatId,
    contextJson: JSON.stringify(context),
    driverKind,
    model,
    options,
    orgId: chat.orgId,
    projectId: chat.projectId,
    prompt: body,
    requestedBy: user._id,
    runtimeId: runtime.doc._id,
    status: "queued",
    triggerMessageId: messageId,
  });
  await ctx.db.patch("messages", assistantMessageId, { jobId });
  await ctx.scheduler.runAfter(
    QUEUED_CLAIM_TIMEOUT_MS,
    internal.jobs.failIfUnclaimed,
    { jobId }
  );
  return {
    assistantMessageId,
    dispatched: true,
    driverKind,
    jobId,
    messageId,
    model,
  };
}

function explicitTarget(args: {
  driverKind?: ProviderDriverKind;
  model?: string;
  options?: ProviderOptionSelection[];
}): AgentTarget | undefined {
  if (!args.driverKind) {
    return undefined;
  }
  const trimmed = args.model?.trim();
  if (trimmed && !isValidModelSlug(trimmed)) {
    throw new Error(
      "Model must be 1-80 characters of letters, digits, dots, dashes, underscores or slashes"
    );
  }
  const options = sanitizeOptionSelections(args.options);
  const target: AgentTarget = {
    driverKind: args.driverKind,
    model: resolveModelSlug(args.driverKind, trimmed),
  };
  if (options) {
    target.options = options;
  }
  return target;
}

type RuntimePick = {
  doc: {
    _id: Id<"runtimes">;
    ownerUserId: Id<"users">;
  };
  installedDriver: ProviderDriverKind | undefined;
  liveSlugs?: string[];
} | null;

async function pickRuntime(
  ctx: MutationCtx,
  input: {
    hint?: Id<"runtimes">;
    orgId: Id<"orgs">;
    role: "owner" | "admin" | "member";
    userId: Id<"users">;
    wantedKind: ProviderDriverKind;
  }
): Promise<RuntimePick> {
  const candidates = await ctx.db
    .query("runtimes")
    .withIndex("by_org", (q) => q.eq("orgId", input.orgId))
    .take(50);
  const staleBefore = Date.now() - STALE_RUNTIME_MS;
  const online = candidates.filter(
    (runtime) =>
      runtime.status === "online" &&
      runtime.lastSeenAt !== undefined &&
      runtime.lastSeenAt > staleBefore
  );
  const usable: {
    doc: (typeof online)[number];
    hasWanted: boolean;
    installed: ProviderDriverKind | undefined;
    liveSlugs?: string[];
  }[] = [];
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
    const wanted = available.find(
      (provider) => provider.driverKind === input.wantedKind
    );
    usable.push({
      doc: runtime,
      hasWanted: wanted !== undefined,
      installed: available[0]?.driverKind,
      liveSlugs: wanted?.models?.map((model) => model.slug),
    });
  }
  const hinted = input.hint
    ? usable.find((item) => String(item.doc._id) === String(input.hint))
    : undefined;
  const pick = hinted ?? usable.find((item) => item.hasWanted) ?? usable[0];
  if (!pick) {
    return null;
  }
  return {
    doc: pick.doc,
    installedDriver: pick.hasWanted ? input.wantedKind : pick.installed,
    liveSlugs: pick.liveSlugs,
  };
}
