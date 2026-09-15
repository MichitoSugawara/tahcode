import { previewRenderMode, withHtmlBase } from "@shared/workbenchPreview.ts";
import type { PreviewNavStatus } from "@shared/workbenchPreview.ts";

export function PreviewFrame({
  body,
  contentType,
  error,
  status,
  url,
}: {
  body?: string;
  contentType?: string;
  error?: string;
  status: PreviewNavStatus;
  url: string;
}) {
  const mode = previewRenderMode({ body, contentType, status, url });
  if (mode === "loading") {
    return (
      <div
        data-workbench-preview-loading
        className="text-ink-3 flex min-h-0 flex-1 items-center justify-center text-[12.5px]"
      >
        マシン経由で読み込んでいます…
      </div>
    );
  }
  if (mode === "iframe-src") {
    return (
      <iframe
        title="プレビュー"
        data-workbench-preview-frame
        sandbox="allow-scripts allow-forms allow-popups"
        src={url}
        className="min-h-0 w-full flex-1 border-0 bg-white"
      />
    );
  }
  if (mode === "iframe-srcdoc" && body) {
    return (
      <iframe
        title="プレビュー"
        data-workbench-preview-frame
        sandbox="allow-scripts allow-forms"
        srcDoc={withHtmlBase(body, url)}
        className="min-h-0 w-full flex-1 border-0 bg-white"
      />
    );
  }
  if (mode === "text" && body) {
    return (
      <pre
        data-workbench-preview-text
        className="text-ink min-h-0 flex-1 overflow-auto px-3 py-2 font-mono text-[12px] whitespace-pre-wrap"
      >
        {body}
      </pre>
    );
  }
  if (mode === "error") {
    return (
      <div
        data-workbench-preview-error
        className="text-ink-2 flex min-h-0 flex-1 items-center justify-center px-4 text-center text-[12.5px]"
      >
        {error ?? "ページを開けませんでした"}
      </div>
    );
  }
  return null;
}
