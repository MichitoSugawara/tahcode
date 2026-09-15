import { ArrowRight, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import type { CSSProperties, ReactNode } from "react";

import { shouldShowHeroSuggestions } from "@/lib/composerMenu";

/* ─────────────────────────────────────────────────────────
 * HOME ENTRANCE STORYBOARD (from the harness)
 *
 *  170ms   greeting rises 23px, blur 17px → 0
 *  330ms   question follows with the same reveal
 *  400ms   prompt bar resolves into place
 *  550ms   suggestions finish the sequence
 * ───────────────────────────────────────────────────────── */

const TIMING = { hello: 170, prompt: 400, question: 330, suggestions: 550 };
const REVEAL = {
  blur: 17,
  duration: 800,
  easing: "cubic-bezier(0.16, 1, 0.3, 1)",
  offsetY: 23,
};

function revealStyle(visible: boolean): CSSProperties {
  return {
    filter: visible ? "blur(0px)" : `blur(${REVEAL.blur}px)`,
    opacity: visible ? 1 : 0,
    transform: visible
      ? "translate3d(0, 0, 0)"
      : `translate3d(0, ${REVEAL.offsetY}px, 0)`,
    transition: ["opacity", "transform", "filter"]
      .map((property) => `${property} ${REVEAL.duration}ms ${REVEAL.easing}`)
      .join(", "),
  };
}

export interface Suggestion {
  key: string;
  icon: ReactNode;
  label: string;
  onClick: () => void;
}

/** Exclusive layer for the empty-hero: hide starter prompts while @ is open. */
export function useHeroComposerMenu() {
  const [composerMenuOpen, setComposerMenuOpen] = useState(false);
  return { composerMenuOpen, onSuggestMenuOpenChange: setComposerMenuOpen };
}

export function EmptyHero({
  greeting,
  question,
  composer,
  afterComposer,
  align = "start",
  composerMenuOpen = false,
  suggestions,
  onShuffle,
  link,
  replayKey,
}: {
  greeting?: string;
  question: ReactNode;
  composer: ReactNode;
  afterComposer?: ReactNode;
  align?: "start" | "center";
  /** when the composer @ / $ menu is open, unmount starter prompts */
  composerMenuOpen?: boolean;
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

  const centered = align === "center";
  const questionVisible = greeting ? stage >= 2 : stage >= 1;

  return (
    <div className="mx-auto flex min-h-full w-full max-w-[720px] flex-col justify-center px-4 py-10 sm:px-8">
      <h1
        className={`text-ink font-normal tracking-[-0.02em] ${
          centered ? "text-center text-[28px]" : "text-[26px]"
        }`}
      >
        {greeting ? (
          <span
            className="home-reveal text-ink-3 block"
            style={revealStyle(stage >= 1)}
          >
            {greeting}
          </span>
        ) : null}
        <span
          className="home-reveal block"
          style={revealStyle(questionVisible)}
        >
          {question}
        </span>
      </h1>

      <div
        className="home-reveal relative mt-7"
        style={revealStyle(stage >= 3)}
      >
        {composer}
        {afterComposer}
      </div>

      {shouldShowHeroSuggestions(composerMenuOpen) &&
        (suggestions.length > 0 || link || onShuffle) && (
          <div
            className="home-reveal mt-6 flex flex-col"
            style={revealStyle(stage >= 4)}
          >
            {suggestions.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={item.onClick}
                className="rounded-control text-ink hover:bg-hover -mx-2 flex items-center gap-3 px-2 py-2.5 text-left text-[14px] transition-colors duration-150"
              >
                <span className="text-ink-3 flex size-4 shrink-0 items-center justify-center">
                  {item.icon}
                </span>
                <span className="min-w-0 truncate">{item.label}</span>
              </button>
            ))}
            {(link || onShuffle) && (
              <div className="text-ink-3 mt-1 flex flex-wrap items-center gap-5 pl-0.5 text-[13px]">
                {link && (
                  <button
                    type="button"
                    onClick={link.onClick}
                    className="hover:text-ink flex items-center gap-2 py-1 transition-colors duration-150"
                  >
                    {link.label}
                    <ArrowRight size={13} />
                  </button>
                )}
                {onShuffle && (
                  <button
                    type="button"
                    onClick={onShuffle}
                    className="hover:text-ink flex items-center gap-2 py-1 transition-colors duration-150"
                  >
                    <RefreshCw size={13} />
                    候補を入れ替え
                  </button>
                )}
              </div>
            )}
          </div>
        )}
    </div>
  );
}
