/** Wordmark: a green square with a bold "d" + "dalecode". */
export function Brand({ size = "md", mark = true }: { size?: "md" | "lg"; mark?: boolean }) {
  const box = size === "lg" ? "size-8 rounded-[9px] text-[17px]" : "size-6 rounded-[7px] text-[13px]";
  const text = size === "lg" ? "text-[16px]" : "text-[13.5px]";
  return (
    <span className="inline-flex items-center gap-2.5">
      {mark && (
        <span className={`flex ${box} items-center justify-center bg-accent font-semibold leading-none text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.18)]`} aria-hidden>
          d
        </span>
      )}
      <span className={`${text} font-semibold tracking-[-0.02em] text-ink`}>dalecode</span>
      <span className="rounded-full bg-accent-tint px-1.5 py-px text-[10.5px] font-medium text-accent-ink">Phase 1</span>
    </span>
  );
}

/** Just the mark, for tight spots (sidebar rail, favicon-like uses). */
export function BrandMark({ className = "size-5 rounded-[6px] text-[11px]" }: { className?: string }) {
  return (
    <span className={`flex ${className} items-center justify-center bg-accent font-semibold leading-none text-white`} aria-hidden>
      d
    </span>
  );
}
