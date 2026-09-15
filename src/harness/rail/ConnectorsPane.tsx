import { ConnectorProviderCard } from "@/harness/connectors/LinearConnectorCard";
import { useOrg } from "@/harness/OrgContext";
import { Notice } from "@/harness/ui/Notice";
import {
  CONNECTOR_CARD_COPY,
  CONNECTOR_CATALOG,
  filterConnectorCatalog,
} from "@/lib/connectorCard";

/* ─────────────────────────────────────────────────────────
 * CONNECTORS PANE — marketplace search + catalog cards.
 * Account Add / Authorize / Waiting / Connected lives in
 * ConnectorProviderCard (shared with the chat timeline).
 * ───────────────────────────────────────────────────────── */
export function ConnectorsPane({ query = "" }: { query?: string }) {
  const { isAdmin } = useOrg();
  const visibleCatalog = filterConnectorCatalog(CONNECTOR_CATALOG, query);

  return (
    <div className="flex flex-col gap-2">
      {visibleCatalog.length === 0 ? (
        <p className="text-ink-3 py-6 text-center text-[13px]">
          {CONNECTOR_CARD_COPY.emptySearch}
        </p>
      ) : (
        <div className="connector-marketplace grid grid-cols-1 gap-x-12 md:grid-cols-2">
          {visibleCatalog.map((entry) => (
            <ConnectorProviderCard
              key={entry.provider}
              catalog={entry}
              variant="marketplace"
            />
          ))}
        </div>
      )}
      {isAdmin ? null : (
        <Notice
          tone="locked"
          title="Org 連携の追加と切断は Owner / Admin の操作です"
        >
          あなたは Member です。接続状態は見られますが、Team
          連携の認証はできません。
        </Notice>
      )}
    </div>
  );
}
