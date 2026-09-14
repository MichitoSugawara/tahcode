import { Search, X } from "lucide-react";
import { useState } from "react";

import { useOrg } from "@/harness/OrgContext";
import { ConnectorsPane } from "@/harness/rail/ConnectorsPane";
import { CONNECTOR_CARD_COPY } from "@/lib/connectorCard";
import { useDocumentTitle } from "@/lib/title";

/* ─────────────────────────────────────────────────────────
 * CONNECTORS — dedicated marketplace surface (not Settings).
 * Grok Bot Plugins overlay: search + dense rows
 * (icon | name+desc | right CTA), not padded cards.
 * ───────────────────────────────────────────────────────── */
export default function ConnectorsPage() {
  const { org } = useOrg();
  const [query, setQuery] = useState("");
  useDocumentTitle("コネクタ", org.name);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto flex w-full max-w-[1040px] flex-col gap-5 px-4 py-8 sm:px-8">
        <header
          style={{
            animation: "fade-up 400ms cubic-bezier(0.23,1,0.32,1) both",
          }}
        >
          <h1 className="text-ink text-[22px] font-normal tracking-[-0.02em]">
            連携
          </h1>
          <p className="text-ink-3 mt-1 max-w-[42rem] text-[13px] leading-relaxed">
            Linear などのサービスをこの org に接続します。追加と認可は Owner /
            Admin が行います。
          </p>
        </header>

        <div
          style={{
            animation: "fade-up 400ms cubic-bezier(0.23,1,0.32,1) 40ms both",
          }}
        >
          <label className="bg-field shadow-hairline flex h-10 items-center gap-2 rounded-full px-3.5 transition-[box-shadow] duration-150 focus-within:shadow-[0_0_0_1px_var(--line-strong)]">
            <Search size={15} className="text-ink-3 shrink-0" aria-hidden />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={CONNECTOR_CARD_COPY.searchPlaceholder}
              aria-label={CONNECTOR_CARD_COPY.searchAria}
              className="text-ink placeholder:text-ink-3 min-w-0 flex-1 bg-transparent text-[13.5px] outline-none"
            />
            {query ? (
              <button
                type="button"
                aria-label="検索をクリア"
                onClick={() => setQuery("")}
                className="text-ink-3 hover:bg-hover-2 hover:text-ink flex size-6 items-center justify-center rounded-full transition-colors duration-100"
              >
                <X size={12} strokeWidth={2.2} />
              </button>
            ) : null}
          </label>
        </div>

        <section
          style={{
            animation: "fade-up 400ms cubic-bezier(0.23,1,0.32,1) 80ms both",
          }}
        >
          <h2 className="text-ink mb-2 text-[13px] font-medium">コネクタ</h2>
          <ConnectorsPane searchQuery={query} />
        </section>
      </div>
    </div>
  );
}
