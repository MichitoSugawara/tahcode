import { readFileSync } from "node:fs";

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
    expect(LINEAR_CONNECTOR.description).toContain("Linear を org に接続");
    expect(CONNECTOR_CARD_COPY).toMatchObject({
      add: "追加",
      authorize: "認可",
      connected: "接続済み",
      disconnect: "切断",
      notConfigured: "認可を開始できません。管理者に連絡してください。",
      reopen: "再表示",
      retry: "再試行",
      team: "Team",
    });
    expect(CONNECTOR_CARD_COPY.waiting("Linear")).toContain(
      "認可を待っています"
    );
    expect(CONNECTOR_CARD_COPY.retryHint("Linear")).toContain(
      "認可が完了しませんでした"
    );
  });

  it("does not mention infrastructure names in card copy", () => {
    const haystack = [
      LINEAR_CONNECTOR.description,
      CONNECTOR_CARD_COPY.disconnectDetail,
      CONNECTOR_CARD_COPY.notConfigured,
      CONNECTOR_CARD_COPY.oauthPending,
    ].join(" ");
    expect(haystack).not.toMatch(/OpenConnector|OOMOL|workers\.dev|gateway/i);
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

describe("connector card layout", () => {
  it("puts CTA/status on the header row, not under the description", () => {
    const source = readFileSync("src/harness/rail/ConnectorsPane.tsx", "utf-8");
    expect(source).toContain("connector-card-header");
    expect(source).toContain("connector-card-text");
    expect(source).toContain("connector-card-actions");
    expect(source).toContain("sand-connector-card__header");
    expect(source).not.toMatch(/flex flex-col gap-2 px-3 py-2\.5/);
  });
});
