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
