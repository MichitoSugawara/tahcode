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

export function contentDisposition(
  contentType: string,
  fileName: string
): string {
  const safe = sanitizeFileName(fileName).replaceAll('"', "");
  const mode = isInlineContentType(contentType) ? "inline" : "attachment";
  return `${mode}; filename="${safe}"`;
}
