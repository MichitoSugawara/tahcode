import { PROVIDER_CATALOG } from "./providers.ts";

const RESERVED_STATIC = [
  "admin",
  "administrator",
  "agent",
  "api",
  "auth",
  "channel",
  "everyone",
  "harness",
  "help",
  "here",
  "me",
  "mod",
  "moderator",
  "official",
  "owner",
  "root",
  "runtime",
  "security",
  "support",
  "system",
  "tahcode",
  "team",
  "www",
] as const;

const RESERVED_FROM_PROVIDERS = PROVIDER_CATALOG.flatMap((entry) =>
  entry.mentionHandles.map((handle) => handle.toLowerCase())
);

export const RESERVED_HANDLES = new Set<string>([
  ...RESERVED_STATIC,
  ...RESERVED_FROM_PROVIDERS,
]);

export const HANDLE_MAX_LENGTH = 30;

export function normalizeHandle(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replaceAll(/[^a-z0-9_]+/g, "")
    .slice(0, HANDLE_MAX_LENGTH);
}

export function isReservedHandle(handle: string): boolean {
  return RESERVED_HANDLES.has(handle);
}
