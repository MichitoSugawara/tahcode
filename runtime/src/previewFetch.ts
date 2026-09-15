import {
  clipPreviewBody,
  clipPreviewTitle,
  extractHtmlTitle,
  isHtmlContentType,
  isTextContentType,
  parsePreviewUrl,
  PREVIEW_FETCH_TIMEOUT_MS,
  previewUrlErrorMessage,
} from "../../shared/workbenchPreview.ts";

export type PreviewFetchResult = {
  body?: string;
  contentType?: string;
  error?: string;
  httpStatus?: number;
  title?: string;
  url: string;
};

export async function fetchPreviewPage(
  rawUrl: string,
  fetchImpl: typeof fetch = fetch
): Promise<PreviewFetchResult> {
  const parsed = parsePreviewUrl(rawUrl);
  if (!parsed.ok) {
    return {
      error: previewUrlErrorMessage(parsed.reason),
      url: rawUrl,
    };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, PREVIEW_FETCH_TIMEOUT_MS);
  try {
    const response = await fetchImpl(parsed.url.href, {
      headers: { Accept: "text/html,application/xhtml+xml,text/*,*/*;q=0.8" },
      redirect: "follow",
      signal: controller.signal,
    });
    const contentType = response.headers.get("content-type") ?? undefined;
    const url = response.url || parsed.url.href;
    if (!response.ok) {
      return {
        contentType,
        error: `HTTP ${response.status}`,
        httpStatus: response.status,
        url,
      };
    }
    if (isHtmlContentType(contentType) || isTextContentType(contentType)) {
      const text = clipPreviewBody(await response.text());
      return {
        body: text,
        contentType,
        httpStatus: response.status,
        title: isHtmlContentType(contentType)
          ? extractHtmlTitle(text)
          : clipPreviewTitle(parsed.url.hostname),
        url,
      };
    }
    await response.arrayBuffer().catch(() => {});
    return {
      contentType,
      httpStatus: response.status,
      title: clipPreviewTitle(parsed.url.hostname),
      url,
    };
  } catch (error) {
    const message =
      error instanceof Error && error.name === "AbortError"
        ? "プレビューの読み込みがタイムアウトしました"
        : error instanceof Error
          ? error.message
          : String(error);
    return { error: message.slice(0, 2000), url: parsed.url.href };
  } finally {
    clearTimeout(timer);
  }
}
