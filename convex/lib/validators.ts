import { v } from "convex/values";

export const orgRole = v.union(
  v.literal("owner"),
  v.literal("admin"),
  v.literal("member"),
);

export const visibility = v.union(v.literal("org"), v.literal("private"));

export const chatKind = v.union(v.literal("dm"), v.literal("project"));

export const chatVisibility = v.union(v.literal("inherit"), v.literal("private"));

export const grantTarget = v.union(v.literal("user"), v.literal("role"));

export const providerKind = v.union(
  v.literal("codex"),
  v.literal("claudeAgent"),
  v.literal("cursor"),
  v.literal("grok"),
  v.literal("opencode"),
  v.literal("antigravity"),
);

export const messageAuthorType = v.union(
  v.literal("user"),
  v.literal("agent"),
  v.literal("system"),
);

export const jobStatus = v.union(
  v.literal("queued"),
  v.literal("running"),
  v.literal("done"),
  v.literal("failed"),
);

export const userSummary = v.object({
  _id: v.id("users"),
  name: v.optional(v.string()),
  email: v.optional(v.string()),
  handle: v.optional(v.string()),
  image: v.optional(v.string()),
});

export const orgSummary = v.object({
  _id: v.id("orgs"),
  name: v.string(),
  slug: v.string(),
  role: orgRole,
});

export const projectSummary = v.object({
  _id: v.id("projects"),
  orgId: v.id("orgs"),
  name: v.string(),
  slug: v.string(),
  visibility: visibility,
  cwd: v.optional(v.string()),
  repoUrl: v.optional(v.string()),
});

export const chatSummary = v.object({
  _id: v.id("chats"),
  orgId: v.id("orgs"),
  projectId: v.optional(v.id("projects")),
  kind: chatKind,
  title: v.string(),
  visibility: chatVisibility,
  ownerId: v.optional(v.id("users")),
});

export const messageDoc = v.object({
  _id: v.id("messages"),
  _creationTime: v.number(),
  chatId: v.id("chats"),
  authorType: messageAuthorType,
  authorId: v.optional(v.id("users")),
  jobId: v.optional(v.id("jobs")),
  runtimeId: v.optional(v.id("runtimes")),
  driverKind: v.optional(providerKind),
  body: v.string(),
  mentions: v.array(v.string()),
  status: v.optional(
    v.union(v.literal("streaming"), v.literal("done"), v.literal("error")),
  ),
  authorName: v.optional(v.string()),
  authorHandle: v.optional(v.string()),
});
