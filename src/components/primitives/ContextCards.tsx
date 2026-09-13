"use client";

import { useEffect, useState } from "react";

/* ─────────────────────────────────────────────────────────
 * CONTEXT CARDS
 * Retrieved chunks enter once, then remain available.
 * ───────────────────────────────────────────────────────── */

export interface ContextChunk {
  title: string;
  chars: string;
  body: string;
  source: string;
  badge: string;
  tone: string;
}

export interface ContextCardsLabels {
  header: string;
  count: string;
}

const DEFAULT_LABELS: ContextCardsLabels = {
  count: "32",
  header: "All chunks",
};

const CHUNKS: ContextChunk[] = [
  {
    badge: "PDF",
    body: "Cold-chain certification must be verified before a new dairy can be added to the reorder workflow.",
    chars: "290 characters",
    source: "Dairy Onboarding SOP.pdf",
    title: "Vendor onboarding rule",
    tone: "bg-red",
  },
  {
    badge: "CSV",
    body: "Q4 velocity table: pistachio +18%, vanilla +6%, rocky road -11%; retire flavors below 40 scoops weekly.",
    chars: "1,250 characters",
    source: "Sales Velocity Export.csv",
    title: "Seasonal demand row",
    tone: "bg-green",
  },
];

export default function ContextCards({
  chunks = CHUNKS,
  labels,
  className,
}: {
  /** Accepted for gallery/registry parity; ContextCards has no visual variants. */
  variant?: string;
  chunks?: ContextChunk[];
  labels?: Partial<ContextCardsLabels>;
  className?: string;
} = {}) {
  const [chipsShown, setChipsShown] = useState(false);
  const copy = { ...DEFAULT_LABELS, ...labels };

  useEffect(() => {
    const chips = setTimeout(() => setChipsShown(true), 700);
    return () => clearTimeout(chips);
  }, []);

  return (
    <div
      className={`flex w-full max-w-95 flex-col gap-2${className ? ` ${className}` : ""}`}
    >
      <div
        className="flex items-center gap-2 px-0.5"
        style={{ animation: "fade-in 400ms ease-out both" }}
      >
        <span className="text-ink text-[13px] font-semibold">
          {copy.header}
        </span>
        <span className="bg-inset text-ink-2 shadow-hairline inline-flex h-5 items-center rounded-md px-1.5 text-[11.5px] font-medium tabular-nums">
          {copy.count}
        </span>
      </div>

      {chunks.map((chunk, i) => (
        <div
          key={chunk.title}
          className="rounded-card bg-surface shadow-card overflow-hidden"
          style={{
            animation: `fade-up 400ms cubic-bezier(0.23,1,0.32,1) ${i * 100}ms both`,
          }}
        >
          <div className="primitive-card-bar border-line flex items-center gap-2.5 border-b">
            <span className="text-ink flex min-w-0 items-center gap-1.5 text-[13px] font-medium">
              <svg
                width="11"
                height="11"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
              >
                <path d="M4 6h16M4 12h16M4 18h10" />
              </svg>
              <span className="truncate">{chunk.title}</span>
            </span>
            <span className="text-ink-3 ml-auto shrink-0 text-[12px] tabular-nums">
              {chunk.chars}
            </span>
          </div>
          <p className="text-ink-2 px-3 pt-2 pb-1 text-[12.5px] leading-relaxed">
            {chunk.body}
          </p>
          <div className="px-3 pb-3">
            <span
              className="bg-inset text-ink-2 shadow-btn hover:bg-hover inline-flex h-6 items-center gap-1.5 rounded-full px-2 text-[12px] font-medium transition-[opacity,transform,background-color] duration-300"
              style={{
                opacity: chipsShown ? 1 : 0,
                transform: chipsShown ? "scale(1)" : "scale(0.95)",
                transitionDelay: `${i * 80}ms`,
                transitionTimingFunction: "cubic-bezier(0.23, 1, 0.32, 1)",
              }}
            >
              <span
                className={`flex size-3.5 items-center justify-center rounded-[4px] ${chunk.tone} text-[7px] font-bold text-white`}
              >
                {chunk.badge}
              </span>
              {chunk.source}
              <svg
                width="9"
                height="9"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M7 17L17 7M7 7h10v10" />
              </svg>
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
