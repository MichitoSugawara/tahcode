import { Plug } from "lucide-react";

import { useOrg } from "@/harness/OrgContext";
import { ConnectorsPane } from "@/harness/rail/ConnectorsPane";
import { useDocumentTitle } from "@/lib/title";

/* ─────────────────────────────────────────────────────────
 * CONNECTORS — dedicated org surface (not a Settings section).
 * Grok Bot keeps Plugins in its own overlay (`aria-label="Plugins"`);
 * tahcode Shell already treats Settings as a full-width route, so
 * this page uses that grammar instead of nesting a Dialog over chat
 * (ConnectorsPane already opens a disconnect Dialog).
 * ───────────────────────────────────────────────────────── */
export default function ConnectorsPage() {
  const { org } = useOrg();
  useDocumentTitle("コネクタ", org.name);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto flex w-full max-w-[1040px] flex-col gap-6 px-4 py-8 sm:px-8">
        <header
          style={{
            animation: "fade-up 400ms cubic-bezier(0.23,1,0.32,1) both",
          }}
        >
          <div className="text-ink-3 flex items-center gap-2 text-[12px]">
            <Plug size={13} /> コネクタ
          </div>
          <h1 className="text-ink mt-1 text-[22px] font-normal tracking-[-0.02em]">
            連携
          </h1>
          <p className="text-ink-3 mt-1 max-w-[42rem] text-[13px] leading-relaxed">
            Linear などのサービスをこの org に接続します。追加と認可は Owner /
            Admin が行います。
          </p>
        </header>

        <section
          style={{
            animation: "fade-up 400ms cubic-bezier(0.23,1,0.32,1) 60ms both",
          }}
        >
          <ConnectorsPane />
        </section>
      </div>
    </div>
  );
}
