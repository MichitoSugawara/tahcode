import { v } from "convex/values";

export const orgRole = v.union(
  v.literal("owner"),
  v.literal("admin"),
  v.literal("member")
);

export const visibility = v.union(v.literal("org"), v.literal("private"));

export const chatKind = v.union(v.literal("dm"), v.literal("project"));

export const chatVisibility = v.union(
  v.literal("inherit"),
  v.literal("private")
);

export const grantTarget = v.union(v.literal("user"), v.literal("role"));

export const providerKind = v.union(
  v.literal("codex"),
  v.literal("claudeAgent"),
  v.literal("cursor"),
  v.literal("grok"),
  v.literal("opencode"),
  v.literal("antigravity")
);

export const messageAuthorType = v.union(
  v.literal("user"),
  v.literal("agent"),
  v.literal("system")
);

export const jobStatus = v.union(
  v.literal("queued"),
  v.literal("running"),
  v.literal("done"),
  v.literal("failed")
);

export const userSummary = v.object({
  _id: v.id("users"),
  email: v.optional(v.string()),
  handle: v.optional(v.string()),
  image: v.optional(v.string()),
  name: v.optional(v.string()),
});

export const orgSummary = v.object({
  _id: v.id("orgs"),
  name: v.string(),
  role: orgRole,
  slug: v.string(),
});

export const projectSummary = v.object({
  _id: v.id("projects"),
  cwd: v.optional(v.string()),
  name: v.string(),
  orgId: v.id("orgs"),
  repoUrl: v.optional(v.string()),
  slug: v.string(),
  visibility,
});

export const chatSummary = v.object({
  _id: v.id("chats"),
  driverKind: v.optional(providerKind),
  kind: chatKind,
  model: v.optional(v.string()),
  orgId: v.id("orgs"),
  ownerId: v.optional(v.id("users")),
  projectId: v.optional(v.id("projects")),
  title: v.string(),
  visibility: chatVisibility,
});

export const messageDoc = v.object({
  _creationTime: v.number(),
  _id: v.id("messages"),
  authorHandle: v.optional(v.string()),
  authorId: v.optional(v.id("users")),
  authorName: v.optional(v.string()),
  authorType: messageAuthorType,
  body: v.string(),
  chatId: v.id("chats"),
  driverKind: v.optional(providerKind),
  jobId: v.optional(v.id("jobs")),
  mentions: v.array(v.string()),
  model: v.optional(v.string()),
  runtimeId: v.optional(v.id("runtimes")),
  status: v.optional(
    v.union(v.literal("streaming"), v.literal("done"), v.literal("error"))
  ),
});
