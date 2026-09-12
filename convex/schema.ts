import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import {
  chatKind,
  chatVisibility,
  grantTarget,
  jobStatus,
  messageAuthorType,
  orgRole,
  providerKind,
  visibility,
} from "./lib/validators";

export default defineSchema({
  ...authTables,

  users: defineTable({
    name: v.optional(v.string()),
    image: v.optional(v.string()),
    email: v.optional(v.string()),
    emailVerificationTime: v.optional(v.number()),
    phone: v.optional(v.string()),
    phoneVerificationTime: v.optional(v.number()),
    isAnonymous: v.optional(v.boolean()),
    handle: v.optional(v.string()),
  })
    .index("email", ["email"])
    .index("phone", ["phone"])
    .index("by_handle", ["handle"]),

  orgs: defineTable({
    name: v.string(),
    slug: v.string(),
    createdBy: v.id("users"),
  }).index("by_slug", ["slug"]),

  orgMembers: defineTable({
    orgId: v.id("orgs"),
    userId: v.id("users"),
    role: orgRole,
  })
    .index("by_org", ["orgId"])
    .index("by_user", ["userId"])
    .index("by_org_and_user", ["orgId", "userId"]),

  invites: defineTable({
    orgId: v.id("orgs"),
    email: v.optional(v.string()),
    role: orgRole,
    token: v.string(),
    createdBy: v.id("users"),
    expiresAt: v.number(),
    acceptedBy: v.optional(v.id("users")),
  })
    .index("by_token", ["token"])
    .index("by_org", ["orgId"]),

  projects: defineTable({
    orgId: v.id("orgs"),
    name: v.string(),
    slug: v.string(),
    visibility: visibility,
    cwd: v.optional(v.string()),
    repoUrl: v.optional(v.string()),
    createdBy: v.id("users"),
  })
    .index("by_org", ["orgId"])
    .index("by_org_and_slug", ["orgId", "slug"]),

  projectMembers: defineTable({
    projectId: v.id("projects"),
    userId: v.id("users"),
  })
    .index("by_project", ["projectId"])
    .index("by_user", ["userId"])
    .index("by_project_and_user", ["projectId", "userId"]),

  chats: defineTable({
    orgId: v.id("orgs"),
    projectId: v.optional(v.id("projects")),
    kind: chatKind,
    title: v.string(),
    visibility: chatVisibility,
    ownerId: v.optional(v.id("users")),
    createdBy: v.id("users"),
  })
    .index("by_org", ["orgId"])
    .index("by_project", ["projectId"])
    .index("by_org_and_owner_kind", ["orgId", "ownerId", "kind"]),

  chatMembers: defineTable({
    chatId: v.id("chats"),
    userId: v.id("users"),
  })
    .index("by_chat", ["chatId"])
    .index("by_user", ["userId"])
    .index("by_chat_and_user", ["chatId", "userId"]),

  messages: defineTable({
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
  }).index("by_chat", ["chatId"]),

  files: defineTable({
    orgId: v.id("orgs"),
    chatId: v.optional(v.id("chats")),
    messageId: v.optional(v.id("messages")),
    key: v.string(),
    name: v.string(),
    contentType: v.string(),
    size: v.number(),
    uploadedBy: v.id("users"),
  })
    .index("by_org", ["orgId"])
    .index("by_key", ["key"])
    .index("by_chat", ["chatId"]),

  runtimes: defineTable({
    orgId: v.id("orgs"),
    ownerUserId: v.id("users"),
    name: v.string(),
    slug: v.string(),
    hostname: v.optional(v.string()),
    cwd: v.optional(v.string()),
    status: v.union(v.literal("online"), v.literal("offline")),
    lastSeenAt: v.optional(v.number()),
    tokenHash: v.string(),
  })
    .index("by_org", ["orgId"])
    .index("by_owner", ["ownerUserId"])
    .index("by_token_hash", ["tokenHash"])
    .index("by_org_and_slug", ["orgId", "slug"]),

  runtimeProviders: defineTable({
    runtimeId: v.id("runtimes"),
    driverKind: providerKind,
    available: v.boolean(),
    version: v.optional(v.string()),
    binaryPath: v.optional(v.string()),
  })
    .index("by_runtime", ["runtimeId"])
    .index("by_runtime_and_kind", ["runtimeId", "driverKind"]),

  runtimeGrants: defineTable({
    runtimeId: v.id("runtimes"),
    targetType: grantTarget,
    targetUserId: v.optional(v.id("users")),
    targetRole: v.optional(orgRole),
    createdBy: v.id("users"),
  })
    .index("by_runtime", ["runtimeId"])
    .index("by_runtime_and_user", ["runtimeId", "targetUserId"]),

  jobs: defineTable({
    orgId: v.id("orgs"),
    projectId: v.optional(v.id("projects")),
    chatId: v.id("chats"),
    triggerMessageId: v.id("messages"),
    assistantMessageId: v.id("messages"),
    runtimeId: v.id("runtimes"),
    driverKind: providerKind,
    status: jobStatus,
    prompt: v.string(),
    contextJson: v.string(),
    error: v.optional(v.string()),
    claimedAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
  })
    .index("by_runtime_and_status", ["runtimeId", "status"])
    .index("by_chat", ["chatId"])
    .index("by_status", ["status"]),

  jobEvents: defineTable({
    jobId: v.id("jobs"),
    type: v.union(
      v.literal("thinking"),
      v.literal("tool"),
      v.literal("text"),
      v.literal("error"),
      v.literal("done"),
    ),
    text: v.string(),
  }).index("by_job", ["jobId"]),
});
