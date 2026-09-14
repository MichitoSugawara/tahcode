import type {
  ConnectorScope,
  ConnectorStatus,
} from "../../shared/connectors.ts";

export {
  LINEAR_CONNECT_QUERY,
  firstConnectorCardAttachment,
  isPendingConnectorAccountId,
  linearConnectReturnConnectionId,
  linearConnectReturnScope,
  stripLinearConnectReturnSearch,
} from "../../shared/connectors.ts";

export type { ConnectorCardAttachment } from "../../shared/connectors.ts";

export type { ConnectorScope, ConnectorStatus };

export type ConnectorCardPhase =
  | "add"
  | "authorize"
  | "waiting"
  | "retry"
  | "connected";

export type ConnectorCardLocalPhase = "idle" | "waiting" | "failed";

export type ConnectorCatalogEntry = {
  description: string;
  displayName: string;
  homepageUrl?: string;
  iconUrl?: string;
  provider: string;
};

/** Static catalog icons when a provider already ships a URL. Linear does not. */
const CATALOG_ICON_BY_PROVIDER: Readonly<Record<string, string>> = {};

/**
 * Resolve a connector icon the same way as
 * `providerIconSource` in the connector console:
 * explicit iconUrl → catalog map → favicon.im from homepageUrl hostname.
 */
export function providerIconSource(entry: {
  homepageUrl?: string;
  iconUrl?: string;
  provider: string;
}): string | undefined {
  const iconUrl = entry.iconUrl?.trim();
  if (iconUrl) {
    return iconUrl;
  }
  const mapped = CATALOG_ICON_BY_PROVIDER[entry.provider];
  if (mapped) {
    return mapped;
  }
  const homepage = entry.homepageUrl?.trim();
  if (!homepage) {
    return;
  }
  let hostname: string;
  try {
    hostname = new URL(homepage).hostname;
  } catch {
    return;
  }
  if (hostname.length < 1) {
    return;
  }
  return `https://a.favicon.im/${hostname}?larger=true&throw-error-on-404=true`;
}

export type ConnectorConnectionView = {
  displayLabel?: string;
  lastVerifiedAt?: number;
  provider: string;
  scope: ConnectorScope;
  status: ConnectorStatus;
};

/** Grok Bot connector.tsx: Add / Authorize / Waiting+Reopen / Retry / Connected. */
export function resolveConnectorCardPhase(input: {
  hasConnection: boolean;
  localPhase: ConnectorCardLocalPhase;
  status?: ConnectorStatus;
}): ConnectorCardPhase {
  if (input.localPhase === "waiting") {
    return "waiting";
  }
  if (input.localPhase === "failed") {
    return "retry";
  }
  if (!input.hasConnection) {
    return "add";
  }
  if (input.status === "connected") {
    return "connected";
  }
  if (input.status === "error") {
    return "retry";
  }
  return "authorize";
}

export function connectionsForProvider<T extends { provider: string }>(
  rows: T[],
  provider: string
): T[] {
  return rows.filter((row) => row.provider === provider);
}

/** Grok mention titles: `Linear` or `Linear (pottos)` when the label adds info. */
export function connectorAccountTitle(
  displayName: string,
  displayLabel?: string
): string {
  const label = displayLabel?.trim();
  if (!label) {
    return displayName;
  }
  const normalized = label.toLowerCase();
  if (normalized === displayName.toLowerCase() || normalized === "default") {
    return displayName;
  }
  return `${displayName} (${label})`;
}

/** Account-list label in the Grok detail screen (`アカウント` when unset). */
export function connectorAccountLabel(displayLabel?: string): string {
  const label = displayLabel?.trim();
  return label && label.length > 0 ? label : "アカウント";
}

export function connectorAccountCountLabel(count: number): string | undefined {
  if (count < 1) {
    return;
  }
  return `${count}アカウント`;
}

export function connectedConnectorCount(
  connections: readonly { status: ConnectorStatus }[]
): number {
  return connections.filter((row) => row.status === "connected").length;
}

/**
 * Grok Bot / Codex / common SaaS: "+ Add another account" only after the
 * first account is already connected. An empty connector never uses that
 * framing — the primary CTA is Authorize (marketplace Add starts OAuth).
 */
export function shouldShowAddAnotherAccount(
  connections: readonly { status: ConnectorStatus }[]
): boolean {
  return connectedConnectorCount(connections) >= 1;
}

/** Marketplace row with zero mappings starts OAuth; existing rows open detail. */
export function shouldStartOauthFromMarketplace(
  connections: readonly { status: ConnectorStatus }[]
): boolean {
  return connections.length === 0;
}

export function marketplaceConnectorPhase(
  statuses: readonly ConnectorStatus[]
): "add" | "connected" | "needsAuth" {
  if (statuses.length === 0) {
    return "add";
  }
  if (statuses.some((status) => status === "connected")) {
    return "connected";
  }
  return "needsAuth";
}

export const LINEAR_CONNECTOR: ConnectorCatalogEntry = {
  description: "課題とプロジェクトを org から接続します。",
  displayName: "Linear",
  homepageUrl: "https://linear.app",
  provider: "linear",
};

export const CONNECTOR_CATALOG: readonly ConnectorCatalogEntry[] = [
  LINEAR_CONNECTOR,
];

export function filterConnectorCatalog<T extends ConnectorCatalogEntry>(
  entries: readonly T[],
  query: string
): T[] {
  const needle = query.trim().toLowerCase();
  if (needle.length === 0) {
    return [...entries];
  }
  return entries.filter((entry) => {
    const haystack =
      `${entry.displayName} ${entry.description} ${entry.provider}`.toLowerCase();
    return haystack.includes(needle);
  });
}

export const CONNECTOR_CARD_COPY = {
  accounts: "アカウント",
  add: "追加",
  addAnotherAccount: "+ 別のアカウントを追加",
  authorize: "認証",
  authorizeHint: "認証すると Linear に移動し、完了後この画面に戻ります。",
  chatIntro: (name: string) => `${name} をこの org に接続します。`,
  chatIntroUser: (name: string) => `${name} を個人アカウントとして接続します。`,
  chatMemberHint: "Team 連携の認証は Owner / Admin が行います。",
  cancelWait: "キャンセル",
  confirming: (name: string) => `${name} の認証を確認しています…`,
  connected: "接続済み",
  disconnect: "切断",
  disconnectDetail:
    "tahcode からの連携だけを止めます。Linear 側のアカウントはそのままです。",
  emptySearch: "該当するコネクタがありません",
  needsAuth: "認証が必要",
  notConfigured: "認証を開始できません。管理者に連絡してください。",
  personal: "個人",
  remove: "削除",
  removeAccount: (label: string) => `${label} を削除`,
  removeDetail:
    "このアカウントの連携だけを削除します。他の Linear アカウントは残ります。Linear 側のアカウントはそのままです。",
  rename: "名前を変更",
  renamePlaceholder: "アカウント",
  reopen: "再表示",
  retry: "再試行",
  retryHint: (name: string) => `${name} の認証が完了しませんでした`,
  searchLabel: "コネクタを検索",
  team: "Team",
  waiting: (name: string) => `${name} の認証を待っています…`,
} as const;

export function connectorStatusLabel(status: ConnectorStatus): string {
  switch (status) {
    case "connected": {
      return "接続済み";
    }
    case "disconnected": {
      return "切断済み";
    }
    case "error": {
      return "エラー";
    }
    case "needsAuth": {
      return CONNECTOR_CARD_COPY.needsAuth;
    }
  }
}

export function connectorStatusTone(
  status: ConnectorStatus
): "green" | "neutral" | "orange" | "red" {
  switch (status) {
    case "connected": {
      return "green";
    }
    case "error": {
      return "red";
    }
    case "disconnected": {
      return "neutral";
    }
    case "needsAuth": {
      return "orange";
    }
  }
}

export function connectionMeta(connection: ConnectorConnectionView): string {
  const parts: string[] = [];
  if (connection.displayLabel) {
    parts.push(connection.displayLabel);
  }
  if (connection.scope === "user") {
    parts.push("個人");
  }
  return parts.join(" · ");
}
