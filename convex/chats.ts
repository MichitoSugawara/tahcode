import { v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import {
  assertChatVisible,
  assertProjectVisible,
  getMembership,
  requireRole,
} from "./lib/access";
import { authedMutation, authedQuery } from "./lib/customFunctions";
import type { ProviderOptionSelection } from "./lib/modelOptions";
import { sanitizeOptionSelections } from "./lib/modelOptions";
import type { ProviderDriverKind } from "./lib/providers";
import { isValidModelSlug, resolveModelSlug } from "./lib/providers";
import { requireOrgProfile } from "./lib/skills";
import {
  chatKind,
  chatSummary,
  chatVisibility,
  optionSelection,
  providerKind,
  userSummary,
} from "./lib/validators";

/**
 * A chat's default agent: `driverKind` picks the provider, `model` the model
 * slug passed to that CLI. No model means the CLI's own default — the same
 * thing a bare `@provider` mention meant before models could be named.
 */
function normalizeAgentBinding(input: {
  driverKind?: ProviderDriverKind;
  model?: string;
  options?: ProviderOptionSelection[];
}) {
  if (!input.driverKind) {
    return { driverKind: undefined, model: undefined, options: undefined };
  }
  const trimmed = input.model?.trim();
  if (trimmed && !isValidModelSlug(trimmed)) {
    throw new Error(
      "Model must be 1-80 characters of letters, digits, dots, dashes, underscores or slashes"
    );
  }
  return {
    driverKind: input.driverKind,
    model: resolveModelSlug(input.driverKind, trimmed),
    options: sanitizeOptionSelections(input.options),
  };
}

export function summarizeChat(chat: Doc<"chats">) {
  return {
    _id: chat._id,
    driverKind: chat.driverKind,
    kind: chat.kind,
    model: chat.model,
    orgId: chat.orgId,
    ownerId: chat.ownerId,
    profileId: chat.profileId,
    projectId: chat.projectId,
    options: chat.options,
    title: chat.title,
    visibility: chat.visibility,
  };
}

export async function ensureDmForUser(
  ctx: MutationCtx,
  user: Doc<"users">,
  orgId: Id<"orgs">
): Promise<Id<"chats">> {
  const membership = await getMembership(ctx, orgId, user._id);
  if (!membership) {
    throw new Error("Not a member of this organization");
  }
  const existing = await ctx.db
    .query("chats")
    .withIndex("by_org_and_owner_kind", (q) =>
      q.eq("orgId", orgId).eq("ownerId", user._id).eq("kind", "dm")
    )
    .unique();
  if (existing) {
    return existing._id;
  }
  return await ctx.db.insert("chats", {
    createdBy: user._id,
    kind: "dm",
    orgId,
    ownerId: user._id,
    title: "Personal DM",
    visibility: "inherit",
  });
}

export const ensureDm = authedMutation({
  args: { orgId: v.id("orgs") },
  handler: async (ctx, args) =>
    await ensureDmForUser(ctx, ctx.user, args.orgId),
  returns: v.id("chats"),
});

export async function createProjectChatForUser(
  ctx: MutationCtx,
  user: Doc<"users">,
  args: {
    driverKind?: ProviderDriverKind;
    memberIds?: Id<"users">[];
    model?: string;
    options?: ProviderOptionSelection[];
    profileId?: Id<"skillProfiles">;
    projectId: Id<"projects">;
    title: string;
    visibility: "inherit" | "private";
  }
): Promise<Id<"chats">> {
  const project = await ctx.db.get("projects", args.projectId);
  if (!project) {
    throw new Error("Project not found");
  }
  const membership = await getMembership(ctx, project.orgId, user._id);
  if (!membership) {
    throw new Error("Not a member of this organization");
  }
  await assertProjectVisible(ctx, project, user._id, membership.role);
  const requested = args.memberIds ?? [];
  if (requested.length > 50) {
    throw new Error("Too many chat members");
  }
  const members = new Set<Id<"users">>([user._id, ...requested]);
  for (const memberId of members) {
    const target = await getMembership(ctx, project.orgId, memberId);
    if (!target) {
      throw new Error("All chat members must belong to this organization");
    }
  }
  const title = args.title.trim().slice(0, 80) || "Untitled chat";
  const agent = normalizeAgentBinding(args);
  const requestedProfile = args.profileId ?? project.profileId;
  if (requestedProfile) {
    await requireOrgProfile(ctx, project.orgId, requestedProfile);
  }
  const chatId = await ctx.db.insert("chats", {
    createdBy: user._id,
    driverKind: agent.driverKind,
    kind: "project",
    model: agent.model,
    options: agent.options,
    orgId: project.orgId,
    profileId: requestedProfile,
    projectId: args.projectId,
    title,
    visibility: args.visibility,
  });
  for (const memberId of members) {
    await ctx.db.insert("chatMembers", { chatId, userId: memberId });
  }
  return chatId;
}

export const createProjectChat = authedMutation({
  args: {
    driverKind: v.optional(providerKind),
    memberIds: v.optional(v.array(v.id("users"))),
    model: v.optional(v.string()),
    profileId: v.optional(v.id("skillProfiles")),
    projectId: v.id("projects"),
    options: v.optional(v.array(optionSelection)),
    title: v.string(),
    visibility: chatVisibility,
  },
  handler: async (ctx, args) =>
    await createProjectChatForUser(ctx, ctx.user, args),
  returns: v.id("chats"),
});

export const list = authedQuery({
  args: {
    kind: v.optional(chatKind),
    orgId: v.id("orgs"),
    projectId: v.optional(v.id("projects")),
  },
  handler: async (ctx, args) => {
    const membership = await getMembership(ctx, args.orgId, ctx.user._id);
    if (!membership) {
      throw new Error("Not a member of this organization");
    }
    const chats = await ctx.db
      .query("chats")
      .withIndex("by_org", (q) => q.eq("orgId", args.orgId))
      .take(200);
    const visible = [];
    for (const chat of chats) {
      if (args.projectId && String(chat.projectId) !== String(args.projectId)) {
        continue;
      }
      if (args.kind && chat.kind !== args.kind) {
        continue;
      }
      try {
        await assertChatVisible(ctx, chat, ctx.user._id, membership.role);
        visible.push(chat);
      } catch {
        continue;
      }
    }
    return visible.map(summarizeChat);
  },
  returns: v.array(chatSummary),
});

export const get = authedQuery({
  args: { chatId: v.id("chats") },
  handler: async (ctx, args) => {
    const chat = await ctx.db.get("chats", args.chatId);
    if (!chat) {
      return null;
    }
    const membership = await getMembership(ctx, chat.orgId, ctx.user._id);
    if (!membership) {
      return null;
    }
    try {
      await assertChatVisible(ctx, chat, ctx.user._id, membership.role);
    } catch {
      return null;
    }
    return summarizeChat(chat);
  },
  returns: v.union(chatSummary, v.null()),
});

/**
 * Bind a chat to a provider (+ optional model). Anyone who can see the chat
 * can change it; the composer calls this from its provider / model pickers so
 * the choice sticks for the chat instead of living in one browser.
 */
export const setAgent = authedMutation({
  args: {
    chatId: v.id("chats"),
    driverKind: providerKind,
    model: v.optional(v.string()),
    options: v.optional(v.array(optionSelection)),
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
    const agent = normalizeAgentBinding(args);
    await ctx.db.patch("chats", args.chatId, {
      driverKind: agent.driverKind,
      model: agent.model,
      options: agent.options,
    });
    return null;
  },
  returns: v.null(),
});

export const setProfile = authedMutation({
  args: {
    chatId: v.id("chats"),
    profileId: v.union(v.id("skillProfiles"), v.null()),
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
    if (args.profileId) {
      await requireOrgProfile(ctx, chat.orgId, args.profileId);
    }
    await ctx.db.patch("chats", args.chatId, {
      profileId: args.profileId ?? undefined,
    });
    return null;
  },
  returns: v.null(),
});

export const members = authedQuery({
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
      .query("chatMembers")
      .withIndex("by_chat", (q) => q.eq("chatId", args.chatId))
      .take(200);
    const users = [];
    for (const row of rows) {
      const user = await ctx.db.get("users", row.userId);
      if (!user) {
        continue;
      }
      users.push({
        _id: user._id,
        name: user.name,
        email: user.email,
        handle: user.handle,
        image: user.image,
      });
    }
    return users;
  },
  returns: v.array(userSummary),
});

export const addMember = authedMutation({
  args: {
    chatId: v.id("chats"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const chat = await ctx.db.get("chats", args.chatId);
    if (!chat) {
      throw new Error("Chat not found");
    }
    if (chat.kind === "dm") {
      throw new Error("DMs stay owner-only in Phase 1");
    }
    await requireRole(ctx, chat.orgId, ctx.user._id, "admin");
    const targetMembership = await getMembership(ctx, chat.orgId, args.userId);
    if (!targetMembership) {
      throw new Error("Target is not in this organization");
    }
    const existing = await ctx.db
      .query("chatMembers")
      .withIndex("by_chat_and_user", (q) =>
        q.eq("chatId", args.chatId).eq("userId", args.userId)
      )
      .unique();
    if (!existing) {
      await ctx.db.insert("chatMembers", {
        chatId: args.chatId,
        userId: args.userId,
      });
    }
    return null;
  },
  returns: v.null(),
});
