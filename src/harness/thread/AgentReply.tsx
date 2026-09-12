import { useQuery } from "convex/react";
import { Cpu, ListTree, ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/atoms/Button";
import { Monogram } from "@/components/atoms/EntityChip";
import LoadingState from "@/components/primitives/LoadingState";
import ThinkingState, { type ThinkingRow } from "@/components/primitives/ThinkingState";
import { useOrg } from "@/harness/OrgContext";
import { Notice } from "@/harness/ui/Notice";
import { clockTime } from "@/lib/format";
import { providerColor, providerLabel } from "@/lib/providers";
import { Markdown } from "./Markdown";

/* ─────────────────────────────────────────────────────────
 * AGENT REPLY — the harness AssistantResponse on real data.
 *   queued/streaming, no text yet → LoadingState (pixel grid)
 *   events arriving               → ThinkingState (live rows)
 *   text arriving                 → StreamText-style reveal + caret
 *   done                          → Markdown with CodeBlocks
 *   failed                        → the error, in place
 * ───────────────────────────────────────────────────────── */

export type AgentMessage = {
  _id: Id<"messages">;
  _creationTime: number;
  body: string;
  status?: "streaming" | "done" | "error";
  driverKind?: string;
  jobId?: Id<"jobs">;
  runtimeId?: Id<"runtimes">;
};

const FOOTER = /\n\n_([^_\n]+) · ([\d.]+)s · ([^_\n]+)_\s*$/;

function splitFooter(body: string): { text: string; footer: { provider: string; seconds: string; binary: string } | null } {
  const match = FOOTER.exec(body);
  if (!match) return { text: body, footer: null };
  return { text: body.slice(0, match.index), footer: { provider: match[1] ?? "", seconds: match[2] ?? "", binary: match[3] ?? "" } };
}


/* Runtime traces are raw provider protocol lines (JSONL from codex/claude/
 * cursor). Reduce each to one readable row: reasoning text, a command, or
 * the event type — never a wall of JSON. */
function summarizeEvent(type: string, raw: string): ThinkingRow {
  const text = raw.trim();
  const clip = (value: string) => value.replace(/\s+/g, " ").slice(0, 96);
  if (type === "tool") {
    const [, label, rest] = /^([a-z_]+):\s*(.*)$/i.exec(text) ?? [];
    return { primary: label ? label.replace(/_/g, " ") : "ツール", secondary: clip(rest ?? text), mono: true };
  }
  if (text.startsWith("{")) {
    try {
      const parsed = JSON.parse(text) as { type?: string; item?: { item_type?: string; type?: string; text?: string; command?: string } };
      const item = parsed.item;
      if (item?.text) return { primary: "思考", secondary: clip(item.text) };
      if (item?.command) return { primary: "コマンド", secondary: clip(item.command), mono: true };
      const label = [parsed.type, item?.item_type ?? item?.type].filter(Boolean).join(" · ");
      return { primary: "イベント", secondary: clip(label || text), mono: true };
    } catch {
      /* not JSON after all */
    }
  }
  return { primary: text.startsWith("Running ") ? "起動" : "思考", secondary: clip(text), mono: text.startsWith("Running ") };
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
      if (cancelled) return;
      setShown((current) => {
        if (current >= text.length) return text.length;
        const gap = text.length - current;
        return current + Math.max(3, Math.ceil(gap / 10));
      });
      timer.current = window.setTimeout(tick, 30);
    };
    tick();
    return () => {
      cancelled = true;
      if (timer.current) clearTimeout(timer.current);
    };
  }, [text, live]);
  const visible = text.slice(0, Math.min(shown, text.length));
  return (
    <div className={live ? "md-live" : undefined}>
      <Markdown>{visible}</Markdown>
    </div>
  );
}

export function AgentReply({ message, prompt }: { message: AgentMessage; prompt?: string }) {
  const { runtimes, openDialog } = useOrg();
  const streaming = message.status === "streaming";
  const failed = message.status === "error";
  const [traceOpen, setTraceOpen] = useState(false);
  /* once we have watched a run live, keep its trace around after it settles */
  const [seen, setSeen] = useState(false);
  const wantJob = !!message.jobId && (streaming || traceOpen || failed || seen);
  const job = useQuery(api.jobs.get, wantJob && message.jobId ? { jobId: message.jobId } : "skip");
  useEffect(() => {
    if (job && streaming) setSeen(true);
  }, [job, streaming]);

  const runtime = runtimes?.find((item) => item._id === message.runtimeId);
  const label = providerLabel(message.driverKind);

  const rows = useMemo<ThinkingRow[]>(() => {
    const events = job?.events ?? [];
    return events.filter((event) => event.type === "thinking" || event.type === "tool").map((event) => summarizeEvent(event.type, event.text));
  }, [job]);

  const streamedText = useMemo(() => {
    if (!job) return null;
    return job.events
      .filter((event) => event.type === "text")
      .map((event) => event.text)
      .join("");
  }, [job]);

  /* the "no runtime" notice the server writes when nothing can pick the job up */
  if (!message.jobId && !message.runtimeId) {
    return (
      <div className="min-w-0" style={{ animation: "fade-up 450ms cubic-bezier(0.23,1,0.32,1) both" }}>
        <Notice
          tone="warn"
          title="オンラインで利用できるマシンランタイムがありません"
          action={
            <>
              <Button type="button" size="xs" variant="accent" onClick={() => openDialog({ kind: "registerRuntime" })}>
                <Cpu size={12} /> このマシンを登録
              </Button>
              <span className="self-center text-[11.5px] text-ink-3">登録済みなら Runtime タブで許可とオンライン状態を確認</span>
            </>
          }
        >
          {message.body.replace(/`/g, "")}
        </Notice>
      </div>
    );
  }

  const { text: finalText, footer } = splitFooter(message.body);
  const liveText = streaming ? (streamedText ?? message.body.replace(/^Running [^\n]*\n?/, "")) : "";
  const showLoader = streaming && liveText.trim().length === 0 && rows.length === 0;
  const traceCount = rows.length;

  return (
    <article className="min-w-0" style={{ animation: "fade-up 450ms cubic-bezier(0.23,1,0.32,1) both" }}>
      <header className="mb-2 flex items-center gap-2 text-[12px]">
        <Monogram color={providerColor(message.driverKind)} className="size-[18px] text-[10px]">
          {label.charAt(0)}
        </Monogram>
        <span className="font-medium text-ink">{label}</span>
        {runtime && (
          <span className="inline-flex items-center gap-1 text-ink-3">
            <Cpu size={11} /> {runtime.name}
          </span>
        )}
        <span className="ml-auto text-ink-3">{clockTime(message._creationTime)}</span>
      </header>

      {showLoader && (
        <div className="flex min-h-6 items-center" style={{ animation: "fade-in 200ms ease-out both" }}>
          <LoadingState label={job?.job.status === "queued" ? "ランタイムの受付待ち" : "考えています"} variant="Dots" />
        </div>
      )}

      {(streaming || traceOpen || seen) && rows.length > 0 && (
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

      {streaming && liveText.trim().length > 0 && <LiveMarkdown text={liveText} live />}

      {!streaming && !failed && finalText.trim().length > 0 && (
        <div style={{ animation: "fade-in 260ms ease both" }}>
          <Markdown>{finalText}</Markdown>
        </div>
      )}

      {failed && (
        <Notice tone="warn" title="実行に失敗しました" action={prompt ? <span className="text-[11.5px] text-ink-3">プロンプト: {prompt.slice(0, 80)}</span> : undefined}>
          <span className="font-mono text-[12px]">{job?.job.error ?? finalText ?? "unknown error"}</span>
        </Notice>
      )}

      {!streaming && (footer || message.jobId) && (
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-ink-3">
          {footer && (
            <span className="inline-flex items-center gap-1 font-mono tabular-nums">
              <ShieldCheck size={11} /> {footer.provider} · {footer.seconds}s · {footer.binary}
            </span>
          )}
          {message.jobId && !(seen && rows.length > 0) && (
            <button
              type="button"
              aria-expanded={traceOpen}
              onClick={() => setTraceOpen((current) => !current)}
              className="inline-flex items-center gap-1 rounded-[6px] px-1 py-0.5 transition-colors duration-100 hover:bg-hover-2 hover:text-ink"
            >
              <ListTree size={11} />
              {traceOpen ? "実行ログを閉じる" : traceCount > 0 ? `実行ログ (${traceCount})` : "実行ログ"}
            </button>
          )}
        </div>
      )}
    </article>
  );
}
