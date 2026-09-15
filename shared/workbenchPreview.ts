/**
 * Workbench preview contract — adapted from pingdotgg/t3code
 * `packages/contracts/src/preview.ts` and `openPreviewSession.ts`.
 *
 * t3code's in-app browser is a desktop Chromium guest; the web UI
 * reports navigation over `previewBridge`. tahcode has no guest
 * webview on the hosted page, so the Mac bridge fetches the URL
 * (localhost works on the machine) and the pane renders the snapshot.
 */

export const BRIDGE_CAPABILITY_PREVIEW = "preview";

export const DEFAULT_PREVIEW_TAB_ID = "preview-1";
export const PREVIEW_URL_MAX_LENGTH = 2048;
export const PREVIEW_TITLE_MAX = 512;
export const PREVIEW_BODY_MAX = 200_000;
export const PREVIEW_HISTORY_MAX = 20;
export const PREVIEW_FETCH_TIMEOUT_MS = 15_000;
export const PREVIEW_STALE_MS = 20_000;

export const PREVIEW_NAV_STATUSES = [
  "idle",
  "loading",
  "success",
  "failed",
] as const;

export type PreviewNavStatus = (typeof PREVIEW_NAV_STATUSES)[number];

export type PreviewUrlReason =
  | "empty"
  | "parse"
  | "unsupported-protocol"
  | "too-long";

export type ParsedPreviewUrl =
  | { ok: true; url: URL }
  | { ok: false; reason: PreviewUrlReason };

export function runtimeHasPreview(
  capabilities: readonly string[] | undefined
): boolean {
  return (capabilities ?? []).includes(BRIDGE_CAPABILITY_PREVIEW);
}

export function parsePreviewUrl(raw: string): ParsedPreviewUrl {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return { ok: false, reason: "empty" };
  }
  if (trimmed.length > PREVIEW_URL_MAX_LENGTH) {
    return { ok: false, reason: "too-long" };
  }
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    try {
      url = new URL(`http://${trimmed}`);
    } catch {
      return { ok: false, reason: "parse" };
    }
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    // `localhost:3000` parses as protocol "localhost:" — t3code still
    // treats host:port as http when the user omitted `://`.
    if (trimmed.includes("://")) {
      return { ok: false, reason: "unsupported-protocol" };
    }
    try {
      url = new URL(`http://${trimmed}`);
    } catch {
      return { ok: false, reason: "parse" };
    }
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, reason: "unsupported-protocol" };
  }
  return { ok: true, url };
}

export function previewUrlErrorMessage(reason: PreviewUrlReason): string {
  if (reason === "empty") {
    return "URL を入力してください";
  }
  if (reason === "too-long") {
    return "URL が長すぎます";
  }
  if (reason === "unsupported-protocol") {
    return "http または https の URL だけ開けます";
  }
  return "URL を解析できませんでした";
}

export function isLoopbackHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "[::1]" ||
    host === "::1"
  );
}

export function clipPreviewTitle(title: string): string {
  const trimmed = title.trim().replaceAll(/\s+/g, " ");
  if (trimmed.length <= PREVIEW_TITLE_MAX) {
    return trimmed;
  }
  return trimmed.slice(0, PREVIEW_TITLE_MAX);
}

export function clipPreviewBody(body: string): string {
  if (body.length <= PREVIEW_BODY_MAX) {
    return body;
  }
  return body.slice(0, PREVIEW_BODY_MAX);
}

export function extractHtmlTitle(html: string): string | undefined {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const text = match?.[1]?.replaceAll(/<[^>]+>/g, "").trim();
  return text && text.length > 0 ? clipPreviewTitle(text) : undefined;
}

export function isHtmlContentType(contentType: string | undefined): boolean {
  const type = (contentType ?? "").split(";")[0]?.trim().toLowerCase() ?? "";
  return type === "text/html" || type === "application/xhtml+xml";
}

export function isTextContentType(contentType: string | undefined): boolean {
  const type = (contentType ?? "").split(";")[0]?.trim().toLowerCase() ?? "";
  return type.startsWith("text/") || type === "application/json";
}

export type PreviewRenderMode =
  | "empty"
  | "loading"
  | "iframe-src"
  | "iframe-srcdoc"
  | "text"
  | "error";

export function previewRenderMode(input: {
  body?: string;
  contentType?: string;
  status: PreviewNavStatus;
  url: string;
}): PreviewRenderMode {
  if (input.status === "idle") {
    return "empty";
  }
  if (input.status === "loading") {
    return "loading";
  }
  if (input.status === "failed") {
    return "error";
  }
  const parsed = parsePreviewUrl(input.url);
  if (
    parsed.ok &&
    parsed.url.protocol === "https:" &&
    !isLoopbackHost(parsed.url.hostname)
  ) {
    return "iframe-src";
  }
  if (isHtmlContentType(input.contentType) && (input.body?.length ?? 0) > 0) {
    return "iframe-srcdoc";
  }
  if ((input.body?.length ?? 0) > 0 && isTextContentType(input.contentType)) {
    return "text";
  }
  if (parsed.ok && parsed.url.protocol === "https:") {
    return "iframe-src";
  }
  return "error";
}

export function withHtmlBase(html: string, href: string): string {
  if (/<base\s/i.test(html)) {
    return html;
  }
  const tag = `<base href="${href.replaceAll('"', "%22")}">`;
  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/<head[^>]*>/i, (open) => `${open}${tag}`);
  }
  return `${tag}${html}`;
}

export function pushPreviewHistory(
  history: readonly string[],
  url: string
): string[] {
  const next = [...history.filter((item) => item !== url), url];
  if (next.length <= PREVIEW_HISTORY_MAX) {
    return next;
  }
  return next.slice(next.length - PREVIEW_HISTORY_MAX);
}
