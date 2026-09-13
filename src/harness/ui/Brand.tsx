/** Wordmark: a green square with a bold "t" + "tahcode" (team agent harness). */
export function Brand({
  size = "md",
  mark = true,
}: {
  size?: "md" | "lg";
  mark?: boolean;
}) {
  const box =
    size === "lg"
      ? "size-8 rounded-[9px] text-[17px]"
      : "size-6 rounded-[7px] text-[13px]";
  const text = size === "lg" ? "text-[16px]" : "text-[13.5px]";
  return (
    <span className="inline-flex items-center gap-2.5">
      {mark && (
        <span
          className={`flex ${box} bg-accent items-center justify-center leading-none font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.18)]`}
          aria-hidden
        >
          t
        </span>
      )}
      <span className={`${text} text-ink font-semibold tracking-[-0.02em]`}>
        tahcode
      </span>
      <span className="bg-accent-tint text-accent-ink rounded-full px-1.5 py-px text-[10.5px] font-medium">
        Phase 1
      </span>
    </span>
  );
}