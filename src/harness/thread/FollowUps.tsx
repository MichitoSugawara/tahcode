import { CornerDownLeft } from "lucide-react";

/* StreamingText's follow-up prompts, lifted out so they can trail any settled
 * reply: a quiet heading, then rows that fade up in sequence. */
export function FollowUps({ label = "続けて聞く", prompts, onPick }: { label?: string; prompts: string[]; onPick: (text: string) => void }) {
  if (prompts.length === 0) return null;
  return (
    <div className="mt-3" style={{ animation: "fade-in 300ms ease-out both" }}>
      <p className="text-[12px] font-medium text-ink-2">{label}</p>
      <div className="mt-0.5 flex flex-col">
        {prompts.map((text, i) => (
          <button
            key={text}
            type="button"
            onClick={() => onPick(text)}
            className="-mx-1.5 flex items-center gap-2 rounded-[7px] border-b border-line px-1.5 py-1.5 text-left text-[12.5px] text-ink transition-colors duration-100 hover:bg-hover-2"
            style={{ animation: `fade-up 350ms cubic-bezier(0.23,1,0.32,1) ${i * 90}ms both` }}
          >
            <CornerDownLeft size={11} className="shrink-0 text-ink-3" />
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}
