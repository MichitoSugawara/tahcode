import { useMutation } from "convex/react";
import { useState } from "react";

import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { HitlApprovalCard } from "./HitlApprovalCard";
import type { HitlApprovalItem } from "./HitlApprovalCard";

export function HitlApprovalList({
  items,
}: {
  items: readonly HitlApprovalItem[];
}) {
  const decide = useMutation(api.toolApprovals.decide);
  const [busyId, setBusyId] = useState<string | null>(null);

  if (items.length === 0) {
    return null;
  }

  return (
    <div data-hitl-list className="flex flex-col gap-2">
      {items.map((item) => (
        <HitlApprovalCard
          key={item._id}
          item={item}
          busy={busyId === item._id}
          onDecide={(decision) => {
            setBusyId(item._id);
            void decide({
              approvalId: item._id as Id<"toolApprovals">,
              decision,
            }).finally(() => {
              setBusyId((current) => (current === item._id ? null : current));
            });
          }}
        />
      ))}
    </div>
  );
}
