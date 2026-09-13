import { segmentMentions } from "@/lib/mentions";

/* ─────────────────────────────────────────────────────────
 * MENTION TEXT — plain text with every @handle painted as the
 * accent chip. One source for the message bubble and the composer
 * highlighter so the two can't drift apart.
 * ───────────────────────────────────────────────────────── */

export const MENTION_CHIP =
  "rounded-[4px] bg-accent-tint px-1 py-px font-medium text-accent-ink";

/* The composer paints this behind a transparent <textarea>, so a chip
 * must not change the text's advance width: the padding is cancelled by
 * equal negative margins and the weight stays regular so the native
 * caret and selection keep lining up with the glyphs underneath. */
const MENTION_CHIP_OVERLAY =
  "-mx-1 rounded-[4px] bg-accent-tint px-1 py-px text-accent-ink [box-decoration-break:clone]";

export function MentionText({
  text,
  overlay = false,
}: {
  text: string;
  overlay?: boolean;
}) {
  const chip = overlay ? MENTION_CHIP_OVERLAY : MENTION_CHIP;
  return (
    <>
      {segmentMentions(text).map((segment, i) =>
        segment.kind === "mention" ? (
          <span key={i} className={chip}>
            {segment.value}
          </span>
        ) : (
          <span key={i}>{segment.value}</span>
        )
      )}
    </>
  );
}
