import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import type { ConnectorStatus } from "../shared/connectors.ts";
import {
  CONNECTOR_CARD_COPY,
  CONNECTOR_CATALOG,
  LINEAR_CONNECTOR,
  connectionMeta,
  connectorStatusLabel,
  connectorStatusTone,
  filterConnectorCatalog,
  partitionConnectorConnections,
  providerIconSource,
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

describe(providerIconSource, () => {
  it("prefers iconUrl, then homepage favicon.im — never a custom SVG", () => {
    expect({
      explicit: providerIconSource({
        iconUrl: "https://cdn.example/linear.png",
        provider: "linear",
      }),
      linear: providerIconSource(LINEAR_CONNECTOR),
      missing: providerIconSource({ provider: "linear" }),
    }).toStrictEqual({
      explicit: "https://cdn.example/linear.png",
      linear:
        "https://a.favicon.im/linear.app?larger=true&throw-error-on-404=true",
      missing: undefined,
    });
    expect(LINEAR_CONNECTOR.homepageUrl).toBe("https://linear.app");
  });
});

describe(filterConnectorCatalog, () => {
  it("filters the catalog by name, description, or provider", () => {
    expect({
      empty: filterConnectorCatalog(CONNECTOR_CATALOG, ""),
      linear: filterConnectorCatalog(CONNECTOR_CATALOG, "linear"),
      description: filterConnectorCatalog(CONNECTOR_CATALOG, "課題"),
      miss: filterConnectorCatalog(CONNECTOR_CATALOG, "github"),
    }).toStrictEqual({
      empty: [LINEAR_CONNECTOR],
      linear: [LINEAR_CONNECTOR],
      description: [LINEAR_CONNECTOR],
      miss: [],
    });
  });
});

describe("connector card copy", () => {
  it("keeps Japanese CTAs and the Grok Bot Team badge", () => {
    expect(LINEAR_CONNECTOR.provider).toBe("linear");
    expect(LINEAR_CONNECTOR.description).toContain("課題とプロジェクト");
    expect(CONNECTOR_CARD_COPY).toMatchObject({
      add: "追加",
      authorize: "認可",
      authorizeHint: expect.stringContaining("Linear に移動"),
      connected: "接続済み",
      disconnect: "切断",
      notConfigured: "認可を開始できません。管理者に連絡してください。",
      reopen: "再表示",
      retry: "再試行",
      searchLabel: "コネクタを検索",
      team: "Team",
    });
    expect(JSON.stringify(CONNECTOR_CARD_COPY)).not.toContain(
      "認可の開始は準備中です"
    );
    expect({
      retry: CONNECTOR_CARD_COPY.retryHint("Linear"),
      waiting: CONNECTOR_CARD_COPY.waiting("Linear"),
    }).toStrictEqual({
      retry: expect.stringContaining("認可が完了しませんでした"),
      waiting: expect.stringContaining("認可を待っています"),
    });
  });

  it("does not mention infrastructure names in card copy", () => {
    const haystack = [
      LINEAR_CONNECTOR.description,
      CONNECTOR_CARD_COPY.authorizeHint,
      CONNECTOR_CARD_COPY.disconnectDetail,
      CONNECTOR_CARD_COPY.notConfigured,
      CONNECTOR_CARD_COPY.searchLabel,
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

describe("connector marketplace layout", () => {
  it("uses compact rows with a vertically centered CTA", () => {
    const pane = readFileSync("src/harness/rail/ConnectorsPane.tsx", "utf-8");
    const page = readFileSync("src/pages/ConnectorsPage.tsx", "utf-8");
    expect({
      actions: pane.includes("connector-card-actions"),
      assign: pane.includes("location.assign"),
      centered: pane.includes("flex items-center gap-3"),
      complete: pane.includes("completeLinearConnect"),
      grok: pane.includes("sand-connector-card__header"),
      icon: pane.includes("providerIconSource"),
      row: pane.includes("connector-marketplace-row"),
      search: page.includes(CONNECTOR_CARD_COPY.searchLabel),
      text: pane.includes("connector-card-text"),
    }).toStrictEqual({
      actions: true,
      assign: true,
      centered: true,
      complete: true,
      grok: true,
      icon: true,
      row: true,
      search: true,
      text: true,
    });
    expect({
      banned: /OpenConnector|OOMOL|workers\.dev|gateway/i.test(pane),
      homemade: /M1\.22541|#5E6AD2|LINEAR_MARK_PATH|LinearMark/.test(pane),
      paddedCard: /rounded-card bg-surface shadow-card/.test(pane),
      stackedCta: /flex flex-col gap-2 px-3 py-2\.5/.test(pane),
    }).toStrictEqual({
      banned: false,
      homemade: false,
      paddedCard: false,
      stackedCta: false,
    });
  });
});
