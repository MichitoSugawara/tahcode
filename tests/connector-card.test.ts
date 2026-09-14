import { describe, expect, it } from "vitest";

import type { ConnectorStatus } from "../shared/connectors.ts";
import {
  CONNECTOR_CARD_COPY,
  LINEAR_CONNECTOR,
  connectionMeta,
  connectorStatusLabel,
  connectorStatusTone,
  partitionConnectorConnections,
  resolveConnectorCardPhase,
} from "../src/lib/connectorCard.ts";

describe(resolveConnectorCardPhase, () => {
  it("maps Grok Bot Add / Authorize / Waiting / Retry / Connected", () => {
    expect({
      add: resolveConnectorCardPhase({
        hasConnection: false,
        localPhase: "idle",
      }),
      authorizeDisconnected: resolveConnectorCardPhase({
        hasConnection: true,
        localPhase: "idle",
        status: "disconnected",
      }),
      authorizeNeedsAuth: resolveConnectorCardPhase({
        hasConnection: true,
        localPhase: "idle",
        status: "needsAuth",
      }),
      connected: resolveConnectorCardPhase({
        hasConnection: true,
        localPhase: "idle",
        status: "connected",
      }),
      retryError: resolveConnectorCardPhase({
        hasConnection: true,
        localPhase: "idle",
        status: "error",
      }),
      retryFailed: resolveConnectorCardPhase({
        hasConnection: true,
        localPhase: "failed",
        status: "needsAuth",
      }),
      waiting: resolveConnectorCardPhase({
        hasConnection: true,
        localPhase: "waiting",
        status: "needsAuth",
      }),
    }).toStrictEqual({
      add: "add",
      authorizeDisconnected: "authorize",
      authorizeNeedsAuth: "authorize",
      connected: "connected",
      retryError: "retry",
      retryFailed: "retry",
      waiting: "waiting",
    });
  });

  it("lets a local wait overlay a Convex connected row only while in-flight", () => {
    expect(
      resolveConnectorCardPhase({
        hasConnection: true,
        localPhase: "waiting",
        status: "connected",
      })
    ).toBe("waiting");
  });
});

describe(partitionConnectorConnections, () => {
  it("keeps the org-scoped Linear row as the Team card", () => {
    const rows = [
      { provider: "linear", scope: "user" as const },
      { provider: "linear", scope: "org" as const },
      { provider: "github", scope: "org" as const },
    ];
    expect(partitionConnectorConnections(rows, "linear")).toStrictEqual({
      extras: [{ provider: "linear", scope: "user" }],
      primary: { provider: "linear", scope: "org" },
    });
  });
});

describe("connector card copy", () => {
  it("keeps Japanese CTAs and the Grok Bot Team badge", () => {
    expect(LINEAR_CONNECTOR.provider).toBe("linear");
    expect(CONNECTOR_CARD_COPY).toMatchObject({
      add: "追加",
      authorize: "認可",
      authorizeHint: expect.stringContaining("Linear に移動"),
      connected: "接続済み",
      disconnect: "切断",
      reopen: "再表示",
      retry: "再試行",
      team: "Team",
    });
    expect(JSON.stringify(CONNECTOR_CARD_COPY)).not.toContain(
      "認可の開始は準備中です"
    );
    expect(CONNECTOR_CARD_COPY.waiting("Linear")).toContain(
      "認可を待っています"
    );
    expect(CONNECTOR_CARD_COPY.retryHint("Linear")).toContain(
      "認可が完了しませんでした"
    );
  });

  it("labels Convex statuses for the card badge", () => {
    const statuses: ConnectorStatus[] = [
      "connected",
      "needsAuth",
      "disconnected",
      "error",
    ];
    expect(
      Object.fromEntries(
        statuses.map((status) => [
          status,
          {
            label: connectorStatusLabel(status),
            tone: connectorStatusTone(status),
          },
        ])
      )
    ).toStrictEqual({
      connected: { label: "接続済み", tone: "green" },
      disconnected: { label: "切断済み", tone: "neutral" },
      error: { label: "エラー", tone: "red" },
      needsAuth: { label: "認可が必要", tone: "orange" },
    });
  });

  it("shows display label and personal scope in the meta line", () => {
    expect(
      connectionMeta({
        displayLabel: "default · tahcode",
        provider: "linear",
        scope: "org",
        status: "connected",
      })
    ).toBe("default · tahcode");
    expect(
      connectionMeta({
        provider: "linear",
        scope: "user",
        status: "needsAuth",
      })
    ).toBe("個人");
  });
});
