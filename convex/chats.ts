import { v } from "convex/values";
import { assertChatVisible, getMembership, requireRole } from "./lib/access";
import { authedMutation, authedQuery } from "./lib/customFunctions";
import { chatKind, chatSummary, chatVisibility, userSummary } from "./lib/validators";

export const ensureDm = authedMutation({
  args: { orgId: v.id("orgs") },
  returns: v.id("chats"),
  handler: async (ctx, args) => {
    const membership = await getMembership(ctx, args.orgId, ctx.user._id);
    if (!membership) throw new Error("Not a member of this organization");
    const existing = await ctx.db
      .query("chats")
      .withIndex("by_org_and_owner_kind", (q) =>
        q.eq("orgId", args.orgId).eq("ownerId", ctx.user._id).eq("kind", "dm"),
      )
      .unique();
    if (existing) return existing._id;
    return await ctx.db.insert("chats", {
      orgId: args.orgId,
      kind: "dm",
      title: "Personal DM",
      visibility: "inherit",
      ownerId: ctx.user._id,
      createdBy: ctx.user._id,
    });
  },
});

export const createProjectChat = authedMutation({
  args: {
    projectId: v.id("projects"),
    title: v.string(),
    visibility: chatVisibility,
    memberIds: v.optional(v.array(v.id("users"))),
  },
  returns: v.id("chats"),
  handler: async (ctx, args) => {
    const project = await ctx.db.get("projects", args.projectId);
    if (!project) throw new Error("Project not found");
    const membership = await getMembership(ctx, project.orgId, ctx.user._id);
    if (!membership) throw new Error("Not a member of this organization");
    const title = args.title.trim().slice(0, 80) || "Untitled chat";
    const chatId = await ctx.db.insert("chats", {
      orgId: project.orgId,
      projectId: args.projectId,
      kind: "project",
      title,
      visibility: args.visibility,
      createdBy: ctx.user._id,
    });
    const members = new Set<string>([String(ctx.user._id)]);
    for (const memberId of args.memberIds ?? []) {
      members.add(String(memberId));
    }
    for (const memberId of members) {
      const user = await ctx.db.get("users", memberId as never);
      if (!user) continue;
      await ctx.db.insert("chatMembers", { chatId, userId: user._id });
    }
    return chatId;
  },
});

export const list = authedQuery({
  args: {
    orgId: v.id("orgs"),
    projectId: v.optional(v.id("projects")),
    kind: v.optional(chatKind),
  },
  returns: v.array(chatSummary),
  handler: async (ctx, args) => {
    const membership = await getMembership(ctx, args.orgId, ctx.user._id);
    if (!membership) throw new Error("Not a member of this organization");
    const chats = await ctx.db
      .query("chats")
      .withIndex("by_org", (q) => q.eq("orgId", args.orgId))
      .take(200);
    const visible = [];
    for (const chat of chats) {
      if (args.projectId && String(chat.projectId) !== String(args.projectId)) {
        continue;
      }
      if (args.kind && chat.kind !== args.kind) continue;
      try {
        await assertChatVisible(ctx, chat, ctx.user._id, membership.role);
        visible.push(chat);
      } catch {
        continue;
      }
    }
    return visible.map((chat) => ({
      _id: chat._id,
      orgId: chat.orgId,
      projectId: chat.projectId,
      kind: chat.kind,
      title: chat.title,
      visibility: chat.visibility,
      ownerId: chat.ownerId,
    }));
  },
});

export const get = authedQuery({
  args: { chatId: v.id("chats") },
  returns: v.union(chatSummary, v.null()),
  handler: async (ctx, args) => {
    const chat = await ctx.db.get("chats", args.chatId);
    if (!chat) return null;
    const membership = await getMembership(ctx, chat.orgId, ctx.user._id);
    if (!membership) return null;
    try {
      await assertChatVisible(ctx, chat, ctx.user._id, membership.role);
    } catch {
      return null;
    }
    return {
      _id: chat._id,
      orgId: chat.orgId,
      projectId: chat.projectId,
      kind: chat.kind,
      title: chat.title,
      visibility: chat.visibility,
      ownerId: chat.ownerId,
    };
  },
});

export const members = authedQuery({
  args: { chatId: v.id("chats") },
  returns: v.array(userSummary),
  handler: async (ctx, args) => {
    const chat = await ctx.db.get("chats", args.chatId);
    if (!chat) throw new Error("Chat not found");
    const membership = await getMembership(ctx, chat.orgId, ctx.user._id);
    if (!membership) throw new Error("Not a member of this organization");
    await assertChatVisible(ctx, chat, ctx.user._id, membership.role);
    const rows = await ctx.db
      .query("chatMembers")
      .withIndex("by_chat", (q) => q.eq("chatId", args.chatId))
      .take(200);
    const users = [];
    for (const row of rows) {
      const user = await ctx.db.get("users", row.userId);
      if (!user) continue;
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
});

export const addMember = authedMutation({
  args: {
    chatId: v.id("chats"),
    userId: v.id("users"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const chat = await ctx.db.get("chats", args.chatId);
    if (!chat) throw new Error("Chat not found");
    if (chat.kind === "dm") throw new Error("DMs stay owner-only in Phase 1");
    await requireRole(ctx, chat.orgId, ctx.user._id, "admin");
    const existing = await ctx.db
      .query("chatMembers")
      .withIndex("by_chat_and_user", (q) =>
        q.eq("chatId", args.chatId).eq("userId", args.userId),
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
});
