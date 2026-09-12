import { ArrowRight, RefreshCw } from "lucide-react";
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";

/* ─────────────────────────────────────────────────────────
 * HOME ENTRANCE STORYBOARD (from the harness)
 *
 *  170ms   greeting rises 23px, blur 17px → 0
 *  330ms   question follows with the same reveal
 *  400ms   prompt bar resolves into place
 *  550ms   suggestions finish the sequence
 * ───────────────────────────────────────────────────────── */

const TIMING = { hello: 170, question: 330, prompt: 400, suggestions: 550 };
const REVEAL = { offsetY: 23, blur: 17, duration: 800, easing: "cubic-bezier(0.16, 1, 0.3, 1)" };

function revealStyle(visible: boolean): CSSProperties {
  return {
    opacity: visible ? 1 : 0,
    transform: visible ? "translate3d(0, 0, 0)" : `translate3d(0, ${REVEAL.offsetY}px, 0)`,
    filter: visible ? "blur(0px)" : `blur(${REVEAL.blur}px)`,
    transition: ["opacity", "transform", "filter"].map((property) => `${property} ${REVEAL.duration}ms ${REVEAL.easing}`).join(", "),
  };
}

export type Suggestion = { key: string; icon: ReactNode; label: string; onClick: () => void };

export function EmptyHero({
  greeting,
  question,
  composer,
  suggestions,
  onShuffle,
  link,
  replayKey,
}: {
  greeting: string;
  question: string;
  composer: ReactNode;
  suggestions: Suggestion[];
  onShuffle?: () => void;
  link?: { label: string; onClick: () => void };
  replayKey?: string;
}) {
  const [stage, setStage] = useState(0);
  useEffect(() => {
    setStage(0);
    const timers = [
      setTimeout(() => setStage(1), TIMING.hello),
      setTimeout(() => setStage(2), TIMING.question),
      setTimeout(() => setStage(3), TIMING.prompt),
      setTimeout(() => setStage(4), TIMING.suggestions),
    ];
    return () => timers.forEach(clearTimeout);
  }, [replayKey]);

  return (
    <div className="mx-auto flex min-h-full w-full max-w-[720px] flex-col justify-center px-4 py-10 sm:px-8">
      <h1 className="text-[26px] font-normal tracking-[-0.02em] text-ink">
        <span className="home-reveal block text-ink-3" style={revealStyle(stage >= 1)}>
          {greeting}
        </span>
        <span className="home-reveal block" style={revealStyle(stage >= 2)}>
          {question}
        </span>
      </h1>

      <div className="home-reveal relative mt-7" style={revealStyle(stage >= 3)}>
        {composer}
      </div>

      <div className="home-reveal mt-6 flex flex-col" style={revealStyle(stage >= 4)}>
        {suggestions.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={item.onClick}
            className="-mx-2 flex items-center gap-3 rounded-control px-2 py-2.5 text-left text-[14px] text-ink transition-colors duration-150 hover:bg-hover"
          >
            <span className="flex size-4 shrink-0 items-center justify-center text-ink-3">{item.icon}</span>
            <span className="min-w-0 truncate">{item.label}</span>
          </button>
        ))}
        {(link || onShuffle) && (
          <div className="mt-1 flex flex-wrap items-center gap-5 pl-0.5 text-[13px] text-ink-3">
            {link && (
              <button type="button" onClick={link.onClick} className="flex items-center gap-2 py-1 transition-colors duration-150 hover:text-ink">
                {link.label}
                <ArrowRight size={13} />
              </button>
            )}
            {onShuffle && (
              <button type="button" onClick={onShuffle} className="flex items-center gap-2 py-1 transition-colors duration-150 hover:text-ink">
                <RefreshCw size={13} />
                候補を入れ替え
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
