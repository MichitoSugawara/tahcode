import type { ReactElement, SVGProps } from "react";

import { Monogram } from "@/components/atoms/EntityChip";
import { PROVIDERS, isProviderKind } from "@/lib/providers";
import type { ProviderDriverKind } from "@/lib/providers";

type MarkProps = SVGProps<SVGSVGElement>;

/** Simple Icons OpenAI mark (CC0). */
function OpenAIMark(props: MarkProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden {...props}>
      <path
        fill="currentColor"
        d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zm-9.022 12.608a4.476 4.476 0 0 1-2.876-1.041l.142-.08 4.778-2.758a.795.795 0 0 0 .393-.682v-6.736l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.495 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.758a.771.771 0 0 0 .78 0l5.843-3.368v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.814 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.872zm16.597 3.855-5.833-3.387L15.119 7.2a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667zm2.01-3.023-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zm-12.64 4.135-2.02-1.164a.08.08 0 0 1-.038-.057V6.074a4.5 4.5 0 0 1 7.376-3.454l-.142.081-4.778 2.758a.795.795 0 0 0-.393.681zm1.098-2.365 2.602-1.5 2.607 1.5v2.999l-2.598 1.5-2.606-1.5z"
      />
    </svg>
  );
}

/** Simple Icons Anthropic mark (CC0) — Claude. */
function ClaudeMark(props: MarkProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden {...props}>
      <path
        fill="currentColor"
        d="M17.304 3.541h-3.672l6.696 16.918H24Zm-10.608 0L0 20.459h3.744l1.37-3.553h7.005l1.369 3.553h3.744L10.536 3.541Zm-.371 10.223 2.291-5.946 2.292 5.946Z"
      />
    </svg>
  );
}

/** Simple Icons Cursor mark (CC0). */
function CursorMark(props: MarkProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden {...props}>
      <path
        fill="currentColor"
        d="M11.503.131 1.891 5.678a.84.84 0 0 0-.42.726v11.188c0 .3.162.575.42.724l9.609 5.55a1 1 0 0 0 .998 0l9.61-5.55a.84.84 0 0 0 .42-.724V6.404a.84.84 0 0 0-.42-.726L12.497.131a1.01 1.01 0 0 0-.996 0M2.657 6.338h18.55c.263 0 .43.287.297.515L12.23 22.918c-.062.107-.229.064-.229-.06V12.335a.59.59 0 0 0-.295-.51l-9.11-5.257c-.109-.063-.064-.23.061-.23"
      />
    </svg>
  );
}

/** xAI / Grok mark — lean two-path silhouette (t3code GrokIcon). */
function GrokMark(props: MarkProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden {...props}>
      <path
        fill="currentColor"
        d="M9.26905 15.284L17.2479 9.36086C17.6391 9.07047 18.1981 9.18374 18.3845 9.63478C19.3655 12.0135 18.9272 14.8721 16.9755 16.8349C15.0238 18.7976 12.3082 19.228 9.8261 18.2477L7.1146 19.5102C11.0037 22.1834 15.7263 21.5223 18.6774 18.5525C21.0182 16.1985 21.7432 12.9897 21.0653 10.0961L21.0714 10.1023C20.0884 5.85143 21.3131 4.15233 23.8218 0.677913C23.8812 0.595532 23.9406 0.513151 24 0.428711L20.6987 3.74866V3.73836L9.267 15.2861"
      />
      <path
        fill="currentColor"
        d="M7.62249 16.7237C4.83113 14.0422 5.3124 9.89222 7.69417 7.49905C9.45541 5.72786 12.341 5.00497 14.86 6.06768L17.5653 4.81138C17.0779 4.45714 16.4533 4.07613 15.7365 3.80839C12.4966 2.46764 8.6178 3.13492 5.98413 5.78141C3.45081 8.32904 2.65415 12.2463 4.02219 15.5889C5.04412 18.0871 3.36889 19.8541 1.68137 21.6377C1.08337 22.2699 0.483318 22.9022 0 23.5716L7.62045 16.7257"
      />
    </svg>
  );
}

/** OpenCode window mark (even-odd frame). */
function OpenCodeMark(props: MarkProps) {
  return (
    <svg viewBox="0 0 32 40" aria-hidden {...props}>
      <path
        fill="currentColor"
        fillRule="evenodd"
        d="M24 8H8v24h16V8Zm8 32H0V0h32v40Z"
      />
    </svg>
  );
}

const BRAND_MARK: Partial<
  Record<ProviderDriverKind, (props: MarkProps) => ReactElement>
> = {
  claudeAgent: ClaudeMark,
  codex: OpenAIMark,
  cursor: CursorMark,
  grok: GrokMark,
  opencode: OpenCodeMark,
};

export function hasProviderBrandIcon(kind?: string | null): boolean {
  return Boolean(kind && kind in BRAND_MARK);
}

/**
 * Provider brand mark in the existing monogram chip. Unknown kinds
 * (and Antigravity, whose mark is a raster) fall back to the letter.
 */
export function ProviderMark({
  kind,
  className = "size-4",
}: {
  kind?: string | null;
  className?: string;
}) {
  const info = kind && isProviderKind(kind) ? PROVIDERS[kind] : undefined;
  const Mark = kind && isProviderKind(kind) ? (BRAND_MARK[kind] ?? null) : null;
  if (Mark && info) {
    return (
      <span
        className={`flex shrink-0 items-center justify-center rounded-full text-white ${className}`}
        style={{ background: info.color }}
        aria-hidden
      >
        <Mark className="size-[58%]" />
      </span>
    );
  }
  return (
    <Monogram color={info?.color} className={className}>
      {(info?.label ?? "?").charAt(0)}
    </Monogram>
  );
}
