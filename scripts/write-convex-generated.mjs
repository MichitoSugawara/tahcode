#!/usr/bin/env node
/**
 * Offline Convex codegen for CI / `npm run typecheck` / `npm test`.
 * Writes the same JS + DTS split that `npx convex dev` produces, from the
 * local `convex/` tree, without a deploy key.
 */
import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

const root = join(import.meta.dirname, "..");
const convexDir = join(root, "convex");
const outDir = join(convexDir, "_generated");

const SKIP_FILES = new Set(["schema.ts", "auth.config.ts"]);

function walk(dir, acc = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "_generated" || entry.name === "node_modules") {
        continue;
      }
      walk(path, acc);
      continue;
    }
    if (
      entry.name.endsWith(".ts") &&
      !entry.name.endsWith(".test.ts") &&
      !SKIP_FILES.has(entry.name)
    ) {
      acc.push(path);
    }
  }
  return acc;
}

function importPath(modulePath) {
  const lastDot = modulePath.lastIndexOf(".");
  return modulePath.slice(0, lastDot === -1 ? undefined : lastDot);
}

function moduleIdentifier(modulePath) {
  let safe = importPath(modulePath).replaceAll("/", "_").replaceAll("-", "_");
  if (["fullApi", "api", "internal", "components"].includes(safe)) {
    safe = `${safe}_`;
  }
  return safe;
}

const header = (description) => `/* eslint-disable */
/**
 * ${description}
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run \`npx convex dev\` or \`npm run codegen\`.
 * @module
 */
`;

const modules = walk(convexDir)
  .map((path) => relative(convexDir, path).replaceAll("\\", "/"))
  .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

mkdirSync(outDir, { recursive: true });

const apiImports = modules
  .map(
    (modulePath) =>
      `import type * as ${moduleIdentifier(modulePath)} from "../${importPath(modulePath)}.js";`
  )
  .join("\n");

const apiEntries = modules
  .map(
    (modulePath) =>
      `    "${importPath(modulePath)}": typeof ${moduleIdentifier(modulePath)},`
  )
  .join("\n");

writeFileSync(
  join(outDir, "api.js"),
  `${header("Generated `api` utility.")}
import { anyApi } from "convex/server";

/**
 * A utility for referencing Convex functions in your app's API.
 */
export const api = anyApi;
export const internal = anyApi;
`
);

writeFileSync(
  join(outDir, "api.d.ts"),
  `${header("Generated `api` utility.")}
import type { ApiFromModules, FilterApi, FunctionReference } from "convex/server";
${apiImports}

declare const fullApi: ApiFromModules<{
${apiEntries}
}>;
export declare const api: FilterApi<typeof fullApi, FunctionReference<any, "public">>;
export declare const internal: FilterApi<typeof fullApi, FunctionReference<any, "internal">>;
`
);

writeFileSync(
  join(outDir, "server.js"),
  `${header("Generated utilities for implementing server-side Convex query and mutation functions.")}
import {
  actionGeneric,
  httpActionGeneric,
  internalActionGeneric,
  internalMutationGeneric,
  internalQueryGeneric,
  mutationGeneric,
  queryGeneric,
} from "convex/server";

export const query = queryGeneric;
export const internalQuery = internalQueryGeneric;
export const mutation = mutationGeneric;
export const internalMutation = internalMutationGeneric;
export const action = actionGeneric;
export const internalAction = internalActionGeneric;
export const httpAction = httpActionGeneric;
export const env = process.env;
`
);

writeFileSync(
  join(outDir, "server.d.ts"),
  `${header("Generated utilities for implementing server-side Convex query and mutation functions.")}
import type {
  ActionBuilder,
  GenericActionCtx,
  GenericDatabaseReader,
  GenericDatabaseWriter,
  GenericMutationCtx,
  GenericQueryCtx,
  HttpActionBuilder,
  MutationBuilder,
  QueryBuilder,
} from "convex/server";
import type { DataModel } from "./dataModel.js";

export declare const query: QueryBuilder<DataModel, "public">;
export declare const internalQuery: QueryBuilder<DataModel, "internal">;
export declare const mutation: MutationBuilder<DataModel, "public">;
export declare const internalMutation: MutationBuilder<DataModel, "internal">;
export declare const action: ActionBuilder<DataModel, "public">;
export declare const internalAction: ActionBuilder<DataModel, "internal">;
export declare const httpAction: HttpActionBuilder;
export declare const env: Record<string, string | undefined>;

export type QueryCtx = GenericQueryCtx<DataModel>;
export type MutationCtx = GenericMutationCtx<DataModel>;
export type ActionCtx = GenericActionCtx<DataModel>;
export type DatabaseReader = GenericDatabaseReader<DataModel>;
export type DatabaseWriter = GenericDatabaseWriter<DataModel>;
`
);

writeFileSync(
  join(outDir, "dataModel.d.ts"),
  `${header("Generated data model types.")}
import type {
  DataModelFromSchemaDefinition,
  DocumentByName,
  SystemTableNames,
  TableNamesInDataModel,
} from "convex/server";
import type { GenericId } from "convex/values";
import schema from "../schema.js";

export type TableNames = TableNamesInDataModel<DataModel>;
export type Doc<TableName extends TableNames> = DocumentByName<DataModel, TableName>;
export type Id<TableName extends TableNames | SystemTableNames> = GenericId<TableName>;
export type DataModel = DataModelFromSchemaDefinition<typeof schema>;
`
);

process.stdout.write(
  `wrote convex/_generated from ${modules.length} modules\n`
);
