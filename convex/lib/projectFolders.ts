import {
  MAX_PROJECT_FOLDER_LEN,
  MISSING_PROJECT_FOLDER_MESSAGE,
  needsProjectFolderMapping,
  normalizeProjectFolderPath,
  resolveProjectCwd,
} from "../../shared/composerContext.ts";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

export { MISSING_PROJECT_FOLDER_MESSAGE };

export type ProjectFolderRow = {
  cwd: string;
  runtimeId: Id<"runtimes">;
};

export async function listFoldersForOrg(
  ctx: QueryCtx | MutationCtx,
  orgId: Id<"orgs">
): Promise<Doc<"projectRuntimeFolders">[]> {
  return await ctx.db
    .query("projectRuntimeFolders")
    .withIndex("by_org", (q) => q.eq("orgId", orgId))
    .take(200);
}

export async function listFoldersForProject(
  ctx: QueryCtx | MutationCtx,
  projectId: Id<"projects">
): Promise<ProjectFolderRow[]> {
  const rows = await ctx.db
    .query("projectRuntimeFolders")
    .withIndex("by_project", (q) => q.eq("projectId", projectId))
    .take(50);
  return rows.map((row) => ({ cwd: row.cwd, runtimeId: row.runtimeId }));
}

export function foldersByProject(
  rows: Doc<"projectRuntimeFolders">[]
): Map<string, ProjectFolderRow[]> {
  const grouped = new Map<string, ProjectFolderRow[]>();
  for (const row of rows) {
    const key = String(row.projectId);
    const current = grouped.get(key) ?? [];
    current.push({ cwd: row.cwd, runtimeId: row.runtimeId });
    grouped.set(key, current);
  }
  return grouped;
}

export async function upsertProjectRuntimeFolder(
  ctx: MutationCtx,
  input: {
    cwd: string;
    mappedBy: Id<"users">;
    orgId: Id<"orgs">;
    projectId: Id<"projects">;
    runtimeId: Id<"runtimes">;
  }
): Promise<string> {
  const cwd = normalizeProjectFolderPath(input.cwd);
  if (!cwd) {
    throw new Error("Folder path is required");
  }
  if (cwd.length > MAX_PROJECT_FOLDER_LEN) {
    throw new Error("Folder path is too long");
  }
  const existing = await ctx.db
    .query("projectRuntimeFolders")
    .withIndex("by_project_and_runtime", (q) =>
      q.eq("projectId", input.projectId).eq("runtimeId", input.runtimeId)
    )
    .unique();
  if (existing) {
    await ctx.db.patch("projectRuntimeFolders", existing._id, {
      cwd,
      mappedBy: input.mappedBy,
    });
  } else {
    await ctx.db.insert("projectRuntimeFolders", {
      cwd,
      mappedBy: input.mappedBy,
      orgId: input.orgId,
      projectId: input.projectId,
      runtimeId: input.runtimeId,
    });
  }
  return cwd;
}

export async function assertRuntimeInOrg(
  ctx: QueryCtx | MutationCtx,
  runtimeId: Id<"runtimes">,
  orgId: Id<"orgs">
): Promise<Doc<"runtimes">> {
  const runtime = await ctx.db.get("runtimes", runtimeId);
  if (!runtime || runtime.orgId !== orgId) {
    throw new Error("Runtime not found in this organization");
  }
  return runtime;
}

export function resolvedProjectCwd(input: {
  folders: ProjectFolderRow[];
  projectCwd?: string;
  runtimeId?: Id<"runtimes"> | null;
}): string | undefined {
  return resolveProjectCwd({
    folders: input.folders.map((folder) => ({
      cwd: folder.cwd,
      runtimeId: String(folder.runtimeId),
    })),
    projectCwd: input.projectCwd,
    runtimeId: input.runtimeId ? String(input.runtimeId) : null,
  });
}

export function missingFolderForRuntime(input: {
  folders: ProjectFolderRow[];
  hasProject: boolean;
  projectCwd?: string;
  runtimeId?: Id<"runtimes"> | null;
}): boolean {
  return needsProjectFolderMapping({
    folders: input.folders.map((folder) => ({
      cwd: folder.cwd,
      runtimeId: String(folder.runtimeId),
    })),
    hasProject: input.hasProject,
    projectCwd: input.projectCwd,
    runtimeId: input.runtimeId ? String(input.runtimeId) : null,
  });
}
