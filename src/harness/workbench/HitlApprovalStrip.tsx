import { useMutation, useQuery } from "convex/react";
import { useState } from "react";

import { Button } from "@/components/atoms/Button";

import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { HitlApprovalList } from "./HitlApprovalList";

export const HITL_DEMO_BUTTON_LABEL = "書き込みの確認を試す（実行しない）";

export function HitlApprovalStrip({ chatId }: { chatId: Id<"chats"> }) {
  const approvals = useQuery(api.toolApprovals.listForChat, { chatId });
  const requestDemo = useMutation(api.toolApprovals.requestDemo);
  const [demoBusy, setDemoBusy] = useState(false);
  const items = (approvals?.items ?? []).filter(
    (item) => item.source === "demo" || item.jobId === null
  );

  return (
    <div data-hitl-strip className="flex flex-col gap-2">
      {items.length > 0 ? <HitlApprovalList items={items} /> : null}
      <Button
        type="button"
        size="xs"
        variant="quiet"
        data-hitl-demo
        disabled={demoBusy}
        aria-label="書き込みツールの確認カードを試す。ツールは実行しません"
        onClick={() => {
          setDemoBusy(true);
          void requestDemo({ chatId }).finally(() => {
            setDemoBusy(false);
          });
        }}
      >
        {HITL_DEMO_BUTTON_LABEL}
      </Button>
    </div>
  );
}
