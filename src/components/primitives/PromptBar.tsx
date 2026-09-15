import {
  ArrowUp,
  Check,
  ChevronDown,
  FileText,
  Plus,
  Square,
  X,
} from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

import { MentionText } from "@/components/atoms/MentionText";
import {
  composerMenuKeepOpenSelectors,
  composerSuggestMenuKind,
  parseComposerSuggestToken,
  shouldDismissComposerMenu,
} from "@/lib/composerMenu";
import type { ComposerSuggestKind } from "@/lib/composerMenu";
import {
  SUGGEST_MENU_PREFERRED_MAX,
  filterSuggestItems,
  overflowClipBox,
  placeSuggestMenu,
} from "@/lib/suggestMenu";
import type { SuggestMenuPlacement } from "@/lib/suggestMenu";

/* ─────────────────────────────────────────────────────────
 * PROMPT BAR — ported from Beautiful UI (beautifului.dev/r/prompt-bar)
 * A composer with real controls: attach, @ mentions, / commands,
 * pill pickers (provider · model · effort), and send.
 * Type @, /, or $ to open the menus; ↑↓ + Enter/Tab to pick, Esc closes.
 * Enter sends (IME-safe), Shift+Enter breaks a line.
 *
 * Changes from the registry copy: menus, pickers, and attachments
 * are props instead of demo constants; the self-running walkthrough,
 * dictation, and the glimm shader sweep are removed. @mentions in the
 * draft are painted as accent chips by a mirror layer under the textarea.
 * ───────────────────────────────────────────────────────── */

export interface PromptMenuItem {
  key: string;
  name: string;
  desc?: string;
  icon?: ReactNode;
  /** aliases / slugs the fuzzy filter should rank with the visible label */
  search?: string;
  /** text that replaces the typed token (e.g. "@codex ") */
  insert?: string;
  /** runs instead of inserting (attach, slash commands) */
  action?: () => void;
  trailing?: ReactNode;
}

export interface PromptPickerItem {
  key: string;
  name: string;
  tag?: string;
  disabled?: boolean;
  icon?: ReactNode;
}

export interface PromptPicker {
  id: string;
  ariaLabel: string;
  icon?: ReactNode;
  label: string;
  items: PromptPickerItem[];
  value: string | null;
  onChange: (key: string) => void;
  emptyHint?: string;
  footer?: ReactNode;
}

export interface PromptAttachment {
  name: string;
  size?: number;
}

/* keep the mention highlighter scrolled and wrapped like the textarea */
function alignHighlight(
  input: HTMLTextAreaElement | null,
  highlight: HTMLDivElement | null
) {
  if (!input || !highlight) {
    return;
  }
  highlight.scrollTop = input.scrollTop;
  /* a visible scrollbar narrows the textarea's wrap width; mirror that */
  highlight.style.right = `${input.offsetWidth - input.clientWidth}px`;
}

const POP = "pop-in 180ms cubic-bezier(0.23,1,0.32,1) both";
const GLIDE =
  "top 220ms cubic-bezier(0.23,1,0.32,1), height 220ms cubic-bezier(0.23,1,0.32,1), opacity 150ms ease";

export default function PromptBar({
  placeholder = "メッセージを入力…",
  tall = false,
  disabled = false,
  busy = false,
  mentions,
  commands = [],
  harnessCommands = [],
  plusItems = [],
  pickers = [],
  attachments = [],
  onRemoveAttachment,
  onSend,
  onStop,
  onDraftChange,
  onSuggestMenuOpenChange,
  hint,
  autoFocus,
  menuFooter,
  jobRunning = false,
  canStop = false,
}: {
  placeholder?: string;
  /** hero sizing: a multi-line input with controls on their own row */
  tall?: boolean;
  disabled?: boolean;
  /** a send is in flight — keeps the button quiet without clearing the draft */
  busy?: boolean;
  /** rows in the @ menu (agents first, then people) */
  mentions: PromptMenuItem[];
  /** rows in the / menu */
  commands?: PromptMenuItem[];
  /** rows in the $ menu (harness-native skills such as Codex $imagegen) */
  harnessCommands?: PromptMenuItem[];
  /** rows pinned to the top of the + menu (attach files, …) */
  plusItems?: PromptMenuItem[];
  /** pill pickers rendered left of the send button (provider, runtime) */
  pickers?: PromptPicker[];
  attachments?: PromptAttachment[];
  onRemoveAttachment?: (index: number) => void;
  onSend: (text: string) => boolean | Promise<boolean>;
  /** Stop the in-flight chat job. Shown instead of Send while a job is running. */
  onStop?: () => boolean | Promise<boolean>;
  onDraftChange?: (text: string) => void;
  /** fires when the @ / $ / + menu opens or closes (hero suggestions hide) */
  onSuggestMenuOpenChange?: (open: boolean) => void;
  /** one quiet line under the controls (shortcuts, auto-mention notice) */
  hint?: ReactNode;
  autoFocus?: boolean;
  /** footer copy under the @ menu */
  menuFooter?: { at?: string; slash?: string; dollar?: string };
  /** a chat job is queued or running — Send becomes Stop */
  jobRunning?: boolean;
  canStop?: boolean;
}) {
  const [draft, setDraft] = useState("");
  const [dismissed, setDismissed] = useState(false);
  const [plusOpen, setPlusOpen] = useState(false);
  const [openPicker, setOpenPicker] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  const [engaged, setEngaged] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const wide = expanded || tall;
  const [rowBox, setRowBox] = useState<{ top: number; height: number } | null>(
    null
  );
  const [menuPlacement, setMenuPlacement] = useState<SuggestMenuPlacement>({
    maxHeight: SUGGEST_MENU_PREFERRED_MAX,
    side: "above",
  });
  const [pickerBox, setPickerBox] = useState<{
    top: number;
    height: number;
  } | null>(null);
  const [pickerHovered, setPickerHovered] = useState<number | null>(null);
  const [pickerMenuLeft, setPickerMenuLeft] = useState(0);
  const [pickerMenuBottom, setPickerMenuBottom] = useState(0);
  const [pickerMaxHeight, setPickerMaxHeight] = useState(360);
  const anchorRef = useRef<HTMLDivElement>(null);
  const controlsRef = useRef<HTMLDivElement>(null);
  const pickersRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const highlightRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLSpanElement>(null);

  /* the textarea and its mention highlighter must share every metric
   * that affects line breaking, or the chips drift from the caret */
  const inputMetrics = tall
    ? "px-2 py-2 text-[14px] leading-5"
    : "px-1 py-[5px] text-[13px] leading-[18px]";
  const syncHighlight = () =>
    alignHighlight(inputRef.current, highlightRef.current);
  const rowRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const pickerTriggerRefs = useRef<Record<string, HTMLButtonElement | null>>(
    {}
  );
  const pickerRowRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const token = dismissed ? null : parseComposerSuggestToken(draft);
  const menu: ComposerSuggestKind | null = composerSuggestMenuKind({
    dismissed,
    draft,
    plusOpen,
  });
  const query = plusOpen ? "" : (token?.query ?? "");

  const rows: PromptMenuItem[] =
    menu === "at"
      ? [...(plusOpen ? plusItems : []), ...filterSuggestItems(mentions, query)]
      : menu === "slash"
        ? filterSuggestItems(commands, query)
        : menu === "dollar"
          ? filterSuggestItems(harnessCommands, query)
          : [];

  useEffect(() => {
    setActive(0);
    setEngaged(false);
  }, [menu, query]);

  const suggestMenuOpen = menu !== null;
  const onSuggestMenuOpenChangeRef = useRef(onSuggestMenuOpenChange);
  useEffect(() => {
    onSuggestMenuOpenChangeRef.current = onSuggestMenuOpenChange;
  });
  useEffect(() => {
    onSuggestMenuOpenChangeRef.current?.(suggestMenuOpen);
    return () => onSuggestMenuOpenChangeRef.current?.(false);
  }, [suggestMenuOpen]);

  /* a single highlight glides to the active row instead of each row
   * toggling its own background — matches the gliding pill in the nav */
  useLayoutEffect(() => {
    const target = rowRefs.current[active];
    if (target) {
      setRowBox({ height: target.offsetHeight, top: target.offsetTop });
      if (engaged) {
        target.scrollIntoView({ block: "nearest" });
      }
    }
  }, [menu, query, active, rows.length, engaged]);

  /* Pin the menu to the side with room (above by default) and clamp height
   * to the visible clip box so the first row is never cut by the window
   * or an overflow ancestor (hero page, Electron chrome). */
  useLayoutEffect(() => {
    if (!menu) {
      return;
    }
    const anchor = anchorRef.current;
    if (!anchor) {
      return;
    }
    const update = () => {
      const rect = anchor.getBoundingClientRect();
      setMenuPlacement(
        placeSuggestMenu({
          anchor: { bottom: rect.bottom, top: rect.top },
          bounds: overflowClipBox(anchor),
        })
      );
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(anchor);
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    window.visualViewport?.addEventListener("resize", update);
    window.visualViewport?.addEventListener("scroll", update);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
      window.visualViewport?.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener("scroll", update);
    };
  }, [menu, rows.length, wide]);

  const picker = pickers.find((item) => item.id === openPicker) ?? null;
  const pickerIndex = picker
    ? picker.items.findIndex((item) => item.key === picker.value)
    : -1;
  useLayoutEffect(() => {
    if (!picker) {
      return;
    }
    const target =
      pickerRowRefs.current[pickerHovered ?? Math.max(pickerIndex, 0)];
    if (target) {
      setPickerBox({ top: target.offsetTop, height: target.offsetHeight });
      if (pickerHovered === null) {
        target.scrollIntoView({ block: "nearest" });
      }
    }
  }, [picker, pickerHovered, pickerIndex]);

  /* The menu is outside the clipped composer, so align it to its trigger
   * by measurement instead of pinning it to the far-right edge. */
  useLayoutEffect(() => {
    if (!picker || !anchorRef.current) {
      return;
    }
    const trigger = pickerTriggerRefs.current[picker.id];
    if (!trigger) {
      return;
    }
    const anchorRect = anchorRef.current.getBoundingClientRect();
    const triggerRect = trigger.getBoundingClientRect();
    setPickerMenuLeft(
      Math.max(
        0,
        Math.min(triggerRect.left - anchorRect.left, anchorRect.width - 224)
      )
    );
    setPickerMenuBottom(anchorRect.bottom - triggerRect.top + 8);
    // Live model lists can be long: cap the menu to the room above its trigger and scroll.
    setPickerMaxHeight(Math.max(160, Math.min(360, triggerRect.top - 8 - 16)));
  }, [picker, wide]);

  useEffect(() => {
    if (!openPicker) {
      setPickerHovered(null);
    }
  }, [openPicker]);

  useEffect(() => {
    if (autoFocus) {
      inputRef.current?.focus();
    }
  }, [autoFocus]);

  /* Move wrapped text above the controls, then grow to a compact maximum. */
  useLayoutEffect(() => {
    const input = inputRef.current;
    const controls = controlsRef.current;
    const measure = measureRef.current;
    if (!input || !controls || !measure) {
      return;
    }

    const pickersWidth = pickersRef.current?.offsetWidth ?? 0;
    const fixedControlsWidth = 28 * 2 + pickersWidth;
    const inlineGaps = 4 * 3;
    const inlineInputWidth =
      controls.clientWidth - fixedControlsWidth - inlineGaps;
    const needsFullWidth =
      draft.includes("\n") || measure.offsetWidth + 8 > inlineInputWidth;
    if (needsFullWidth !== expanded) {
      setExpanded(needsFullWidth);
    }

    const minHeight = tall ? 68 : 28;
    const maxHeight = tall ? 220 : 120;
    input.style.height = "0px";
    const contentHeight = input.scrollHeight;
    input.style.height = `${Math.min(Math.max(contentHeight, minHeight), maxHeight)}px`;
    input.style.overflowY = contentHeight > maxHeight ? "auto" : "hidden";
    alignHighlight(input, highlightRef.current);
  }, [draft, expanded, tall, pickers.length]);

  const closeMenus = (dismissSuggest = false) => {
    setPlusOpen(false);
    setOpenPicker(null);
    if (dismissSuggest) {
      setDismissed(true);
    }
  };

  /* Dismiss on outside pointerdown / Escape — menu + trigger stay open so
   * the pill toggle does not race pointerdown-close then click-reopen. */
  useEffect(() => {
    const keepOpen = composerMenuKeepOpenSelectors({
      openPicker,
      plusOpen,
      suggestOpen: menu !== null,
    });
    if (keepOpen.length === 0) {
      return;
    }
    const onPointerDown = (event: PointerEvent) => {
      if (shouldDismissComposerMenu(event.target, keepOpen)) {
        setPlusOpen(false);
        setOpenPicker(null);
        setDismissed(true);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setPlusOpen(false);
        setOpenPicker(null);
        setDismissed(true);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menu, openPicker, plusOpen]);

  const update = (next: string) => {
    setDraft(next);
    onDraftChange?.(next);
  };

  const pick = (row: PromptMenuItem) => {
    if (row.action) {
      if (token) {
        update(draft.slice(0, token.start));
      }
      row.action();
    } else if (row.insert !== undefined) {
      const base = token ? draft.slice(0, token.start) : draft;
      const needsGap = !token && base.length > 0 && !/\s$/.test(base);
      update(`${base}${needsGap ? " " : ""}${row.insert}`);
    }
    setPlusOpen(false);
    setDismissed(false);
    inputRef.current?.focus();
  };

  const canSend =
    !disabled &&
    !busy &&
    !jobRunning &&
    (draft.trim().length > 0 || attachments.length > 0);
  const stopEnabled = !disabled && jobRunning && canStop && !!onStop;
  const send = () => {
    if (!canSend) {
      return;
    }
    const text = draft.trim();
    closeMenus();
    void Promise.resolve(onSend(text)).then((ok) => {
      if (ok !== false) {
        update("");
      }
    });
  };

  const stop = () => {
    if (!stopEnabled || !onStop) {
      return;
    }
    closeMenus();
    void Promise.resolve(onStop());
  };

  const footerAt = menuFooter?.at ?? "エージェントかメンバーを選択";
  const footerSlash = menuFooter?.slash ?? "コマンドを選択";
  const footerDollar =
    menuFooter?.dollar ?? "ハーネス固有の機能（Codex $imagegen など）";
  const footerCopy =
    menu === "at" ? footerAt : menu === "dollar" ? footerDollar : footerSlash;

  return (
    <div data-promptbar className="w-full">
      {/* composer is the anchor — the @ / menu flips above or below */}
      <div ref={anchorRef} className="relative">
        {/* ── @ / slash menu ─────────────────────────────── */}
        {menu && (
          <div
            onMouseLeave={() => setEngaged(false)}
            data-prompt-menu="suggest"
            data-suggest-side={menuPlacement.side}
            className={`bg-surface shadow-raised absolute inset-x-0 z-20 overflow-y-auto overscroll-contain rounded-[10px] p-1 ${
              menuPlacement.side === "above"
                ? "bottom-full mb-2"
                : "top-full mt-2"
            }`}
            style={{
              animation: POP,
              maxHeight: menuPlacement.maxHeight,
              transformOrigin:
                menuPlacement.side === "above" ? "bottom center" : "top center",
            }}
          >
            <span
              aria-hidden
              className="bg-hover pointer-events-none absolute inset-x-1 rounded-[6px]"
              style={{
                height: rowBox?.height ?? 0,
                opacity: rowBox && engaged && rows.length > 0 ? 1 : 0,
                top: rowBox?.top ?? 0,
                transition: GLIDE,
              }}
            />
            {rows.map((row, i) => (
              <button
                key={row.key}
                type="button"
                ref={(el) => {
                  rowRefs.current[i] = el;
                }}
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => {
                  setActive(i);
                  setEngaged(true);
                }}
                onClick={() => pick(row)}
                className="relative z-10 flex h-9 w-full items-center gap-2.5 rounded-[6px] px-2 text-left"
              >
                {row.icon && (
                  <span className="text-ink-2 flex size-5.5 shrink-0 items-center justify-center">
                    {row.icon}
                  </span>
                )}
                <span className="text-ink shrink-0 text-[12.5px] font-medium">
                  {row.name}
                </span>
                {row.desc && (
                  <span className="text-ink-3 min-w-0 flex-1 truncate text-[12px]">
                    {row.desc}
                  </span>
                )}
                {row.trailing && (
                  <span className="text-ink-3 ml-auto shrink-0 text-[11.5px]">
                    {row.trailing}
                  </span>
                )}
              </button>
            ))}
            {rows.length === 0 && (
              <div className="text-ink-3 flex h-9 items-center px-2 text-[12px]">
                「{query}」に一致する候補はありません
              </div>
            )}
            <div className="border-line text-ink-3 mt-1 border-t px-2 pt-1.5 pb-1 text-[11px]">
              {footerCopy}
            </div>
          </div>
        )}

        {/* ── picker menu ────────────────────────────────── */}
        {picker && (
          <div
            onMouseLeave={() => setPickerHovered(null)}
            data-prompt-menu="picker"
            className="bg-surface shadow-raised absolute z-20 flex w-56 flex-col rounded-[10px] p-1"
            style={{
              animation: POP,
              bottom: pickerMenuBottom,
              left: pickerMenuLeft,
              maxHeight: pickerMaxHeight,
              transformOrigin: "bottom left",
            }}
          >
            <div className="relative min-h-0 flex-1 overflow-y-auto">
              <span
                aria-hidden
                className="bg-hover pointer-events-none absolute inset-x-0 rounded-[6px]"
                style={{
                  height: pickerBox?.height ?? 0,
                  opacity: pickerBox && pickerHovered !== null ? 1 : 0,
                  top: pickerBox?.top ?? 0,
                  transition: GLIDE,
                }}
              />
              {picker.items.map((item, i) => (
                <button
                  key={item.key}
                  type="button"
                  disabled={item.disabled}
                  ref={(el) => {
                    pickerRowRefs.current[i] = el;
                  }}
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseEnter={() => setPickerHovered(i)}
                  onClick={() => {
                    picker.onChange(item.key);
                    setOpenPicker(null);
                    inputRef.current?.focus();
                  }}
                  className="relative z-10 flex h-7.5 w-full items-center gap-2 rounded-[6px] px-2 text-left disabled:opacity-45"
                >
                  {item.icon && (
                    <span className="flex shrink-0">{item.icon}</span>
                  )}
                  <span className="text-ink min-w-0 flex-1 truncate text-[12.5px] font-medium">
                    {item.name}
                  </span>
                  {item.tag && (
                    <span className="text-ink-3 shrink-0 text-[11px]">
                      {item.tag}
                    </span>
                  )}
                  <span
                    className={`text-ink shrink-0 ${item.key === picker.value ? "" : "invisible"}`}
                  >
                    <Check size={13} strokeWidth={2.5} />
                  </span>
                </button>
              ))}
              {picker.items.length === 0 && (
                <div className="text-ink-3 px-2 py-2 text-[12px] leading-[1.5]">
                  {picker.emptyHint ?? "候補がありません"}
                </div>
              )}
            </div>
            {picker.footer && (
              <div className="border-line text-ink-3 mt-1 shrink-0 border-t px-2 pt-1.5 pb-1 text-[11px]">
                {picker.footer}
              </div>
            )}
          </div>
        )}

        {/* ── composer ───────────────────────────────────── */}
        <div
          className={`border-line bg-surface shadow-card focus-within:border-line-strong relative isolate flex flex-col overflow-hidden border transition-[border-color,border-radius,opacity] duration-150 ${
            tall
              ? "gap-2.5 rounded-[22px] p-3.5"
              : "gap-1.5 rounded-[14px] p-1.5"
          } ${disabled ? "opacity-70" : ""}`}
        >
          <span
            ref={measureRef}
            aria-hidden="true"
            className="pointer-events-none invisible absolute text-[13px] leading-[18px] whitespace-pre"
          >
            {draft}
          </span>

          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-1.5 px-0.5 pt-0.5">
              {attachments.map((file, i) => (
                <span
                  key={`${file.name}-${i}`}
                  className="rounded-chip bg-field text-ink-2 shadow-hairline flex h-6.5 items-center gap-1.5 py-1 pr-1 pl-1.5 text-[11.5px]"
                  style={{
                    animation: "pop-in 200ms cubic-bezier(0.23,1,0.32,1) both",
                  }}
                >
                  <FileText size={12} />
                  <span className="max-w-36 truncate">{file.name}</span>
                  {onRemoveAttachment && (
                    <button
                      type="button"
                      aria-label={`${file.name} を外す`}
                      onClick={() => onRemoveAttachment(i)}
                      className="text-ink-3 hover:bg-line/70 hover:text-ink -my-1 flex size-6 items-center justify-center rounded-[5px] transition-colors duration-100"
                    >
                      <X size={10} strokeWidth={2.5} />
                    </button>
                  )}
                </span>
              ))}
            </div>
          )}

          <div
            ref={controlsRef}
            className={`grid items-end gap-x-1 gap-y-1.5 ${
              wide
                ? "grid-cols-[28px_auto_minmax(0,1fr)_28px]"
                : "grid-cols-[28px_minmax(0,1fr)_auto_28px]"
            }`}
          >
            <button
              type="button"
              data-prompt-trigger="plus"
              aria-label="添付とメンション"
              aria-expanded={plusOpen}
              disabled={disabled}
              onClick={() => {
                setOpenPicker(null);
                setPlusOpen((current) => !current);
                inputRef.current?.focus();
              }}
              className={`text-ink-3 hover:bg-hover hover:text-ink flex size-7 shrink-0 items-center justify-center justify-self-start rounded-[8px] transition-[background-color,color,transform] duration-150 active:scale-[0.94] disabled:pointer-events-none ${
                plusOpen ? "bg-hover text-ink" : ""
              } ${wide ? "col-start-1 row-start-2" : "col-start-1 row-start-1"}`}
            >
              <Plus size={16} strokeWidth={2} />
            </button>

            {/* The textarea keeps every native behaviour (IME, selection,
             * mobile keyboards, autocomplete) but paints its glyphs
             * transparent; a mirror underneath renders the same text with
             * mentions as chips, so the composer reads like a sent bubble. */}
            <div
              className={`relative min-w-0 ${wide ? "col-span-full col-start-1 row-start-1" : "col-start-2 row-start-1"}`}
            >
              <div
                ref={highlightRef}
                aria-hidden="true"
                className={`${inputMetrics} text-ink pointer-events-none absolute inset-0 overflow-hidden [overflow-wrap:anywhere] whitespace-pre-wrap`}
              >
                <MentionText text={draft} overlay />
                {"\u200B"}
              </div>
              <textarea
                ref={inputRef}
                data-prompt-input
                rows={1}
                value={draft}
                disabled={disabled}
                onChange={(event) => {
                  update(event.target.value);
                  setDismissed(false);
                  setPlusOpen(false);
                }}
                onScroll={syncHighlight}
                onKeyDown={(event) => {
                  if (event.nativeEvent.isComposing) {
                    return;
                  }
                  if (menu && rows.length > 0) {
                    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                      event.preventDefault();
                      setEngaged(true);
                      setActive(
                        (current) =>
                          (current +
                            (event.key === "ArrowDown" ? 1 : rows.length - 1)) %
                          rows.length
                      );
                      return;
                    }
                    if (
                      (event.key === "Enter" && !event.shiftKey) ||
                      event.key === "Tab"
                    ) {
                      event.preventDefault();
                      const row = rows[active];
                      if (row) {
                        pick(row);
                      }
                      return;
                    }
                  }
                  if (event.key === "Escape") {
                    closeMenus(true);
                    return;
                  }
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    send();
                  }
                }}
                placeholder={placeholder}
                aria-label="メッセージ"
                className={`${inputMetrics} ${
                  tall ? "min-h-[68px]" : "min-h-7"
                } caret-ink placeholder:text-ink-3 relative block w-full min-w-0 resize-none bg-transparent [overflow-wrap:anywhere] text-transparent outline-none`}
              />
            </div>

            {/* pickers — provider · runtime */}
            <div
              ref={pickersRef}
              className={`flex max-w-full items-center gap-0.5 overflow-x-auto ${wide ? "col-start-2 row-start-2 justify-self-start" : "col-start-3 row-start-1"}`}
            >
              {pickers.map((item) => (
                <button
                  key={item.id}
                  ref={(el) => {
                    pickerTriggerRefs.current[item.id] = el;
                  }}
                  type="button"
                  data-prompt-trigger={`picker-${item.id}`}
                  aria-expanded={openPicker === item.id}
                  aria-label={item.ariaLabel}
                  disabled={disabled}
                  onClick={() => {
                    setPlusOpen(false);
                    setOpenPicker((current) =>
                      current === item.id ? null : item.id
                    );
                  }}
                  className={`text-ink-2 hover:bg-hover hover:text-ink flex h-7 shrink-0 items-center gap-1 rounded-[8px] px-1.5 text-[12px] font-medium transition-colors duration-150 disabled:pointer-events-none ${
                    openPicker === item.id ? "bg-hover text-ink" : ""
                  }`}
                >
                  {item.icon && (
                    <span className="text-ink-3 flex shrink-0">
                      {item.icon}
                    </span>
                  )}
                  <span className="max-w-32 truncate">{item.label}</span>
                  <span className="text-ink-3">
                    <ChevronDown size={11} strokeWidth={2.4} />
                  </span>
                </button>
              ))}
            </div>

            {/* send — or Stop while a job is running */}
            <button
              type="button"
              aria-label={jobRunning ? "生成を中断" : "送信"}
              disabled={jobRunning ? !stopEnabled : !canSend}
              onClick={jobRunning ? stop : send}
              className={`flex size-7 shrink-0 items-center justify-center rounded-[8px] transition-[background-color,color,transform,opacity] duration-200 enabled:active:scale-[0.94] ${
                wide ? "col-start-4 row-start-2" : "col-start-4 row-start-1"
              }`}
              style={{
                background: jobRunning
                  ? stopEnabled
                    ? "var(--red)"
                    : "var(--line-strong)"
                  : canSend
                    ? "var(--btn)"
                    : "var(--line-strong)",
                color: jobRunning
                  ? stopEnabled
                    ? "#ffffff"
                    : "var(--ink-2)"
                  : canSend
                    ? "#ffffff"
                    : "var(--ink-2)",
              }}
            >
              {jobRunning ? (
                <Square size={12} strokeWidth={2.6} fill="currentColor" />
              ) : (
                <ArrowUp size={16} strokeWidth={2.4} />
              )}
            </button>
          </div>

          {hint && (
            <div className="text-ink-3 px-1 pb-0.5 text-[11px] leading-[1.4]">
              {hint}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
