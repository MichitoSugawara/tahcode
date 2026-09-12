import { Search, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import GlideMenu from "@/components/primitives/GlideMenu";

/* ─────────────────────────────────────────────────────────
 * SEARCH — ported from Beautiful UI (beautifului.dev/r/search)
 * Command search with live filtering. The field, clear action,
 * and results are directly usable.
 *
 * Changes from the registry copy: items carry icons, hints, and
 * an onSelect; ↑↓ + Enter keyboard navigation; the active row
 * shares the gliding highlight; lucide glyphs.
 * ───────────────────────────────────────────────────────── */

export type SearchItem = {
  key: string;
  label: string;
  hint?: string;
  icon?: ReactNode;
  keywords?: string;
  onSelect: () => void;
};

export type SearchListLabels = {
  placeholder: string;
  ariaLabel: string;
  emptyTitle: string;
  emptyHint: string;
};

const LABELS: SearchListLabels = {
  placeholder: "検索…",
  ariaLabel: "検索",
  emptyTitle: "見つかりません",
  emptyHint: "別のキーワードを試してください",
};

export default function SearchList({
  items,
  labels = LABELS,
  maxResults = 8,
  autoFocus = true,
  onEscape,
  className = "",
}: {
  items: SearchItem[];
  labels?: SearchListLabels;
  maxResults?: number;
  autoFocus?: boolean;
  onEscape?: () => void;
  className?: string;
}) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const needle = query.trim().toLowerCase();

  const results = useMemo(() => {
    const pool = needle
      ? items.filter((item) => `${item.label} ${item.hint ?? ""} ${item.keywords ?? ""}`.toLowerCase().includes(needle))
      : items;
    return pool.slice(0, maxResults);
  }, [items, needle, maxResults]);
  const empty = needle.length > 0 && results.length === 0;

  useEffect(() => setActive(0), [needle]);
  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  return (
    <div className={`flex w-full flex-col items-stretch ${className}`}>
      <div className="w-full self-start overflow-hidden rounded-card bg-surface shadow-raised">
        {/* input row */}
        <div className="flex h-11 items-center gap-2 border-b border-line px-3 transition-colors duration-100">
          <Search size={14} className="shrink-0 text-ink-3" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.nativeEvent.isComposing) return;
              if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                event.preventDefault();
                if (results.length === 0) return;
                setActive((current) => (current + (event.key === "ArrowDown" ? 1 : results.length - 1)) % results.length);
              } else if (event.key === "Enter") {
                event.preventDefault();
                results[active]?.onSelect();
              } else if (event.key === "Escape") {
                if (query) setQuery("");
                else onEscape?.();
              }
            }}
            placeholder={labels.placeholder}
            aria-label={labels.ariaLabel}
            className="min-w-0 flex-1 bg-transparent text-[13.5px] text-ink outline-none placeholder:text-ink-3"
          />
          {query && (
            <button
              aria-label="Clear search"
              type="button"
              onClick={() => setQuery("")}
              className="flex size-6 items-center justify-center rounded-full text-ink-3 transition-colors duration-100 hover:bg-line/70 hover:text-ink"
              style={{ animation: "fade-in 150ms ease-out both" }}
            >
              <X size={11} strokeWidth={2.2} />
            </button>
          )}
          <kbd className="hidden rounded-[5px] bg-inset px-1.5 py-0.5 font-mono text-[10.5px] text-ink-3 shadow-hairline sm:inline">esc</kbd>
        </div>

        {/* results / empty state */}
        {empty ? (
          <div className="flex flex-col items-center justify-center gap-1 px-4 py-8" style={{ animation: "fade-in 250ms ease-out both" }}>
            <span className="mb-1.5 flex size-8 items-center justify-center rounded-control bg-inset text-ink-3 shadow-hairline">
              <Search size={15} />
            </span>
            <span className="text-[13px] font-medium text-ink">{labels.emptyTitle}</span>
            <span className="text-[12px] text-ink-3">{labels.emptyHint}</span>
          </div>
        ) : (
          <div className="p-1">
            <GlideMenu className="flex flex-col gap-px" highlightClassName="inset-x-0 rounded-[6px] bg-hover">
              {results.map((item, index) => (
                <button
                  key={item.key}
                  data-menu-row
                  type="button"
                  onMouseEnter={() => setActive(index)}
                  onClick={item.onSelect}
                  className={`relative z-10 flex h-9 w-full items-center gap-2.5 rounded-[6px] px-2 text-left text-[13px] text-ink ${index === active ? "bg-hover-2" : ""}`}
                  style={{ animation: "fade-in 200ms ease-out both" }}
                >
                  {item.icon && <span className="flex size-4 shrink-0 items-center justify-center text-ink-3">{item.icon}</span>}
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                  {item.hint && <span className="shrink-0 text-[11.5px] text-ink-3">{item.hint}</span>}
                  {index === active && <kbd className="shrink-0 rounded-[5px] bg-inset px-1.5 py-0.5 font-mono text-[10.5px] text-ink-3 shadow-hairline">⏎</kbd>}
                </button>
              ))}
            </GlideMenu>
          </div>
        )}
      </div>
    </div>
  );
}
