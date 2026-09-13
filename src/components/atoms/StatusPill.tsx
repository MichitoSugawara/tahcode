import { cva } from "class-variance-authority";
import type { VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const statusPillVariants = cva(
  "inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-[13px] leading-none font-medium whitespace-nowrap",
  {
    defaultVariants: { tone: "neutral" },
    variants: {
      tone: {
        accent: "bg-accent-tint text-accent-ink",
        green: "bg-green-tint text-green",
        neutral: "bg-inset text-ink-2",
        orange: "bg-orange-tint text-orange",
        red: "bg-red-tint text-red",
      },
    },
  }
);

type Tone = NonNullable<VariantProps<typeof statusPillVariants>["tone"]>;

/* the leading dot lives on a separate element, so its color stays a small lookup */
const dotColor: Record<Tone, string> = {
  accent: "bg-accent",
  green: "bg-green",
  neutral: "bg-ink-3",
  orange: "bg-orange",
  red: "bg-red",
};

export function StatusPill({
  tone = "neutral",
  children,
  dot = true,
  className,
}: {
  tone?: Tone;
  children: React.ReactNode;
  dot?: boolean;
  className?: string;
}) {
  return (
    <span className={cn(statusPillVariants({ tone }), className)}>
      {dot && <span className={cn("size-1.5 rounded-full", dotColor[tone])} />}
      {children}
    </span>
  );
}
