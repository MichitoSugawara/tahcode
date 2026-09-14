import {
  LINEAR_CONNECT_QUERY,
  MAX_CONNECTOR_DISPLAY_LABEL,
  normalizeOpaqueConnectorId,
  normalizeOptionalConnectorText,
} from "./connectors.ts";
import type { ConnectorScope } from "./connectors.ts";

export {
  LINEAR_CONNECT_QUERY,
  linearConnectReturnScope,
  stripLinearConnectReturnSearch,
} from "./connectors.ts";

export const DEFAULT_OPENCONNECTOR_BASE_URL =
  "https://tahcode-open-connector.gawara.workers.dev";

export const LINEAR_CONNECTOR_SERVICE = "linear";
export const LINEAR_GET_CURRENT_USER_ACTION = "linear.get_current_user";
export const LINEAR_TEAM_HEALTH_ACTIONS = [
  "linear.list_linear_teams",
  "linear.get_all_linear_teams",
] as const;

export const OPENCONNECTOR_FETCH_TIMEOUT_MS = 12_000;

export type OpenConnectorEnv = {
  adminToken?: string;
  baseUrl: string;
  runtimeToken?: string;
  siteUrl?: string;
};

export type FetchLike = (
  input: string,
  init?: {
    body?: string;
    headers?: Record<string, string>;
    method?: string;
    signal?: AbortSignal;
  }
) => Promise<{
  ok: boolean;
  status: number;
  text: () => Promise<string>;
}>;

export type ConnectionRequestStatus =
  | "initiated"
  | "connected"
  | "failed"
  | "expired";

export type OpenConnectorConnectionRequestStart = {
  authorizationUrl: string;
  connectionRequestId: string;
  expiresAt: string;
  stateHandle: string;
  status: "initiated";
};

export type OpenConnectorConnectionRequest = {
  appId: string | null;
  connectionRequestId: string;
  errorCode: string | null;
  errorMessage: string | null;
  expiresAt?: string;
  service: string;
  status: ConnectionRequestStatus;
};

export type OpenConnectorManagedConnection = {
  accountLabel?: string;
  alias: string;
  displayName?: string;
  id: string;
  service: string;
  status: string;
};

export type LinearViewer = {
  displayName?: string;
  email?: string;
  id?: string;
  name?: string;
};

export type ConfirmLinearConnectionRequest =
  | { kind: "pending" }
  | { kind: "failed"; reason: string }
  | { kind: "connected"; connectedAccountId: string };

function firstNonEmptyEnv(
  env: Record<string, string | undefined>,
  names: readonly string[]
): string | undefined {
  for (const name of names) {
    const value = env[name]?.trim();
    if (value) {
      return value;
    }
  }
  return undefined;
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/$/, "");
}

export function readOpenConnectorEnv(
  env: Record<string, string | undefined>
): OpenConnectorEnv {
  const baseUrl =
    firstNonEmptyEnv(env, ["OPENCONNECTOR_BASE_URL"]) ??
    DEFAULT_OPENCONNECTOR_BASE_URL;
  return {
    adminToken: firstNonEmptyEnv(env, [
      "OPENCONNECTOR_ADMIN_TOKEN",
      "OOMOL_CONNECT_ADMIN_TOKEN",
    ]),
    baseUrl: trimTrailingSlash(baseUrl),
    runtimeToken: firstNonEmptyEnv(env, [
      "OPENCONNECTOR_RUNTIME_TOKEN",
      "OOMOL_CONNECT_RUNTIME_TOKEN",
    ]),
    siteUrl: firstNonEmptyEnv(env, ["SITE_URL"]),
  };
}

export function isOpenConnectorConfigured(config: OpenConnectorEnv): boolean {
  return Boolean(config.adminToken && config.siteUrl);
}

export function buildLinearReturnUri(input: {
  orgSlug: string;
  scope: ConnectorScope;
  siteUrl: string;
}): string {
  const origin = trimTrailingSlash(input.siteUrl);
  const url = new URL(
    `/o/${encodeURIComponent(input.orgSlug)}/connectors`,
    origin
  );
  url.searchParams.set("connector", LINEAR_CONNECT_QUERY);
  url.searchParams.set("scope", input.scope);
  return url.toString();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function asNullableString(value: unknown): string | null {
  return asOptionalString(value) ?? null;
}

export function parseRuntimeEnvelope(json: unknown): unknown {
  if (!isRecord(json) || typeof json.success !== "boolean") {
    throw new Error("OpenConnector returned an invalid response");
  }
  if (!json.success) {
    const message =
      asOptionalString(json.message) ?? "OpenConnector request failed";
    throw new Error(message);
  }
  return json.data;
}

export function parseConnectionRequestStart(
  data: unknown
): OpenConnectorConnectionRequestStart {
  if (!isRecord(data)) {
    throw new Error("OpenConnector did not return a connection request");
  }
  const authorizationUrl = asOptionalString(data.authorizationUrl);
  const connectionRequestId = asOptionalString(data.connectionRequestId);
  const expiresAt = asOptionalString(data.expiresAt);
  const stateHandle = asOptionalString(data.stateHandle);
  if (
    !authorizationUrl ||
    !connectionRequestId ||
    !expiresAt ||
    !stateHandle ||
    data.status !== "initiated"
  ) {
    throw new Error("OpenConnector did not start a Linear connection request");
  }
  return {
    authorizationUrl,
    connectionRequestId,
    expiresAt,
    stateHandle,
    status: "initiated",
  };
}

export function parseConnectionRequest(
  data: unknown
): OpenConnectorConnectionRequest {
  if (!isRecord(data)) {
    throw new Error("OpenConnector did not return a connection request");
  }
  const connectionRequestId = asOptionalString(data.connectionRequestId);
  const service = asOptionalString(data.service);
  const status = asOptionalString(data.status);
  if (
    !connectionRequestId ||
    !service ||
    (status !== "initiated" &&
      status !== "connected" &&
      status !== "failed" &&
      status !== "expired")
  ) {
    throw new Error("OpenConnector connection request is malformed");
  }
  return {
    appId: asNullableString(data.appId),
    connectionRequestId,
    errorCode: asNullableString(data.errorCode),
    errorMessage: asNullableString(data.errorMessage),
    expiresAt: asOptionalString(data.expiresAt),
    service,
    status,
  };
}

export function parseManagedConnection(
  data: unknown
): OpenConnectorManagedConnection {
  if (!isRecord(data)) {
    throw new Error("OpenConnector did not return a connection");
  }
  const id = asOptionalString(data.id);
  const alias = asOptionalString(data.alias);
  const service = asOptionalString(data.service);
  const status = asOptionalString(data.status);
  if (!id || !alias || !service || !status) {
    throw new Error("OpenConnector connection is malformed");
  }
  return {
    accountLabel: asOptionalString(data.accountLabel),
    alias,
    displayName: asOptionalString(data.displayName),
    id,
    service,
    status,
  };
}

export function parseLinearViewer(data: unknown): LinearViewer | undefined {
  if (!isRecord(data) || !isRecord(data.viewer)) {
    return;
  }
  const viewer = data.viewer;
  return {
    displayName: asOptionalString(viewer.displayName),
    email: asOptionalString(viewer.email),
    id: asOptionalString(viewer.id),
    name: asOptionalString(viewer.name),
  };
}

/**
 * Confirm a Linear connection-request from OpenConnector. The browser query
 * `connectedAccountId` is never an input — only `appId` from the request.
 */
export function confirmLinearConnectionRequest(
  request: OpenConnectorConnectionRequest
): ConfirmLinearConnectionRequest {
  if (request.service !== LINEAR_CONNECTOR_SERVICE) {
    return { kind: "failed", reason: "Connection request is not for Linear" };
  }
  if (request.status === "initiated") {
    return { kind: "pending" };
  }
  if (request.status === "failed" || request.status === "expired") {
    return {
      kind: "failed",
      reason:
        request.errorMessage ??
        (request.status === "expired"
          ? "Linear authorization expired"
          : "Linear authorization failed"),
    };
  }
  if (!request.appId) {
    return {
      kind: "failed",
      reason: "Linear connection request is missing an account id",
    };
  }
  return {
    connectedAccountId: normalizeOpaqueConnectorId(request.appId),
    kind: "connected",
  };
}

export function linearDisplayLabel(
  viewer: LinearViewer | undefined,
  connection: OpenConnectorManagedConnection | undefined
): string | undefined {
  return normalizeOptionalConnectorText(
    viewer?.displayName ??
      viewer?.name ??
      viewer?.email ??
      connection?.accountLabel ??
      connection?.displayName ??
      connection?.alias,
    MAX_CONNECTOR_DISPLAY_LABEL,
    "Display label"
  );
}

async function readJson(response: {
  text: () => Promise<string>;
}): Promise<unknown> {
  const text = await response.text();
  if (text.trim().length < 1) {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error("OpenConnector returned an invalid response");
  }
}

export async function openConnectorRequest(input: {
  body?: Record<string, unknown>;
  config: OpenConnectorEnv;
  connectionAlias?: string;
  fetchImpl?: FetchLike;
  method?: "GET" | "POST";
  path: string;
  timeoutMs?: number;
  useAdmin: boolean;
}): Promise<unknown> {
  const token = input.useAdmin
    ? input.config.adminToken
    : (input.config.runtimeToken ?? input.config.adminToken);
  if (!token) {
    throw new Error("OpenConnector is not configured");
  }
  const fetchImpl = input.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    input.timeoutMs ?? OPENCONNECTOR_FETCH_TIMEOUT_MS
  );
  const headers: Record<string, string> = {
    accept: "application/json",
    authorization: `Bearer ${token}`,
  };
  if (input.body !== undefined) {
    headers["content-type"] = "application/json";
  }
  if (input.connectionAlias) {
    headers["x-oo-connector-alias"] = input.connectionAlias;
  }
  try {
    const response = await fetchImpl(`${input.config.baseUrl}${input.path}`, {
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      headers,
      method: input.method ?? (input.body === undefined ? "GET" : "POST"),
      signal: controller.signal,
    });
    const json = await readJson(response);
    if (!response.ok) {
      if (isRecord(json) && typeof json.message === "string") {
        throw new Error(json.message);
      }
      throw new Error(`OpenConnector request failed (${response.status})`);
    }
    return parseRuntimeEnvelope(json);
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("OpenConnector request timed out", { cause: error });
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export async function startLinearConnectionRequest(input: {
  config: OpenConnectorEnv;
  fetchImpl?: FetchLike;
  orgSlug: string;
  scope: ConnectorScope;
}): Promise<OpenConnectorConnectionRequestStart> {
  if (!input.config.adminToken || !input.config.siteUrl) {
    throw new Error("OpenConnector is not configured");
  }
  const data = await openConnectorRequest({
    body: {
      returnUri: buildLinearReturnUri({
        orgSlug: input.orgSlug,
        scope: input.scope,
        siteUrl: input.config.siteUrl,
      }),
    },
    config: input.config,
    fetchImpl: input.fetchImpl,
    method: "POST",
    path: `/v1/connections/${LINEAR_CONNECTOR_SERVICE}/connect`,
    useAdmin: true,
  });
  return parseConnectionRequestStart(data);
}

export async function getLinearConnectionRequest(input: {
  config: OpenConnectorEnv;
  fetchImpl?: FetchLike;
  requestId: string;
}): Promise<OpenConnectorConnectionRequest> {
  const data = await openConnectorRequest({
    config: input.config,
    fetchImpl: input.fetchImpl,
    method: "GET",
    path: `/v1/connection-requests/${encodeURIComponent(input.requestId)}`,
    useAdmin: true,
  });
  return parseConnectionRequest(data);
}

export async function getLinearManagedConnection(input: {
  appId: string;
  config: OpenConnectorEnv;
  fetchImpl?: FetchLike;
}): Promise<OpenConnectorManagedConnection> {
  const data = await openConnectorRequest({
    config: input.config,
    fetchImpl: input.fetchImpl,
    method: "GET",
    path: `/v1/connections/by-id/${encodeURIComponent(input.appId)}`,
    useAdmin: true,
  });
  return parseManagedConnection(data);
}

export async function executeLinearAction(input: {
  actionId: string;
  config: OpenConnectorEnv;
  connectionAlias: string;
  fetchImpl?: FetchLike;
}): Promise<unknown> {
  return await openConnectorRequest({
    body: { input: {} },
    config: input.config,
    connectionAlias: input.connectionAlias,
    fetchImpl: input.fetchImpl,
    method: "POST",
    path: `/v1/actions/${input.actionId}`,
    useAdmin: false,
  });
}

export async function healthCheckLinearConnection(input: {
  config: OpenConnectorEnv;
  connectionAlias: string;
  fetchImpl?: FetchLike;
}): Promise<{ viewer?: LinearViewer }> {
  try {
    const output = await executeLinearAction({
      actionId: LINEAR_GET_CURRENT_USER_ACTION,
      config: input.config,
      connectionAlias: input.connectionAlias,
      fetchImpl: input.fetchImpl,
    });
    return { viewer: parseLinearViewer(output) };
  } catch {
    let lastError: Error | undefined;
    for (const actionId of LINEAR_TEAM_HEALTH_ACTIONS) {
      try {
        await executeLinearAction({
          actionId,
          config: input.config,
          connectionAlias: input.connectionAlias,
          fetchImpl: input.fetchImpl,
        });
        return {};
      } catch (error) {
        lastError =
          error instanceof Error
            ? error
            : new Error("Linear health check failed");
      }
    }
    throw lastError ?? new Error("Linear health check failed");
  }
}
