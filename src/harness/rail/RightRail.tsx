import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";

import { SegmentedControl } from "@/components/atoms/SegmentedControl";

import { ContextPane } from "./ContextPane";
import { RuntimePane } from "./RuntimePane";
import { TeamPane } from "./TeamPane";

export type RailTab = "Context" | "Runtime" | "Team";
const TABS = ["Context", "Runtime", "Team"] as const;

/* The docked artifact pane from the harness, with three durable tabs
 * instead of per-answer artifacts: what the agent will see, where it
 * will run, and who is in the room. */
export function RightRail({
  defaultTab = "Context",
  onClose,
}: {
  defaultTab?: RailTab;
  onClose?: () => void;
}) {
  const { chatId } = useParams();
  const [tab, setTab] = useState<RailTab>(defaultTab);
  useEffect(() => setTab(defaultTab), [defaultTab, chatId]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-line flex h-11 shrink-0 items-center justify-between gap-2 border-b px-2.5">
        <SegmentedControl
          options={TABS}
          value={tab}
          onChange={setTab}
          className="h-7 text-[12.5px]"
        />
        {onClose && (
          <button
            type="button"
            aria-label="閉じる"
            onClick={onClose}
            className="text-ink-3 hover:bg-hover hover:text-ink flex size-6 items-center justify-center rounded-[6px] transition-colors duration-100"
          >
            <X size={13} strokeWidth={2.2} />
          </button>
        )}
      </div>
      <div
        className="min-h-0 flex-1 overflow-y-auto p-4"
        key={tab}
        style={{ animation: "fade-in 160ms ease-out both" }}
      >
        {tab === "Context" && <ContextPane chatId={chatId} />}
        {tab === "Runtime" && <RuntimePane />}
        {tab === "Team" && <TeamPane />}
      </div>
    </div>
  );
}
