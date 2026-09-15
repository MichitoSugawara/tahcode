import type { ReactNode } from "react";

import { StatusPill } from "@/components/atoms/StatusPill";

export function WorkbenchEmpty({
  icon,
  title,
  children,
  action,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div
      data-workbench-empty
      className="flex min-h-0 flex-1 flex-col items-center justify-center px-5 py-8 text-center"
    >
      <div className="text-ink-3 mb-3">{icon}</div>
      <StatusPill tone="neutral" dot={false} className="mb-2.5">
        次のフェーズで接続
      </StatusPill>
      <h3 className="text-ink text-[13.5px] font-medium">{title}</h3>
      <p className="text-ink-2 mt-1.5 max-w-[260px] text-[12.5px] leading-relaxed">
        {children}
      </p>
      {action && (
        <div className="mt-3 flex flex-wrap justify-center">{action}</div>
      )}
    </div>
  );
}
