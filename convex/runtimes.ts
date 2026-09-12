import { v } from "convex/values";
import {
  canUseRuntime,
  getMembership,
  listRuntimeGrants,
  requireRole,
} from "./lib/access";
import { authedMutation, authedQuery } from "./lib/customFunctions";
import { randomToken, sha256Hex, slugify } from "./lib/ids";
import { grantTarget, orgRole, providerKind } from "./lib/validators";

const providerInput = v.object({
  driverKind: providerKind,
  available: v.boolean(),
  version: v.optional(v.string()),
  binaryPath: v.optional(v.string()),
});

const runtimeView = v.object({
  _id: v.id("runtimes"),
  name: v.string(),
  slug: v.string(),
  hostname: v.optional(v.string()),
  cwd: v.optional(v.string()),
  status: v.union(v.literal("online"), v.literal("offline")),
  lastSeenAt: v.optional(v.number()),
  ownerUserId: v.id("users"),
  canUse: v.boolean(),
  providers: v.array(
    v.object({
      driverKind: providerKind,
      available: v.boolean(),
      version: v.optional(v.string()),
      binaryPath: v.optional(v.string()),
    }),
  ),
  grants: v.array(
    v.object({
      _id: v.id("runtimeGrants"),
      targetType: grantTarget,
      targetUserId: v.optional(v.id("users")),
      targetRole: v.optional(orgRole),
    }),
  ),
});

export const register = authedMutation({
  args: {
    orgId: v.id("orgs"),
    name: v.string(),
    hostname: v.optional(v.string()),
    cwd: v.optional(v.string()),
  },
  returns: v.object({ runtimeId: v.id("runtimes"), token: v.string() }),
  handler: async (ctx, args) => {
    const membership = await getMembership(ctx, args.orgId, ctx.user._id);
    if (!membership) throw new Error("Not a member of this organization");
    const name = args.name.trim().slice(0, 60) || "machine";
    const token = `th_${randomToken(24)}`;
    const runtimeId = await ctx.db.insert("runtimes", {
      orgId: args.orgId,
      ownerUserId: ctx.user._id,
      name,
      slug: `${slugify(name)}-${randomToken(4).slice(0, 6)}`,
      hostname: args.hostname?.slice(0, 120),
      cwd: args.cwd?.slice(0, 500),
      status: "offline",
      tokenHash: await sha256Hex(token),
    });
    return { runtimeId, token };
  },
});

export const list = authedQuery({
  args: { orgId: v.id("orgs") },
  returns: v.array(runtimeView),
  handler: async (ctx, args) => {
    const membership = await getMembership(ctx, args.orgId, ctx.user._id);
    if (!membership) throw new Error("Not a member of this organization");
    const runtimes = await ctx.db
      .query("runtimes")
      .withIndex("by_org", (q) => q.eq("orgId", args.orgId))
      .take(50);
    const out = [];
    for (const runtime of runtimes) {
      const providers = await ctx.db
        .query("runtimeProviders")
        .withIndex("by_runtime", (q) => q.eq("runtimeId", runtime._id))
        .take(10);
      const grants = await listRuntimeGrants(ctx, runtime._id);
      out.push({
        _id: runtime._id,
        name: runtime.name,
        slug: runtime.slug,
        hostname: runtime.hostname,
        cwd: runtime.cwd,
        status: runtime.status,
        lastSeenAt: runtime.lastSeenAt,
        ownerUserId: runtime.ownerUserId,
        canUse: canUseRuntime({
          actorUserId: String(ctx.user._id),
          runtimeOwnerUserId: String(runtime.ownerUserId),
          actorRole: membership.role,
          grants: grants.map((grant) => ({
            targetType: grant.targetType,
            targetUserId: grant.targetUserId
              ? String(grant.targetUserId)
              : undefined,
            targetRole: grant.targetRole,
          })),
        }),
        providers: providers.map((provider) => ({
          driverKind: provider.driverKind,
          available: provider.available,
          version: provider.version,
          binaryPath: provider.binaryPath,
        })),
        grants: grants.map((grant) => ({
          _id: grant._id,
          targetType: grant.targetType,
          targetUserId: grant.targetUserId,
          targetRole: grant.targetRole,
        })),
      });
    }
    return out;
  },
});

export const grant = authedMutation({
  args: {
    runtimeId: v.id("runtimes"),
    targetType: grantTarget,
    targetUserId: v.optional(v.id("users")),
    targetRole: v.optional(orgRole),
  },
  returns: v.id("runtimeGrants"),
  handler: async (ctx, args) => {
    const runtime = await ctx.db.get("runtimes", args.runtimeId);
    if (!runtime) throw new Error("Runtime not found");
    const membership = await getMembership(ctx, runtime.orgId, ctx.user._id);
    if (!membership) throw new Error("Not a member of this organization");
    const isOwner = String(runtime.ownerUserId) === String(ctx.user._id);
    if (!isOwner && membership.role !== "owner" && membership.role !== "admin") {
      throw new Error("Only the machine owner or an admin can grant access");
    }
    if (args.targetType === "user" && !args.targetUserId) {
      throw new Error("targetUserId is required");
    }
    if (args.targetType === "role" && !args.targetRole) {
      throw new Error("targetRole is required");
    }
    return await ctx.db.insert("runtimeGrants", {
      runtimeId: args.runtimeId,
      targetType: args.targetType,
      targetUserId: args.targetType === "user" ? args.targetUserId : undefined,
      targetRole: args.targetType === "role" ? args.targetRole : undefined,
      createdBy: ctx.user._id,
    });
  },
});

export const revokeGrant = authedMutation({
  args: { grantId: v.id("runtimeGrants") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const grantRow = await ctx.db.get("runtimeGrants", args.grantId);
    if (!grantRow) throw new Error("Grant not found");
    const runtime = await ctx.db.get("runtimes", grantRow.runtimeId);
    if (!runtime) throw new Error("Runtime not found");
    const membership = await getMembership(ctx, runtime.orgId, ctx.user._id);
    if (!membership) throw new Error("Not a member of this organization");
    const isOwner = String(runtime.ownerUserId) === String(ctx.user._id);
    if (!isOwner && membership.role !== "owner" && membership.role !== "admin") {
      throw new Error("Only the machine owner or an admin can revoke access");
    }
    await ctx.db.delete("runtimeGrants", grantRow._id);
    return null;
  },
});

export const remove = authedMutation({
  args: { runtimeId: v.id("runtimes") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const runtime = await ctx.db.get("runtimes", args.runtimeId);
    if (!runtime) throw new Error("Runtime not found");
    const membership = await getMembership(ctx, runtime.orgId, ctx.user._id);
    if (!membership) throw new Error("Not a member of this organization");
    const isOwner = String(runtime.ownerUserId) === String(ctx.user._id);
    if (!isOwner) {
      await requireRole(ctx, runtime.orgId, ctx.user._id, "owner");
    }
    const grants = await listRuntimeGrants(ctx, runtime._id);
    for (const grantRow of grants) {
      await ctx.db.delete("runtimeGrants", grantRow._id);
    }
    const providers = await ctx.db
      .query("runtimeProviders")
      .withIndex("by_runtime", (q) => q.eq("runtimeId", runtime._id))
      .take(10);
    for (const provider of providers) {
      await ctx.db.delete("runtimeProviders", provider._id);
    }
    await ctx.db.delete("runtimes", runtime._id);
    return null;
  },
});

export const report = authedMutation({
  args: {
    runtimeId: v.id("runtimes"),
    hostname: v.optional(v.string()),
    providers: v.array(providerInput),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const runtime = await ctx.db.get("runtimes", args.runtimeId);
    if (!runtime) throw new Error("Runtime not found");
    if (String(runtime.ownerUserId) !== String(ctx.user._id)) {
      await requireRole(ctx, runtime.orgId, ctx.user._id, "admin");
    }
    await ctx.db.patch("runtimes", runtime._id, {
      status: "online",
      lastSeenAt: Date.now(),
      hostname: args.hostname?.slice(0, 120) ?? runtime.hostname,
    });
    for (const provider of args.providers) {
      const existing = await ctx.db
        .query("runtimeProviders")
        .withIndex("by_runtime_and_kind", (q) =>
          q.eq("runtimeId", runtime._id).eq("driverKind", provider.driverKind),
        )
        .unique();
      if (existing) {
        await ctx.db.patch("runtimeProviders", existing._id, {
          available: provider.available,
          version: provider.version,
          binaryPath: provider.binaryPath,
        });
      } else {
        await ctx.db.insert("runtimeProviders", {
          runtimeId: runtime._id,
          driverKind: provider.driverKind,
          available: provider.available,
          version: provider.version,
          binaryPath: provider.binaryPath,
        });
      }
    }
    return null;
  },
});
