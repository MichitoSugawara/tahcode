import { Search } from "lucide-react";
import { useState } from "react";

import { useOrg } from "@/harness/OrgContext";
import { ConnectorsPane } from "@/harness/rail/ConnectorsPane";
import { CONNECTOR_CARD_COPY } from "@/lib/connectorCard";
import { useDocumentTitle } from "@/lib/title";

/* ─────────────────────────────────────────────────────────
 * CONNECTORS — dedicated org surface (not a Settings section).
 * Marketplace-style: search + compact rows, Grok Bot grammar.
 * ───────────────────────────────────────────────────────── */
export default function ConnectorsPage() {
  const { org } = useOrg();
  const [query, setQuery] = useState("");
  useDocumentTitle(CONNECTOR_CARD_COPY.surface, org.name);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto flex w-full max-w-[1040px] flex-col gap-5 px-4 py-8 sm:px-8">
        <header
          style={{
            animation: "fade-up 400ms cubic-bezier(0.23,1,0.32,1) both",
          }}
        >
          <h1 className="text-ink text-[22px] font-normal tracking-[-0.02em]">
            {CONNECTOR_CARD_COPY.surface}
          </h1>
          <p className="text-ink-3 mt-1 max-w-[42rem] text-[13px] leading-relaxed">
            Linear や GitHub などのサービスをこの org に接続します。追加と認証は
            Owner / Admin が行います。
          </p>
        </header>

        <label
          className="bg-field text-ink-3 shadow-hairline focus-within:text-ink-2 flex h-10 items-center gap-2 rounded-full px-3.5"
          style={{
            animation: "fade-up 400ms cubic-bezier(0.23,1,0.32,1) 40ms both",
          }}
        >
          <Search size={15} aria-hidden />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={CONNECTOR_CARD_COPY.searchLabel}
            aria-label={CONNECTOR_CARD_COPY.searchLabel}
            className="text-ink placeholder:text-ink-3 min-w-0 flex-1 bg-transparent text-[13px] outline-none"
          />
        </label>

        <section
          style={{
            animation: "fade-up 400ms cubic-bezier(0.23,1,0.32,1) 80ms both",
          }}
        >
          <ConnectorsPane query={query} />
        </section>
      </div>
    </div>
  );
}
