"use client";

import { useCallback, useState } from "react";
import type { ReactNode } from "react";

/* ─────────────────────────────────────────────────────────
 * CODE BLOCK
 * A light editor panel with two versions (switch in the card):
 *   · Code — a line-numbered listing
 *   · Diff — a unified diff: old/new gutters, a green/red accent
 *     bar and row tint, plus word-level add/del highlights.
 * Both share syntax coloring, insets, and wrapping behavior.
 * ───────────────────────────────────────────────────────── */

const FILE = "churn.ts";

const CODE_LINES = [
  "export async function churnBatch() {",
  '  const flavor = await getFlavor("pistachio");',
  "  const base = await dairy.fetch({ flavor });",
  '  await freezer.store(base, { temp: "-16C" });',
  "  if (!base.approved) return null;",
  "  return base.gallons;",
  "}",
];

/* A single run of code within a diff row; `change` tints it as an add/del. */
export interface CodePiece {
  text: string;
  change?: "add" | "del";
}
/* One row of a unified diff: old/new line numbers, its kind, and its pieces. */
export interface DiffRow {
  old: number | null;
  cur: number | null;
  type: "ctx" | "add" | "del";
  pieces: CodePiece[];
}
/* Prominent copy strings on the code block. */
export interface CodeBlockLabels {
  copy: string;
  copied: string;
}

// Back-compat internal aliases for the local component signatures.
type Piece = CodePiece;
type Row = DiffRow;

const DIFF: Row[] = [
  {
    cur: 1,
    old: 1,
    pieces: [{ text: "export async function churnBatch() {" }],
    type: "ctx",
  },
  {
    cur: 2,
    old: 2,
    pieces: [{ text: '  const flavor = await getFlavor("pistachio");' }],
    type: "ctx",
  },
  {
    cur: 3,
    old: 3,
    pieces: [{ text: "  const base = await dairy.fetch({ flavor });" }],
    type: "ctx",
  },
  {
    cur: null,
    old: 4,
    pieces: [
      { text: "  await freezer.store(base, { temp: " },
      { text: '"-14C"', change: "del" },
      { text: " });" },
    ],
    type: "del",
  },
  {
    cur: 4,
    old: null,
    pieces: [
      { text: "  await freezer.store(base, { temp: " },
      { text: '"-16C"', change: "add" },
      { text: " });" },
    ],
    type: "add",
  },
  {
    cur: 5,
    old: null,
    pieces: [{ text: "  if (!base.approved) return null;" }],
    type: "add",
  },
  { cur: 6, old: 5, pieces: [{ text: "  return base.gallons;" }], type: "ctx" },
  { cur: 7, old: 6, pieces: [{ text: "}" }], type: "ctx" },
];

const HATCH =
  "repeating-linear-gradient(45deg, var(--red) 0, var(--red) 1.5px, transparent 1.5px, transparent 3px)";

/* light syntax coloring — keywords/imports/conditionals, functions, strings & numbers */
const KEYWORDS = new Set([
  "import",
  "from",
  "export",
  "default",
  "async",
  "function",
  "const",
  "let",
  "var",
  "await",
  "return",
  "if",
  "else",
  "for",
  "while",
  "new",
  "throw",
  "try",
  "catch",
  "null",
  "true",
  "false",
  "undefined",
]);
const TOKEN =
  /("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`[^`]*`|\b\d+(?:\.\d+)?\b|\b(?:import|from|export|default|async|function|const|let|var|await|return|if|else|for|while|new|throw|try|catch|null|true|false|undefined)\b|[A-Za-z_$][\w$]*(?=\s*\())/g;

function highlight(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let last = 0;
  let k = 0;
  for (const m of text.matchAll(TOKEN)) {
    const idx = m.index ?? 0;
    const t = m[0];
    if (idx > last) {
      nodes.push(<span key={k++}>{text.slice(last, idx)}</span>);
    }
    let color: string;
    let weight: number | undefined;
    if (/^["'`]/.test(t) || /^\d/.test(t)) {
      color = "var(--orange)";
    } // string / number
    else if (KEYWORDS.has(t)) {
      color = "var(--accent-ink)";
    } // keyword / import / conditional
    else {
      color = "var(--ink)";
      weight = 500;
    } // function call
    nodes.push(
      <span key={k++} style={{ color, fontWeight: weight }}>
        {t}
      </span>
    );
    last = idx + t.length;
  }
  if (last < text.length) {
    nodes.push(<span key={k++}>{text.slice(last)}</span>);
  }
  return nodes;
}

function Pieces({ pieces }: { pieces: Piece[] }) {
  return (
    <>
      {pieces.map((p, i) => {
        if (p.change) {
          const add = p.change === "add";
          return (
            <span
              key={i}
              className="rounded-[3px]"
              style={{
                WebkitBoxDecorationBreak: "clone",
                background: `color-mix(in srgb, var(--${add ? "green" : "red"}) 18%, transparent)`,
                boxDecorationBreak: "clone",
                margin: "0 -1px",
                padding: "0 2px",
              }}
            >
              {highlight(p.text)}
            </span>
          );
        }
        return <span key={i}>{highlight(p.text)}</span>;
      })}
    </>
  );
}

function FileIcon() {
  return (
    <svg
      aria-hidden
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-ink-3 shrink-0"
    >
      <path d="M17.25 6.75 22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3-4.5 16.5" />
    </svg>
  );
}

const DEFAULT_LABELS: CodeBlockLabels = { copied: "Copied", copy: "Copy" };

export interface CodeBlockProps {
  /** Which view to render — "Code" (line-numbered listing) or "Diff". */
  variant?: string;
  /** The lines shown in the Code view. */
  lines?: string[];
  /** Raw text placed on the clipboard by Copy. Defaults to `lines` joined. */
  code?: string;
  /** The unified-diff rows shown in the Diff view. */
  diff?: DiffRow[];
  /** Filename shown in the header. */
  filename?: string;
  /** Prominent copy strings. */
  labels?: Partial<CodeBlockLabels>;
  /** Called with the copied text after a successful copy. */
  onCopy?: (text: string) => void;
  /** fill the parent width instead of the gallery's fixed measure */
  fill?: boolean;
}

export default function CodeBlock({
  variant = "Code",
  lines = CODE_LINES,
  code,
  diff = DIFF,
  filename = FILE,
  labels,
  onCopy,
  fill = false,
}: CodeBlockProps) {
  const [copied, setCopied] = useState(false);
  const isDiff = variant === "Diff";
  const text = { ...DEFAULT_LABELS, ...labels };
  const raw = code ?? lines.join("\n");

  const copy = useCallback(() => {
    navigator.clipboard.writeText(raw).then(() => {
      setCopied(true);
      onCopy?.(raw);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [raw, onCopy]);

  const added = diff.filter((r) => r.type === "add").length;
  const removed = diff.filter((r) => r.type === "del").length;

  return (
    <div
      className={`rounded-card bg-surface shadow-card w-full overflow-hidden ${fill ? "" : "max-w-105"}`}
    >
      {/* header — file · (diff stat | copy) */}
      <div className="border-line flex h-11 items-center gap-2 border-b px-4 text-[12.5px]">
        <span className="inline-flex min-w-0 items-center gap-[7px]">
          <FileIcon />
          <span className="text-ink truncate font-mono leading-none">
            {filename}
          </span>
        </span>

        {isDiff ? (
          <span className="ml-auto inline-flex items-center gap-2 font-mono text-[12px] leading-none tabular-nums">
            <span className="text-green">+{added}</span>
            <span className="text-red">-{removed}</span>
          </span>
        ) : (
          <button
            type="button"
            aria-label="Copy code"
            onClick={copy}
            className={`hover:bg-hover -mr-1 ml-auto flex h-6 items-center gap-1 rounded-[6px] px-1.5 text-[12px] font-medium transition-colors duration-100 ${copied ? "text-green" : "text-ink-3 hover:text-ink"}`}
          >
            {copied ? (
              <svg
                width="11"
                height="11"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M20 6L9 17l-5-5" />
              </svg>
            ) : (
              <svg
                width="11"
                height="11"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="9" y="9" width="12" height="12" rx="2.5" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
            )}
            {copied ? text.copied : text.copy}
          </button>
        )}
      </div>

      {/* body — equal 12px inset on top / left / right; lines wrap */}
      <div className="text-ink-2 py-3 font-mono text-[12.5px] leading-[1.65]">
        {isDiff ? (
          <div className="relative">
            <span className="bg-line pointer-events-none absolute inset-y-0 left-5 w-px" />
            {diff.map((r, i) => {
              const add = r.type === "add";
              const del = r.type === "del";
              // one gutter column: removals keep the old number, additions/context show the new one
              const num = del ? r.old : r.cur;
              return (
                <div
                  key={i}
                  className={`relative grid grid-cols-[20px_minmax(0,1fr)] items-start ${add ? "bg-green-tint" : del ? "bg-red-tint" : ""}`}
                >
                  {(add || del) && (
                    <span
                      className="absolute inset-y-0 left-0 w-[3px]"
                      style={{ background: add ? "var(--green)" : HATCH }}
                    />
                  )}
                  <span
                    className={`text-center text-[11px] select-none ${add ? "text-green" : del ? "text-red" : "text-ink-3"}`}
                  >
                    {num ?? ""}
                  </span>
                  <code className="pr-3 pl-1 break-words whitespace-pre-wrap">
                    <Pieces pieces={r.pieces} />
                  </code>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="relative">
            <span className="bg-line pointer-events-none absolute inset-y-0 left-5 w-px" />
            {lines.map((line, i) => (
              <div
                key={i}
                className="grid grid-cols-[20px_minmax(0,1fr)] items-start"
              >
                <span className="text-ink-3 text-center text-[11px] select-none">
                  {i + 1}
                </span>
                <code className="pr-3 pl-1 break-words whitespace-pre-wrap">
                  {highlight(line)}
                </code>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
