import { AlertTriangle, Info, Lock, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";

type Tone = "info" | "warn" | "success" | "locked";

const TONES: Record<Tone, { box: string; icon: ReactNode }> = {
  info: {
    box: "bg-inset text-ink-2 shadow-hairline",
    icon: <Info size={14} />,
  },
  locked: {
    box: "bg-inset text-ink-2 shadow-hairline",
    icon: <Lock size={14} />,
  },
  success: { box: "bg-green-tint text-green", icon: <ShieldCheck size={14} /> },
  warn: {
    box: "bg-orange-tint text-orange",
    icon: <AlertTriangle size={14} />,
  },
};

/** Quiet inline callout — used for permission dead-ends and one-time secrets. */
export function Notice({
  tone = "info",
  title,
  children,
  action,
  className = "",
}: {
  tone?: Tone;
  title?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  const t = TONES[tone];
  return (
    <div
      className={`rounded-card flex items-start gap-2.5 px-3 py-2.5 text-[12.5px] leading-relaxed ${t.box} ${className}`}
      style={{ animation: "fade-in 200ms ease-out both" }}
    >
      <span className="mt-[3px] shrink-0">{t.icon}</span>
      <div className="min-w-0 flex-1">
        {title && (
          <div
            className={`font-medium ${tone === "info" || tone === "locked" ? "text-ink" : ""}`}
          >
            {title}
          </div>
        )}
        {children && <div className={title ? "mt-0.5" : ""}>{children}</div>}
        {action && <div className="mt-2 flex flex-wrap gap-2">{action}</div>}
      </div>
    </div>
  );
}
