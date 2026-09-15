import { roleAtLeast } from "./access.ts";
import type { OrgRole } from "./access.ts";

export const CONNECTOR_SCOPES = ["org", "user"] as const;
export type ConnectorScope = (typeof CONNECTOR_SCOPES)[number];

export const CONNECTOR_STATUSES = [
  "connected",
  "needsAuth",
  "disconnected",
  "error",
] as const;
export type ConnectorStatus = (typeof CONNECTOR_STATUSES)[number];

/** First provider is Linear; the field stays a free string so the catalog can grow. */
export const CONNECTOR_PROVIDERS = ["linear"] as const;
export type ConnectorProvider = (typeof CONNECTOR_PROVIDERS)[number];

export const MAX_CONNECTOR_CONNECTIONS = 200;
export const MAX_CONNECTOR_PROVIDER = 64;
export const MAX_CONNECTOR_ACCOUNT_ID = 256;
export const MAX_CONNECTOR_CONFIG_ID = 128;
export const MAX_CONNECTOR_DISPLAY_LABEL = 120;
export const MAX_CONNECTOR_OAUTH_REQUEST_ID = 64;
export const MAX_CONNECTOR_OAUTH_ALIAS = 128;
export const LINEAR_CONNECT_QUERY = "linear";
export const CONNECTOR_CARD_KIND = "connector" as const;

export type ConnectorCardAttachment = {
  kind: typeof CONNECTOR_CARD_KIND;
  provider: string;
  scope: ConnectorScope;
};

export function isKnownConnectorProvider(
  value: string
): value is ConnectorProvider {
  return (CONNECTOR_PROVIDERS as readonly string[]).includes(value);
}

export function normalizeConnectorScope(
  value: string | undefined
): ConnectorScope {
  if (value === undefined || value === "org") {
    return "org";
  }
  if (value === "user") {
    return "user";
  }
  throw new Error("scope must be org or user");
}

export function normalizeConnectorCardAttachment(input: {
  provider?: string;
  scope?: string;
}): ConnectorCardAttachment {
  const provider = normalizeConnectorProvider(input.provider ?? "linear");
  if (!isKnownConnectorProvider(provider)) {
    throw new Error("Unknown connector");
  }
  return {
    kind: CONNECTOR_CARD_KIND,
    provider,
    scope: normalizeConnectorScope(input.scope),
  };
}

export function firstConnectorCardAttachment(
  attachments:
    | readonly { kind: string; provider: string; scope: string }[]
    | undefined
): ConnectorCardAttachment | undefined {
  if (!attachments) {
    return;
  }
  for (const item of attachments) {
    if (item.kind !== CONNECTOR_CARD_KIND) {
      continue;
    }
    try {
      return normalizeConnectorCardAttachment(item);
    } catch {
      continue;
    }
  }
  return undefined;
}

/** Same-origin org path only. Defaults to the dedicated connectors surface. */
export function sanitizeLinearReturnPath(
  returnPath: string | undefined,
  orgSlug: string
): string {
  const fallback = `/o/${encodeURIComponent(orgSlug)}/connectors`;
  if (returnPath === undefined) {
    return fallback;
  }
  const trimmed = returnPath.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) {
    return fallback;
  }
  const pathname = (trimmed.split("?")[0] ?? "").split("#")[0] ?? "";
  if (pathname.includes("\\") || pathname.includes("//")) {
    return fallback;
  }
  const prefix = `/o/${orgSlug}`;
  if (pathname !== prefix && !pathname.startsWith(`${prefix}/`)) {
    return fallback;
  }
  if (!/^\/o\/[a-z0-9-]+(?:\/[A-Za-z0-9._-]+)*$/.test(pathname)) {
    return fallback;
  }
  return pathname;
}

export function linearConnectReturnScope(
  search: string
): ConnectorScope | null {
  const params = new URLSearchParams(
    search.startsWith("?") ? search.slice(1) : search
  );
  if (params.get("connector") !== LINEAR_CONNECT_QUERY) {
    return null;
  }
  return params.get("scope") === "user" ? "user" : "org";
}

/** Convex `connectionId` from the OAuth return query (2nd+ account). */
export function linearConnectReturnConnectionId(search: string): string | null {
  if (linearConnectReturnScope(search) === null) {
    return null;
  }
  const params = new URLSearchParams(
    search.startsWith("?") ? search.slice(1) : search
  );
  const connectionId = params.get("connectionId")?.trim();
  return connectionId && connectionId.length > 0 ? connectionId : null;
}

export function stripLinearConnectReturnSearch(search: string): string {
  const params = new URLSearchParams(
    search.startsWith("?") ? search.slice(1) : search
  );
  for (const key of [
    "code",
    "connectedAccountId",
    "connectionId",
    "connector",
    "message",
    "scope",
    "service",
    "status",
  ]) {
    params.delete(key);
  }
  const next = params.toString();
  return next.length > 0 ? `?${next}` : "";
}

const PROVIDER_RE = /^[a-z][a-z0-9-]{0,63}$/;
const SECRET_FIELD_RE = /access_token|refresh_token|client_secret|Bearer\s/i;
const TOKEN_PREFIX_RE = /^(lin_api_|lin_oauth_|oct_|sk_|rk_)/i;
const JWT_RE = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

export function isConnectorScope(value: string): value is ConnectorScope {
  return (CONNECTOR_SCOPES as readonly string[]).includes(value);
}

export function isConnectorStatus(value: string): value is ConnectorStatus {
  return (CONNECTOR_STATUSES as readonly string[]).includes(value);
}

export function normalizeConnectorProvider(value: string): string {
  const provider = value.trim().toLowerCase();
  if (provider.length < 1 || provider.length > MAX_CONNECTOR_PROVIDER) {
    throw new Error("Provider is required");
  }
  if (!PROVIDER_RE.test(provider)) {
    throw new Error(
      "Provider must be lowercase letters, digits, or hyphens, starting with a letter"
    );
  }
  return provider;
}

/** Placeholder opaque id until OAuth writes the real OpenConnector account id.
 *  Pass `slot` so two in-flight connects do not share one pending key. */
export function pendingConnectorAccountId(
  provider: string,
  slot?: string
): string {
  const base = `pending:${normalizeConnectorProvider(provider)}`;
  if (slot === undefined) {
    return base;
  }
  const suffix = slot.trim();
  if (suffix.length < 1) {
    return base;
  }
  return `${base}:${suffix}`;
}

export function isPendingConnectorAccountId(value: string): boolean {
  return value.startsWith("pending:");
}

export function normalizeOptionalConnectorText(
  value: string | undefined,
  maxLength: number,
  label: string
): string | undefined {
  if (value === undefined) {
    return;
  }
  const trimmed = value.trim();
  if (trimmed.length < 1) {
    return;
  }
  if (trimmed.length > maxLength) {
    throw new Error(`${label} is too long`);
  }
  return trimmed;
}

/**
 * OpenConnector account ids are opaque. Reject values that look like OAuth
 * tokens, API keys, or JWTs so Convex never persists secrets.
 */
export function normalizeOpaqueConnectorId(value: string): string {
  const id = value.trim();
  if (id.length < 1 || id.length > MAX_CONNECTOR_ACCOUNT_ID) {
    throw new Error("Connected account id is required");
  }
  if (/\s/.test(id)) {
    throw new Error("Connected account id must be a single opaque token");
  }
  if (SECRET_FIELD_RE.test(id) || TOKEN_PREFIX_RE.test(id) || JWT_RE.test(id)) {
    throw new Error(
      "Connected account id must be an opaque OpenConnector id, not a secret"
    );
  }
  return id;
}

export function canViewConnectorConnection(input: {
  actorRole: OrgRole;
  actorUserId: string;
  connectionUserId?: string;
  scope: ConnectorScope;
}): boolean {
  if (input.scope === "org") {
    return true;
  }
  if (input.connectionUserId === input.actorUserId) {
    return true;
  }
  return roleAtLeast(input.actorRole, "admin");
}

export function canManageConnectorConnection(input: {
  actorRole: OrgRole;
  actorUserId: string;
  connectionUserId?: string;
  scope: ConnectorScope;
}): boolean {
  if (input.scope === "org") {
    return roleAtLeast(input.actorRole, "admin");
  }
  if (input.connectionUserId === input.actorUserId) {
    return true;
  }
  return roleAtLeast(input.actorRole, "admin");
}

export function canUpsertConnectorConnection(input: {
  actorRole: OrgRole;
  scope: ConnectorScope;
}): boolean {
  if (input.scope === "org") {
    return roleAtLeast(input.actorRole, "admin");
  }
  return true;
}
