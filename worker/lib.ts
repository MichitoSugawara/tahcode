import {
  contentDisposition,
  normalizeContentType,
  sanitizeFileName,
} from "../shared/files.ts";

export { contentDisposition, normalizeContentType, sanitizeFileName };

export function fileKeyFromPath(pathname: string): string {
  return decodeURIComponent(pathname.slice("/api/files/".length));
}

export function downloadHeaders(
  request: Request,
  contentType: string,
  fileName: string
): Headers {
  const headers = new Headers(corsHeaders(request));
  headers.set("Content-Type", contentType);
  headers.set("Content-Disposition", contentDisposition(contentType, fileName));
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Content-Security-Policy", "default-src 'none'; sandbox");
  headers.set("Cache-Control", "private, no-store");
  return headers;
}

export function corsHeaders(request: Request): HeadersInit {
  const origin = request.headers.get("Origin") ?? "*";
  return {
    "Access-Control-Allow-Headers":
      "Content-Type, Authorization, X-File-Name, X-Upload-Ticket",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Max-Age": "86400",
  };
}

export async function callConvexJson(
  siteUrl: string,
  path: string,
  body: unknown
): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> {
  const response = await fetch(`${siteUrl.replace(/\/$/, "")}${path}`, {
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  const data = (await response.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  return { data, ok: response.ok, status: response.status };
}
