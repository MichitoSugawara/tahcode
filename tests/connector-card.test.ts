import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import type { ConnectorStatus } from "../shared/connectors.ts";
import {
  CONNECTOR_CARD_COPY,
  CONNECTOR_CATALOG,
  LINEAR_CONNECTOR,
  connectionMeta,
  connectorAccountCountLabel,
  connectorAccountLabel,
  connectorAccountTitle,
  connectorStatusLabel,
  connectorStatusTone,
  connectionsForProvider,
  filterConnectorCatalog,
  marketplaceConnectorPhase,
  providerIconSource,
  resolveConnectorCardPhase,
  shouldShowAddAnotherAccount,
  shouldStartOauthFromMarketplace,
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

describe(connectionsForProvider, () => {
  it("lists every Linear account for the detail screen", () => {
    const rows = [
      { provider: "linear", scope: "user" as const },
      { provider: "linear", scope: "org" as const },
      { provider: "github", scope: "org" as const },
    ];
    expect(connectionsForProvider(rows, "linear")).toStrictEqual([
      { provider: "linear", scope: "user" },
      { provider: "linear", scope: "org" },
    ]);
  });
});

describe(connectorAccountTitle, () => {
  it("matches Grok @linear titles: Linear and Linear (pottos)", () => {
    expect({
      bare: connectorAccountTitle("Linear"),
      defaultLabel: connectorAccountTitle("Linear", "default"),
      redundant: connectorAccountTitle("Linear", "Linear"),
      pottos: connectorAccountTitle("Linear", "pottos"),
    }).toStrictEqual({
      bare: "Linear",
      defaultLabel: "Linear",
      redundant: "Linear",
      pottos: "Linear (pottos)",
    });
    expect(connectorAccountLabel()).toBe("アカウント");
    expect(connectorAccountLabel("pottos")).toBe("pottos");
    expect(connectorAccountCountLabel(2)).toBe("2アカウント");
    expect(marketplaceConnectorPhase(["connected", "needsAuth"])).toBe(
      "connected"
    );
  });
});

describe("first Linear connect CTAs", () => {
  it("starts OAuth at zero rows and shows add-another only after a connected account", () => {
    expect({
      emptyStartsOauth: shouldStartOauthFromMarketplace([]),
      needsAuthOpensDetail: shouldStartOauthFromMarketplace([
        { status: "needsAuth" },
      ]),
      emptyHidesAddAnother: shouldShowAddAnotherAccount([]),
      needsAuthHidesAddAnother: shouldShowAddAnotherAccount([
        { status: "needsAuth" },
      ]),
      connectedShowsAddAnother: shouldShowAddAnotherAccount([
        { status: "needsAuth" },
        { status: "connected" },
      ]),
    }).toStrictEqual({
      emptyStartsOauth: true,
      needsAuthOpensDetail: false,
      emptyHidesAddAnother: false,
      needsAuthHidesAddAnother: false,
      connectedShowsAddAnother: true,
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
      accounts: "アカウント",
      add: "追加",
      addAnotherAccount: "+ 別のアカウントを追加",
      authorize: "認証",
      authorizeHint: expect.stringContaining("Linear に移動"),
      connected: "接続済み",
      disconnect: "切断",
      remove: "削除",
      rename: "名前を変更",
      needsAuth: "認証が必要",
      notConfigured: "認証を開始できません。管理者に連絡してください。",
      reopen: "再表示",
      retry: "再試行",
      searchLabel: "コネクタを検索",
      team: "Team",
      chatMemberHint: "Team 連携の認証は Owner / Admin が行います。",
    });
    expect(JSON.stringify(CONNECTOR_CARD_COPY)).not.toContain(
      "認可の開始は準備中です"
    );
    expect({
      intro: CONNECTOR_CARD_COPY.chatIntro("Linear"),
      retry: CONNECTOR_CARD_COPY.retryHint("Linear"),
      waiting: CONNECTOR_CARD_COPY.waiting("Linear"),
    }).toStrictEqual({
      intro: expect.stringContaining("この org"),
      retry: expect.stringContaining("認証が完了しませんでした"),
      waiting: expect.stringContaining("認証を待っています"),
    });
  });

  it("does not mention infrastructure names in card copy", () => {
    const haystack = [
      LINEAR_CONNECTOR.description,
      CONNECTOR_CARD_COPY.authorizeHint,
      CONNECTOR_CARD_COPY.disconnectDetail,
      CONNECTOR_CARD_COPY.addAnotherAccount,
      CONNECTOR_CARD_COPY.notConfigured,
      CONNECTOR_CARD_COPY.removeAccount("pottos"),
      CONNECTOR_CARD_COPY.removeDetail,
      CONNECTOR_CARD_COPY.searchLabel,
      CONNECTOR_CARD_COPY.chatIntro("Linear"),
      CONNECTOR_CARD_COPY.chatIntroUser("Linear"),
      CONNECTOR_CARD_COPY.chatMemberHint,
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
      needsAuth: { label: "認証が必要", tone: "orange" },
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
    const card = readFileSync(
      "src/harness/connectors/LinearConnectorCard.tsx",
      "utf-8"
    );
    const pane = readFileSync("src/harness/rail/ConnectorsPane.tsx", "utf-8");
    const page = readFileSync("src/pages/ConnectorsPage.tsx", "utf-8");
    const haystack = `${card}\n${pane}`;
    expect({
      actions: haystack.includes("connector-card-actions"),
      assign: haystack.includes("location.assign"),
      centered: haystack.includes("flex items-center gap-3"),
      complete: haystack.includes("completeLinearConnect"),
      accounts: haystack.includes("connector-detail-accounts"),
      addAnother: haystack.includes("shouldShowAddAnotherAccount"),
      firstOauth: haystack.includes("shouldStartOauthFromMarketplace"),
      rename: haystack.includes("connectorConnections.rename"),
      remove: haystack.includes("connectorConnections.remove"),
      pencil: haystack.includes("Pencil"),
      trash: haystack.includes("Trash2"),
      grok:
        haystack.includes("sand-connector-card__header") ||
        haystack.includes("connector-detail-accounts"),
      icon: haystack.includes("providerIconSource"),
      row: haystack.includes("connector-marketplace-row"),
      search: page.includes(CONNECTOR_CARD_COPY.searchLabel),
      text: haystack.includes("connector-card-text"),
    }).toStrictEqual({
      accounts: true,
      actions: true,
      addAnother: true,
      firstOauth: true,
      assign: true,
      pencil: true,
      remove: true,
      trash: true,
      rename: true,
      centered: true,
      complete: true,
      grok: true,
      icon: true,
      row: true,
      search: true,
      text: true,
    });
    expect(haystack).not.toContain("extras.map");
    expect(haystack).not.toContain("partitionConnectorConnections");
    expect({
      banned: /OpenConnector|OOMOL|workers\.dev|gateway/i.test(haystack),
      homemade: /M1\.22541|#5E6AD2|LINEAR_MARK_PATH|LinearMark/.test(haystack),
      paddedCard: /rounded-card bg-surface shadow-card/.test(haystack),
      stackedCta: /flex flex-col gap-2 px-3 py-2\.5/.test(haystack),
    }).toStrictEqual({
      banned: false,
      homemade: false,
      paddedCard: false,
      stackedCta: false,
    });
  });

  it("uses a red trash control for one-row account delete", () => {
    const card = readFileSync(
      "src/harness/connectors/LinearConnectorCard.tsx",
      "utf-8"
    );
    expect({
      confirmRemove: card.includes("CONNECTOR_CARD_COPY.remove"),
      label: CONNECTOR_CARD_COPY.removeAccount("pottos"),
      redTrash: card.includes("text-red") && card.includes("Trash2"),
      removeAccount: card.includes("CONNECTOR_CARD_COPY.removeAccount"),
    }).toStrictEqual({
      confirmRemove: true,
      label: "pottos を削除",
      redTrash: true,
      removeAccount: true,
    });
  });
});

describe("chat-inline connector card", () => {
  it("mounts the shared Linear card from a structured message attachment", () => {
    const thread = readFileSync("src/harness/thread/Thread.tsx", "utf-8");
    const composer = readFileSync("src/harness/Composer.tsx", "utf-8");
    const card = readFileSync(
      "src/harness/connectors/LinearConnectorCard.tsx",
      "utf-8"
    );
    expect({
      attachment: thread.includes("firstConnectorCardAttachment"),
      chatRow: card.includes("connector-chat-card"),
      mount: thread.includes('variant="chat"'),
      slash: composer.includes('name: "/connect"'),
      tool: composer.includes("suggestConnector"),
    }).toStrictEqual({
      attachment: true,
      chatRow: true,
      mount: true,
      slash: true,
      tool: true,
    });
  });
});
