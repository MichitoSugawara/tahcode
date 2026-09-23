import { ShieldAlert } from "lucide-react";

import { Button } from "@/components/atoms/Button";
import { StatusPill } from "@/components/atoms/StatusPill";

export type HitlApprovalItem = {
  _id: string;
  argsPreview: string;
  executedAt: number | null;
  name: string;
  source: "job" | "demo";
  status: "pending" | "approved" | "rejected" | "cancelled";
  summary: string;
  title: string;
};

const STATUS_COPY: Record<
  HitlApprovalItem["status"],
  { pill: string; tone: "orange" | "green" | "red" | "neutral" }
> = {
  approved: { pill: "承認済み", tone: "green" },
  cancelled: { pill: "キャンセル", tone: "neutral" },
  pending: { pill: "確認待ち", tone: "orange" },
  rejected: { pill: "拒否", tone: "red" },
};

function outcomeCopy(item: HitlApprovalItem): string {
  if (item.status === "pending") {
    return "この操作は承認するまで実行しません。";
  }
  if (item.status === "rejected") {
    return "拒否しました。実行していません。";
  }
  if (item.status === "cancelled") {
    return "ジョブが終わったため、この確認は取り消されました。実行していません。";
  }
  if (item.source === "demo") {
    return "承認しました。試用のためツールは実行していません。";
  }
  if (item.executedAt) {
    return "承認済みです。実行が完了しています。";
  }
  return "承認しました。ブリッジが実行します。";
}

export function HitlApprovalCard({
  busy,
  item,
  onDecide,
}: {
  busy?: boolean;
  item: HitlApprovalItem;
  onDecide?: (decision: "approved" | "rejected") => void;
}) {
  const status = STATUS_COPY[item.status];
  const pending = item.status === "pending";

  return (
    <article
      data-hitl-card
      data-hitl-source={item.source}
      data-hitl-status={item.status}
      className="bg-surface shadow-hairline rounded-card px-3 py-2.5"
    >
      <header className="mb-1.5 flex items-start gap-2">
        <ShieldAlert
          size={14}
          className="text-orange mt-0.5 shrink-0"
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <h3 className="text-ink text-[12.5px] font-medium">{item.title}</h3>
            <StatusPill tone={status.tone} className="h-5 px-2 text-[11px]">
              {status.pill}
            </StatusPill>
          </div>
          <p className="text-ink-2 mt-1 text-[12px] leading-relaxed">
            {outcomeCopy(item)}
          </p>
        </div>
      </header>
      {item.argsPreview ? (
        <p className="text-ink-3 mb-2 font-mono text-[11px] leading-relaxed break-all">
          {item.argsPreview}
        </p>
      ) : null}
      {pending && onDecide ? (
        <div className="flex flex-wrap gap-1.5">
          <Button
            type="button"
            size="xs"
            variant="accent"
            disabled={busy}
            aria-label={`${item.title}を承認して実行`}
            onClick={() => onDecide("approved")}
          >
            承認して実行
          </Button>
          <Button
            type="button"
            size="xs"
            variant="danger"
            disabled={busy}
            aria-label={`${item.title}を拒否する`}
            onClick={() => onDecide("rejected")}
          >
            拒否する
          </Button>
        </div>
      ) : null}
    </article>
  );
}
