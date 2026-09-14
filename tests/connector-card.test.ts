import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import type { ConnectorStatus } from "../shared/connectors.ts";
import {
  CONNECTOR_CARD_COPY,
  CONNECTOR_CATALOG,
  LINEAR_BRAND_MARK_PATH,
  LINEAR_CONNECTOR,
  connectionMeta,
  connectorStatusLabel,
  connectorStatusTone,
  filterConnectorCatalog,
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

describe(filterConnectorCatalog, () => {
  it("filters the catalog by name, description, and keywords", () => {
    expect(CONNECTOR_CATALOG).toHaveLength(1);
    expect(
      filterConnectorCatalog("").map((entry) => entry.provider)
    ).toStrictEqual(["linear"]);
    expect(filterConnectorCatalog("Linear")).toStrictEqual([LINEAR_CONNECTOR]);
    expect(filterConnectorCatalog("課題")).toStrictEqual([LINEAR_CONNECTOR]);
    expect(filterConnectorCatalog("gmail")).toStrictEqual([]);
  });
});

describe("connector card copy", () => {
  it("keeps Japanese CTAs and the Grok Bot Team badge", () => {
    expect({
      copy: CONNECTOR_CARD_COPY,
      description: LINEAR_CONNECTOR.description,
      provider: LINEAR_CONNECTOR.provider,
      retryHint: CONNECTOR_CARD_COPY.retryHint("Linear"),
      stub: JSON.stringify(CONNECTOR_CARD_COPY),
      waiting: CONNECTOR_CARD_COPY.waiting("Linear"),
    }).toMatchObject({
      copy: {
        add: "追加",
        authorize: "認可",
        authorizeHint: expect.stringContaining("Linear に移動"),
        connected: "接続済み",
        disconnect: "切断",
        notConfigured: "認可を開始できません。管理者に連絡してください。",
        reopen: "再表示",
        retry: "再試行",
        searchPlaceholder: "コネクタを検索",
        team: "Team",
      },
      description: expect.stringContaining("課題とプロジェクト"),
      provider: "linear",
      retryHint: expect.stringContaining("認可が完了しませんでした"),
      stub: expect.not.stringContaining("認可の開始は準備中です"),
      waiting: expect.stringContaining("認可を待っています"),
    });
  });

  it("does not mention infrastructure names in card copy", () => {
    const haystack = [
      LINEAR_CONNECTOR.description,
      CONNECTOR_CARD_COPY.authorizeHint,
      CONNECTOR_CARD_COPY.disconnectDetail,
      CONNECTOR_CARD_COPY.notConfigured,
      CONNECTOR_CARD_COPY.searchPlaceholder,
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
  it("uses compact rows with a cross-axis-centered CTA", () => {
    const pane = readFileSync("src/harness/rail/ConnectorsPane.tsx", "utf-8");
    const page = readFileSync("src/pages/ConnectorsPage.tsx", "utf-8");
    expect({
      actions: pane.includes("connector-row-actions"),
      brand: pane.includes("LINEAR_BRAND_MARK_PATH"),
      cards: pane.includes("primitive-card-bar"),
      centered: pane.includes("flex items-center gap-3"),
      plug: /\bUnplug\b|\bPlug\b/.test(pane),
      row: pane.includes("connector-marketplace-row"),
      search: page.includes("searchPlaceholder"),
      searchType: page.includes('type="search"'),
      stacked: pane.includes("items-start gap-3"),
      text: pane.includes("connector-row-text"),
    }).toStrictEqual({
      actions: true,
      brand: true,
      cards: false,
      centered: true,
      plug: false,
      row: true,
      search: true,
      searchType: true,
      stacked: false,
      text: true,
    });
  });

  it("keeps the official Linear chevron, not a generic plug", () => {
    expect(LINEAR_BRAND_MARK_PATH).toContain("M1.22541 61.5228");
    expect(LINEAR_BRAND_MARK_PATH).toContain("98.7746");
  });
});
