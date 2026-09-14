import type {
  ConnectorScope,
  ConnectorStatus,
} from "../../shared/connectors.ts";

export {
  LINEAR_CONNECT_QUERY,
  linearConnectReturnScope,
  stripLinearConnectReturnSearch,
} from "../../shared/openConnector.ts";

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
  provider: string;
};

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

export function partitionConnectorConnections<
  T extends { provider: string; scope: ConnectorScope },
>(rows: T[], provider: string): { extras: T[]; primary: T | undefined } {
  const matched = rows.filter((row) => row.provider === provider);
  return {
    extras: matched.filter((row) => row.scope === "user"),
    primary: matched.find((row) => row.scope === "org"),
  };
}

export const LINEAR_CONNECTOR: ConnectorCatalogEntry = {
  description:
    "課題とプロジェクトを org から接続します。トークンは OpenConnector に保管します。",
  displayName: "Linear",
  provider: "linear",
};

export const CONNECTOR_CARD_COPY = {
  add: "追加",
  authorize: "認可",
  authorizeHint: "認可すると Linear に移動し、完了後この画面に戻ります。",
  confirming: (name: string) => `${name} の認可を確認しています…`,
  connected: "接続済み",
  disconnect: "切断",
  notConfigured: "OpenConnector が未設定です。認可を開始できません。",
  reopen: "再表示",
  retry: "再試行",
  retryHint: (name: string) => `${name} の認可が完了しませんでした`,
  team: "Team",
  waiting: (name: string) => `${name} の認可を待っています…`,
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
      return "認可が必要";
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
