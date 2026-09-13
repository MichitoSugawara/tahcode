import { JOB_CANCELLED_MESSAGE } from "@shared/jobs.ts";
import { useQuery } from "convex/react";
import {
  Check,
  Copy,
  Cpu,
  ListTree,
  RotateCcw,
  ShieldCheck,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/atoms/Button";
import { Monogram } from "@/components/atoms/EntityChip";
import LoadingState from "@/components/primitives/LoadingState";
import ThinkingState from "@/components/primitives/ThinkingState";
import type { ThinkingRow } from "@/components/primitives/ThinkingState";
import ToolChips from "@/components/primitives/ToolChips";
import type { ToolStep } from "@/components/primitives/ToolChips";
import { useCancelJob } from "@/harness/Composer";
import { useOrg } from "@/harness/OrgContext";
import { Notice } from "@/harness/ui/Notice";
import { copyText, clockTime } from "@/lib/format";
import { providerColor, providerLabel } from "@/lib/providers";

import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Markdown } from "./Markdown";

/* ─────────────────────────────────────────────────────────
 * AGENT REPLY — the harness AssistantResponse on real data.
 *   queued/streaming, no text yet → LoadingState (pixel grid)
 *   thinking events               → ThinkingState (live rows)
 *   tool events                   → ToolChips (live rows, expandable)
 *   text arriving                 → progressive Markdown + caret
 *   done                          → Markdown with CodeBlocks + actions
 *   failed                        → the error, in place
 * ───────────────────────────────────────────────────────── */

export interface AgentMessage {
  _id: Id<"messages">;
  _creationTime: number;
  body: string;
  status?: "streaming" | "done" | "error" | "cancelled";
  driverKind?: string;
  model?: string;
  jobId?: Id<"jobs">;
  runtimeId?: Id<"runtimes">;
}

/* `_Cursor · muse-spark-1.3 · 12.3s · agent_` — the model segment is optional */
const FOOTER = /\n\n_([^_\n]+) · ([\d.]+)s · ([^_\n]+)_\s*$/;

function splitFooter(body: string): {
  text: string;
  footer: { provider: string; seconds: string; binary: string } | null;
} {
  const match = FOOTER.exec(body);
  if (!match) {
    return { text: body, footer: null };
  }
  return {
    footer: {
      binary: match[3] ?? "",
      provider: match[1] ?? "",
      seconds: match[2] ?? "",
    },
    text: body.slice(0, match.index),
  };
}

/* Runtime traces are raw provider protocol lines (JSONL from codex/claude/
 * cursor). Reduce each to one readable row: reasoning text, a command, or
 * the event type — never a wall of JSON. */
function summarizeEvent(type: string, raw: string): ThinkingRow {
  const text = raw.trim();
  const clip = (value: string) => value.replaceAll(/\s+/g, " ").slice(0, 96);
  if (type === "tool") {
    const [, label, rest] = /^([a-z_]+):\s*(.*)$/i.exec(text) ?? [];
    return {
      mono: true,
      primary: label ? label.replaceAll("_", " ") : "ツール",
      secondary: clip(rest ?? text),
    };
  }
  if (text.startsWith("{")) {
    try {
      const parsed = JSON.parse(text) as {
        type?: string;
        item?: {
          item_type?: string;
          type?: string;
          text?: string;
          command?: string;
        };
      };
      const { item } = parsed;
      if (item?.text) {
        return { primary: "思考", secondary: clip(item.text) };
      }
      if (item?.command) {
        return {
          primary: "コマンド",
          secondary: clip(item.command),
          mono: true,
        };
      }
      const label = [parsed.type, item?.item_type ?? item?.type]
        .filter(Boolean)
        .join(" · ");
      return {
        mono: true,
        primary: "イベント",
        secondary: clip(label || text),
      };
    } catch {
      /* not JSON after all */
    }
  }
  return {
    mono: text.startsWith("Running "),
    primary: text.startsWith("Running ") ? "起動" : "思考",
    secondary: clip(text),
  };
}

/* One runtime `tool` event → one ToolChips row. Provider protocols label
 * the call (command_execution / file_change / mcp_tool_call …); the rest of
 * the line is the chip. */
function toolStep(raw: string): ToolStep {
  const text = raw.trim().replaceAll(/\s+/g, " ");
  const [, kind, rest] = /^([a-z_]+):\s*(.*)$/i.exec(text) ?? [];
  const key = (kind ?? "").toLowerCase();
  const icon = /write|edit|patch|file/.test(key)
    ? "write"
    : /read|view|search|grep/.test(key)
      ? "read"
      : "run";
  const label = /file|patch|edit/.test(key)
    ? "編集"
    : /read|view/.test(key)
      ? "読み取り"
      : /mcp/.test(key)
        ? "MCP"
        : /command|exec|shell|bash/.test(key)
          ? "コマンド"
          : kind
            ? kind.replaceAll("_", " ")
            : "ツール";
  const chip = (rest ?? text).slice(0, 120) || text.slice(0, 120);
  return {
    chip,
    detail: [{ text: text.slice(0, 400) }],
    detailMono: true,
    icon,
    label,
    mono: true,
  };
}

/* StreamText's reveal, made incremental and markdown-aware: the revealed
 * count only ever catches up to the growing text (never restarts per
 * chunk), the partial markdown re-renders as it lands, and a caret rides
 * the last block while the run is live. */
function LiveMarkdown({ text, live }: { text: string; live: boolean }) {
  const [shown, setShown] = useState(live ? 0 : text.length);
  const timer = useRef<number | null>(null);
  useEffect(() => {
    if (!live) {
      setShown(text.length);
      return;
    }
    let cancelled = false;
    const tick = () => {
      if (cancelled) {
        return;
      }
      setShown((current) => {
        if (current >= text.length) {
          return text.length;
        }
        const gap = text.length - current;
        return current + Math.max(3, Math.ceil(gap / 10));
      });
      timer.current = window.setTimeout(tick, 30);
    };
    tick();
    return () => {
      cancelled = true;
      if (timer.current) {
        clearTimeout(timer.current);
      }
    };
  }, [text, live]);
  const visible = text.slice(0, Math.min(shown, text.length));
  return (
    <div className={live ? "md-live" : undefined}>
      <Markdown>{visible}</Markdown>
    </div>
  );
}

export function AgentReply({
  message,
  prompt,
  onRetry,
}: {
  message: AgentMessage;
  prompt?: string;
  onRetry?: (prompt: string) => void;
}) {
  const { runtimes, openDialog } = useOrg();
  const { cancel, stopping } = useCancelJob();
  const streaming = message.status === "streaming";
  const failed = message.status === "error";
  const cancelled = message.status === "cancelled";
  const [traceOpen, setTraceOpen] = useState(false);
  /* once we have watched a run live, keep its trace around after it settles */
  const [seen, setSeen] = useState(false);
  const wantJob =
    !!message.jobId && (streaming || traceOpen || failed || cancelled || seen);
  const job = useQuery(
    api.jobs.get,
    wantJob && message.jobId ? { jobId: message.jobId } : "skip"
  );
  useEffect(() => {
    if (job && streaming) {
      setSeen(true);
    }
  }, [job, streaming]);

  const runtime = runtimes?.find((item) => item._id === message.runtimeId);
  const label = providerLabel(message.driverKind);

  const rows = useMemo<ThinkingRow[]>(() => {
    const events = job?.events ?? [];
    return events
      .filter((event) => event.type === "thinking")
      .map((event) => summarizeEvent(event.type, event.text));
  }, [job]);
  const tools = useMemo<ToolStep[]>(
    () =>
      (job?.events ?? [])
        .filter((event) => event.type === "tool")
        .map((event) => toolStep(event.text)),
    [job]
  );
  const [copied, setCopied] = useState(false);

  const streamedText = useMemo(() => {
    if (!job) {
      return null;
    }
    return job.events
      .filter((event) => event.type === "text")
      .map((event) => event.text)
      .join("");
  }, [job]);

  /* the "no runtime" notice the server writes when nothing can pick the job up */
  if (!message.jobId && !message.runtimeId) {
    return (
      <div
        className="min-w-0"
        style={{ animation: "fade-up 450ms cubic-bezier(0.23,1,0.32,1) both" }}
      >
        <Notice
          tone="warn"
          title="オンラインで利用できるマシンランタイムがありません"
          action={
            <>
              <Button
                type="button"
                size="xs"
                variant="accent"
                onClick={() => openDialog({ kind: "registerRuntime" })}
              >
                <Cpu size={12} /> このマシンを登録
              </Button>
              <span className="text-ink-3 self-center text-[11.5px]">
                登録済みなら <code className="font-mono">tahcode start</code>{" "}
                の起動と Runtime タブの許可を確認
              </span>
            </>
          }
        >
          {message.body.replaceAll("`", "")}
        </Notice>
      </div>
    );
  }

  const { text: finalText, footer } = splitFooter(message.body);
  const liveText = streaming
    ? (streamedText ?? message.body.replace(/^Running [^\n]*\n?/, ""))
    : "";
  const showLoader =
    streaming &&
    liveText.trim().length === 0 &&
    rows.length === 0 &&
    tools.length === 0;
  const traceCount = rows.length + tools.length;
  const traceVisible = streaming || traceOpen || seen;

  return (
    <article
      className="min-w-0"
      style={{ animation: "fade-up 450ms cubic-bezier(0.23,1,0.32,1) both" }}
    >
      <header className="mb-2 flex items-center gap-2 text-[12px]">
        <Monogram
          color={providerColor(message.driverKind)}
          className="size-[18px] text-[10px]"
        >
          {label.charAt(0)}
        </Monogram>
        <span className="text-ink font-medium">{label}</span>
        {message.model && (
          <code
            className="bg-inset text-ink-2 rounded-[4px] px-1 py-px font-mono text-[11px]"
            title="このメッセージのモデル（@provider/model）"
          >
            {message.model}
          </code>
        )}
        {runtime && (
          <span className="text-ink-3 inline-flex items-center gap-1">
            <Cpu size={11} /> {runtime.name}
          </span>
        )}
        {streaming && message.jobId && job?.job.canCancel && (
          <button
            type="button"
            aria-label="生成を中断"
            disabled={stopping}
            onClick={() => {
              if (message.jobId) {
                void cancel(message.jobId);
              }
            }}
            className="text-red hover:bg-red-tint inline-flex h-6 items-center gap-1 rounded-[6px] px-1.5 text-[11.5px] font-medium transition-colors duration-100 disabled:opacity-50"
          >
            中断
          </button>
        )}
        <span className="text-ink-3 ml-auto">
          {clockTime(message._creationTime)}
        </span>
      </header>

      {showLoader && (
        <div
          className="flex min-h-6 items-center"
          style={{ animation: "fade-in 200ms ease-out both" }}
        >
          <LoadingState
            label={
              job?.job.status === "queued"
                ? "ランタイムの受付待ち"
                : "考えています"
            }
            variant="Dots"
          />
        </div>
      )}

      {traceVisible && rows.length > 0 && (
        <div className="mb-2">
          <ThinkingState
            fill
            variant="Steps"
            working={streaming}
            defaultExpanded={streaming || traceOpen}
            rows={rows}
            active={`実行中 · ${rows.length} ステップ`}
            done={`${rows.length} ステップ実行`}
          />
        </div>
      )}

      {traceVisible && tools.length > 0 && (
        <div className="mb-3">
          <ToolChips
            fill
            live
            steps={tools}
            diffs={[]}
            diffLines={{}}
            defaultOpen={streaming || traceOpen}
            labels={{ header: `${tools.length} 件のツール呼び出し`, more: "" }}
          />
        </div>
      )}

      {streaming && liveText.trim().length > 0 && (
        <LiveMarkdown text={liveText} live />
      )}

      {!streaming &&
        !failed &&
        finalText.trim().length > 0 &&
        finalText.trim() !== JOB_CANCELLED_MESSAGE && (
          <div style={{ animation: "fade-in 260ms ease both" }}>
            <Markdown>{finalText}</Markdown>
          </div>
        )}

      {cancelled && (
        <Notice tone="warn" title="中断しました">
          <span className="font-mono text-[12px]">
            {job?.job.error ?? JOB_CANCELLED_MESSAGE}
          </span>
        </Notice>
      )}

      {failed && (
        <Notice
          tone="warn"
          title="実行に失敗しました"
          action={
            prompt ? (
              <span className="text-ink-3 text-[11.5px]">
                プロンプト: {prompt.slice(0, 80)}
              </span>
            ) : undefined
          }
        >
          <span className="font-mono text-[12px]">
            {job?.job.error ?? finalText ?? "unknown error"}
          </span>
        </Notice>
      )}

      {!streaming && (footer || message.jobId) && (
        <div className="text-ink-3 mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11.5px]">
          {/* action icons row — StreamingText grammar */}
          {!failed && finalText.trim().length > 0 && (
            <span className="mr-1 -ml-1 flex items-center gap-0.5">
              <button
                type="button"
                aria-label="返信をコピー"
                title="Markdown をコピー"
                onClick={() => {
                  void copyText(finalText.trim()).then((ok) => {
                    if (!ok) {
                      return;
                    }
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1500);
                  });
                }}
                className={`hover:bg-hover-2 hover:text-ink-2 flex size-6 items-center justify-center rounded-[6px] transition-colors duration-100 ${copied ? "text-green" : "text-ink-3"}`}
              >
                {copied ? (
                  <Check size={14} strokeWidth={2.5} />
                ) : (
                  <Copy size={14} strokeWidth={1.8} />
                )}
              </button>
              {onRetry && prompt && (
                <button
                  type="button"
                  aria-label="同じ依頼をもう一度"
                  title="同じ依頼をもう一度送る"
                  onClick={() => onRetry(prompt)}
                  className="text-ink-3 hover:bg-hover-2 hover:text-ink-2 flex size-6 items-center justify-center rounded-[6px] transition-colors duration-100"
                >
                  <RotateCcw size={14} strokeWidth={1.8} />
                </button>
              )}
            </span>
          )}
          {footer && (
            <span className="inline-flex items-center gap-1 font-mono tabular-nums">
              <ShieldCheck size={11} /> {footer.provider} · {footer.seconds}s ·{" "}
              {footer.binary}
            </span>
          )}
          {message.jobId && !(seen && traceCount > 0) && (
            <button
              type="button"
              aria-expanded={traceOpen}
              onClick={() => setTraceOpen((current) => !current)}
              className="hover:bg-hover-2 hover:text-ink inline-flex items-center gap-1 rounded-[6px] px-1 py-0.5 transition-colors duration-100"
            >
              <ListTree size={11} />
              {traceOpen
                ? "実行ログを閉じる"
                : traceCount > 0
                  ? `実行ログ (${traceCount})`
                  : "実行ログ"}
            </button>
          )}
        </div>
      )}
    </article>
  );
}
