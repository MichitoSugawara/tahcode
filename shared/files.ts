export const MAX_FILE_BYTES = 20 * 1024 * 1024;
export const UPLOAD_TICKET_TTL_MS = 15 * 60 * 1000;
export const DOWNLOAD_TICKET_TTL_MS = 60 * 60 * 1000;

const ACTIVE_CONTENT_TYPES = new Set([
  "application/javascript",
  "application/xhtml+xml",
  "application/xml",
  "image/svg+xml",
  "text/html",
  "text/javascript",
  "text/xml",
]);

const INLINE_CONTENT_TYPES = new Set([
  "application/pdf",
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/webp",
  "text/markdown",
  "text/plain",
]);

export function sanitizeFileName(name: string): string {
  const cleaned = name
    .replaceAll(/[\r\n\0]/g, "")
    .replaceAll(/[^a-zA-Z0-9._-]/g, "_")
    .slice(0, 120);
  return cleaned || "upload.bin";
}

export function normalizeContentType(value: string | undefined): string {
  const raw = (value ?? "application/octet-stream").split(";")[0]?.trim() ?? "";
  const type = raw.toLowerCase();
  if (!type || ACTIVE_CONTENT_TYPES.has(type) || type.includes("javascript")) {
    return "application/octet-stream";
  }
  return type;
}

export function isInlineContentType(contentType: string): boolean {
  return INLINE_CONTENT_TYPES.has(contentType);
}

const IMAGE_EXTENSIONS: Record<string, string> = {
  gif: "image/gif",
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

export function contentTypeFromFileName(name: string): string | undefined {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return IMAGE_EXTENSIONS[ext];
}

export function isImageContentType(contentType: string): boolean {
  return contentType.startsWith("image/") && contentType !== "image/svg+xml";
}

/** `/api/files/<key>` with an optional ticket query. */
export function fileKeyFromHref(href: string): string | null {
  if (!href.startsWith("/api/files/")) {
    return null;
  }
  const url = new URL(href, "https://tahcode.invalid");
  const key = decodeURIComponent(url.pathname.slice("/api/files/".length));
  return key || null;
}

export function contentDisposition(
  contentType: string,
  fileName: string
): string {
  const safe = sanitizeFileName(fileName).replaceAll('"', "");
  const mode = isInlineContentType(contentType) ? "inline" : "attachment";
  return `${mode}; filename="${safe}"`;
}
