/** Wordmark: a green square with the harness glyph + "Team Harness". */
export function Brand({ size = "md" }: { size?: "md" | "lg" }) {
  const box = size === "lg" ? "size-8 rounded-[9px]" : "size-6 rounded-[7px]";
  const text = size === "lg" ? "text-[15px]" : "text-[13.5px]";
  return (
    <span className="inline-flex items-center gap-2.5">
      <span className={`flex ${box} items-center justify-center bg-accent text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.18)]`}>
        <svg width={size === "lg" ? 18 : 14} height={size === "lg" ? 18 : 14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M4 7h16M4 12h10M4 17h7" />
          <circle cx="18" cy="16" r="2.5" />
        </svg>
      </span>
      <span className={`${text} font-semibold tracking-[-0.01em] text-ink`}>Team Harness</span>
      <span className="rounded-full bg-accent-tint px-1.5 py-px text-[10.5px] font-medium text-accent-ink">Phase 1</span>
    </span>
  );
}
