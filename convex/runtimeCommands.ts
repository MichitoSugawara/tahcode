import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, type MutationCtx, type QueryCtx } from "./_generated/server";
import { canUseRuntime, getMembership, listRuntimeGrants } from "./lib/access";
import { authedMutation, authedQuery } from "./lib/customFunctions";
import { sha256Hex } from "./lib/ids";
import { BRIDGE_CAPABILITY_MAINTENANCE, canRequestMaintenance, supportsLiveModels } from "./lib/providerMaintenance";
import { maintenanceKind, maintenanceStatus, providerKind } from "./lib/validators";

/* ─────────────────────────────────────────────────────────
 * RUNTIME COMMANDS — owner-triggered maintenance on a machine.
 *
 * A command is just `(kind, driverKind)`. The bridge resolves it
 * against `shared/providerMaintenance.ts` on the machine and
 * records the exact argv it ran; the server never ships a
 * command string, so a compromised server cannot make a bridge
 * run something outside the allowlist.
 *
 * Who may ask: `canRequestMaintenance` (machine owner; org
 * Owner/Admin only after the owner opted in; model refresh also
 * for anyone already allowed to run jobs there).
 * ───────────────────────────────────────────────────────── */

const LOG_CAP = 20000;
const HISTORY = 30;

const commandView = v.object({
  _id: v.id("runtimeCommands"),
  _creationTime: v.number(),
  runtimeId: v.id("runtimes"),
  kind: maintenanceKind,
  driverKind: providerKind,
  status: maintenanceStatus,
  requestedBy: v.id("users"),
  command: v.optional(v.string()),
  /** Tail of the bridge's output; empty for members who may not maintain the machine. */
  log: v.string(),
  error: v.optional(v.string()),
  versionBefore: v.optional(v.string()),
  versionAfter: v.optional(v.string()),
  claimedAt: v.optional(v.number()),
  completedAt: v.optional(v.number()),
});

const claimedView = v.union(
  v.object({
    _id: v.id("runtimeCommands"),
    kind: maintenanceKind,
    driverKind: providerKind,
  }),
  v.null(),
);

async function getRuntimeByToken(ctx: MutationCtx, runtimeId: Id<"runtimes">, token: string) {
  const runtime = await ctx.db.get("runtimes", runtimeId);
  if (!runtime) throw new Error("Runtime not found");
  if ((await sha256Hex(token)) !== runtime.tokenHash) throw new Error("Invalid runtime token");
  return runtime;
}

async function actorFor(ctx: QueryCtx | MutationCtx, runtime: Doc<"runtimes">, userId: Id<"users">) {
  const membership = await getMembership(ctx, runtime.orgId, userId);
  if (!membership) throw new Error("Not a member of this organization");
  const grants = await listRuntimeGrants(ctx, runtime._id);
  return {
    actorUserId: String(userId),
    actorRole: membership.role,
    runtimeOwnerUserId: String(runtime.ownerUserId),
    maintenanceByAdmins: runtime.maintenanceByAdmins ?? false,
    canUseRuntime: canUseRuntime({
      actorUserId: String(userId),
      runtimeOwnerUserId: String(runtime.ownerUserId),
      actorRole: membership.role,
      grants: grants.map((grant) => ({
        targetType: grant.targetType,
        targetUserId: grant.targetUserId ? String(grant.targetUserId) : undefined,
        targetRole: grant.targetRole,
      })),
    }),
  };
}

async function getCommandForBridge(ctx: MutationCtx, runtimeId: Id<"runtimes">, token: string, commandId: Id<"runtimeCommands">) {
  await getRuntimeByToken(ctx, runtimeId, token);
  const command = await ctx.db.get("runtimeCommands", commandId);
  if (!command) throw new Error("Command not found");
  if (String(command.runtimeId) !== String(runtimeId)) throw new Error("Command belongs to another runtime");
  return command;
}

export const request = authedMutation({
  args: {
    runtimeId: v.id("runtimes"),
    kind: maintenanceKind,
    driverKind: providerKind,
  },
  returns: v.id("runtimeCommands"),
  handler: async (ctx, args) => {
    const runtime = await ctx.db.get("runtimes", args.runtimeId);
    if (!runtime) throw new Error("Runtime not found");
    const actor = await actorFor(ctx, runtime, ctx.user._id);
    if (!canRequestMaintenance(args.kind, actor)) {
      throw new Error(
        args.kind === "updateCli"
          ? "Only the machine owner can update CLIs on this machine (owner may allow admins in the machine's provider settings)"
          : "You need permission to use this machine to refresh its models",
      );
    }
    if (args.driverKind === "antigravity") {
      throw new Error("Antigravity has no CLI on the machine; nothing to update");
    }
    if (args.kind === "refreshModels" && !supportsLiveModels(args.driverKind)) {
      throw new Error("This provider's CLI has no models command; the static catalog applies");
    }
    if (!(runtime.capabilities ?? []).includes(BRIDGE_CAPABILITY_MAINTENANCE)) {
      throw new Error("The tahcode bridge on this machine is too old for remote maintenance — run `npm i -g tahcode@latest` and `tahcode restart` there");
    }
    const pending = await ctx.db
      .query("runtimeCommands")
      .withIndex("by_runtime_and_status", (q) => q.eq("runtimeId", runtime._id).eq("status", "queued"))
      .take(50);
    const running = await ctx.db
      .query("runtimeCommands")
      .withIndex("by_runtime_and_status", (q) => q.eq("runtimeId", runtime._id).eq("status", "running"))
      .take(50);
    if ([...pending, ...running].some((command) => command.driverKind === args.driverKind)) {
      throw new Error("A command for this provider is already queued or running on this machine");
    }
    return await ctx.db.insert("runtimeCommands", {
      runtimeId: runtime._id,
      orgId: runtime.orgId,
      kind: args.kind,
      driverKind: args.driverKind,
      status: "queued",
      requestedBy: ctx.user._id,
      log: "",
    });
  },
});

export const cancel = authedMutation({
  args: { commandId: v.id("runtimeCommands") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const command = await ctx.db.get("runtimeCommands", args.commandId);
    if (!command) throw new Error("Command not found");
    const runtime = await ctx.db.get("runtimes", command.runtimeId);
    if (!runtime) throw new Error("Runtime not found");
    const isRequester = String(command.requestedBy) === String(ctx.user._id);
    const isOwner = String(runtime.ownerUserId) === String(ctx.user._id);
    if (!isRequester && !isOwner) throw new Error("Only the requester or the machine owner can cancel");
    if (command.status !== "queued") throw new Error("Only queued commands can be cancelled");
    await ctx.db.patch("runtimeCommands", command._id, { status: "cancelled", completedAt: Date.now() });
    return null;
  },
});

export const list = authedQuery({
  args: { runtimeId: v.id("runtimes") },
  returns: v.array(commandView),
  handler: async (ctx, args) => {
    const runtime = await ctx.db.get("runtimes", args.runtimeId);
    if (!runtime) return [];
    const actor = await actorFor(ctx, runtime, ctx.user._id);
    // Logs can contain local paths; only people who may maintain the machine see them.
    const seesLogs = canRequestMaintenance("updateCli", actor);
    const commands = await ctx.db
      .query("runtimeCommands")
      .withIndex("by_runtime", (q) => q.eq("runtimeId", runtime._id))
      .order("desc")
      .take(HISTORY);
    return commands.map((command) => ({
      _id: command._id,
      _creationTime: command._creationTime,
      runtimeId: command.runtimeId,
      kind: command.kind,
      driverKind: command.driverKind,
      status: command.status,
      requestedBy: command.requestedBy,
      command: command.command,
      log: seesLogs ? command.log : "",
      error: command.error,
      versionBefore: command.versionBefore,
      versionAfter: command.versionAfter,
      claimedAt: command.claimedAt,
      completedAt: command.completedAt,
    }));
  },
});

/* ── bridge side (runtime token) ─────────────────────────── */

export const claimNext = mutation({
  args: { runtimeId: v.id("runtimes"), token: v.string() },
  returns: claimedView,
  handler: async (ctx, args) => {
    await getRuntimeByToken(ctx, args.runtimeId, args.token);
    const queued = await ctx.db
      .query("runtimeCommands")
      .withIndex("by_runtime_and_status", (q) => q.eq("runtimeId", args.runtimeId).eq("status", "queued"))
      .order("asc")
      .take(1);
    const command = queued[0];
    if (!command) return null;
    await ctx.db.patch("runtimeCommands", command._id, { status: "running", claimedAt: Date.now() });
    return { _id: command._id, kind: command.kind, driverKind: command.driverKind };
  },
});

export const appendLog = mutation({
  args: {
    runtimeId: v.id("runtimes"),
    token: v.string(),
    commandId: v.id("runtimeCommands"),
    text: v.string(),
    /** Set once, when the bridge has resolved the argv it is about to run. */
    command: v.optional(v.string()),
    versionBefore: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const command = await getCommandForBridge(ctx, args.runtimeId, args.token, args.commandId);
    if (command.status !== "running") return null;
    await ctx.db.patch("runtimeCommands", command._id, {
      log: `${command.log}${args.text}`.slice(-LOG_CAP),
      ...(args.command !== undefined ? { command: args.command.slice(0, 300) } : {}),
      ...(args.versionBefore !== undefined ? { versionBefore: args.versionBefore.slice(0, 80) } : {}),
    });
    return null;
  },
});

export const complete = mutation({
  args: {
    runtimeId: v.id("runtimes"),
    token: v.string(),
    commandId: v.id("runtimeCommands"),
    error: v.optional(v.string()),
    versionAfter: v.optional(v.string()),
    text: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const command = await getCommandForBridge(ctx, args.runtimeId, args.token, args.commandId);
    if (command.status !== "running") return null;
    const failed = args.error !== undefined && args.error.length > 0;
    await ctx.db.patch("runtimeCommands", command._id, {
      status: failed ? "failed" : "done",
      error: failed ? args.error?.slice(0, 2000) : undefined,
      versionAfter: args.versionAfter?.slice(0, 80),
      log: `${command.log}${args.text ?? ""}`.slice(-LOG_CAP),
      completedAt: Date.now(),
    });
    return null;
  },
});
