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

export const installMethod = v.union(
  v.literal("npm"),
  v.literal("brew"),
  v.literal("installer"),
  v.literal("unknown"),
);

export const liveModel = v.object({
  slug: v.string(),
  name: v.optional(v.string()),
  default: v.optional(v.boolean()),
  /** From `codex debug models` JSON — used to size the effort picker. */
  defaultReasoningLevel: v.optional(v.string()),
  supportedReasoningLevels: v.optional(v.array(v.string())),
});

/** t3code `ProviderOptionSelection` — `{ id, value }` persisted with the agent binding. */
export const optionSelection = v.object({
  id: v.string(),
  value: v.union(v.string(), v.boolean()),
});

export const maintenanceKind = v.union(
  v.literal("updateCli"),
  v.literal("refreshModels"),
);

export const maintenanceStatus = v.union(
  v.literal("queued"),
  v.literal("running"),
  v.literal("done"),
  v.literal("failed"),
  v.literal("cancelled"),
);

/** What a bridge reports about one provider CLI on its machine (heartbeat + owner report). */
export const runtimeProviderReport = v.object({
  driverKind: providerKind,
  available: v.boolean(),
  version: v.optional(v.string()),
  binaryPath: v.optional(v.string()),
  installMethod: v.optional(installMethod),
  /** Live catalog from the CLI's own `models` command; absent = static catalog applies. */
  models: v.optional(v.array(liveModel)),
  modelsCheckedAt: v.optional(v.number()),
  /** Why live discovery produced nothing (command missing, timeout, unparsable output). */
  modelsError: v.optional(v.string()),
  /** Display form of the update the bridge would run (`agent update`), absent = manual only. */
  updateCommand: v.optional(v.string()),
});

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
  options: v.optional(v.array(optionSelection)),
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
