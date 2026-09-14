import { LinearConnectorCard } from "@/harness/connectors/LinearConnectorCard";
import {
  CONNECTOR_CARD_COPY,
  CONNECTOR_CATALOG,
  LINEAR_CONNECTOR,
  filterConnectorCatalog,
} from "@/lib/connectorCard";

/* ─────────────────────────────────────────────────────────
 * CONNECTORS PANE — marketplace search + Linear card.
 * Account Add / Authorize / Waiting / Connected lives in
 * LinearConnectorCard (shared with the chat timeline).
 * ───────────────────────────────────────────────────────── */
export function ConnectorsPane({ query = "" }: { query?: string }) {
  const visibleCatalog = filterConnectorCatalog(CONNECTOR_CATALOG, query);
  const showLinear = visibleCatalog.some(
    (entry) => entry.provider === LINEAR_CONNECTOR.provider
  );

  return (
    <div className="flex flex-col gap-2">
      {visibleCatalog.length === 0 ? (
        <p className="text-ink-3 py-6 text-center text-[13px]">
          {CONNECTOR_CARD_COPY.emptySearch}
        </p>
      ) : null}
      {showLinear ? <LinearConnectorCard /> : null}
    </div>
  );
}
