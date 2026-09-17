import type { ReactNode } from "react";

import { StatusPill } from "@/components/atoms/StatusPill";

export function WorkbenchEmpty({
  icon,
  title,
  children,
  action,
  badge,
}: {
  action?: ReactNode;
  badge: string;
  children: ReactNode;
  icon: ReactNode;
  title: string;
}) {
  return (
    <div
      data-workbench-empty
      className="flex min-h-0 flex-1 flex-col items-center justify-center px-4 py-5 text-center"
    >
      <div className="text-ink-3 mb-2">{icon}</div>
      <StatusPill tone="neutral" dot={false} className="mb-1.5">
        {badge}
      </StatusPill>
      <h3 className="text-ink text-[12.5px] font-medium">{title}</h3>
      <p className="text-ink-2 mt-1 max-w-[240px] text-[12px] leading-relaxed">
        {children}
      </p>
      {action && (
        <div className="mt-2.5 flex flex-wrap justify-center">{action}</div>
      )}
    </div>
  );
}
