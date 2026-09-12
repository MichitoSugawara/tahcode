export interface Env {
  FILES: R2Bucket;
  ASSETS: { fetch: (request: Request) => Promise<Response> };
}

const MAX_BYTES = 20 * 1024 * 1024;

function corsHeaders(request: Request): HeadersInit {
  const origin = request.headers.get("Origin") ?? "*";
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
  };
}

function json(request: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders(request),
    },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(request) });
    }

    if (url.pathname === "/api/files" && request.method === "POST") {
      const contentType = request.headers.get("Content-Type") ?? "application/octet-stream";
      const fileName = request.headers.get("X-File-Name") ?? "upload.bin";
      const bytes = await request.arrayBuffer();
      if (bytes.byteLength === 0) {
        return json(request, { error: "Empty file" }, 400);
      }
      if (bytes.byteLength > MAX_BYTES) {
        return json(request, { error: "File exceeds 20MB" }, 413);
      }
      const key = `${crypto.randomUUID()}/${sanitizeName(fileName)}`;
      await env.FILES.put(key, bytes, {
        httpMetadata: { contentType },
        customMetadata: { fileName },
      });
      return json(request, {
        key,
        name: fileName,
        contentType,
        size: bytes.byteLength,
        url: `/api/files/${encodeURIComponent(key)}`,
      });
    }

    if (url.pathname.startsWith("/api/files/") && request.method === "GET") {
      const key = decodeURIComponent(url.pathname.slice("/api/files/".length));
      const object = await env.FILES.get(key);
      if (!object) {
        return json(request, { error: "Not found" }, 404);
      }
      const headers = new Headers(corsHeaders(request));
      headers.set(
        "Content-Type",
        object.httpMetadata?.contentType ?? "application/octet-stream",
      );
      headers.set(
        "Content-Disposition",
        `inline; filename="${object.customMetadata?.fileName ?? "file"}"`,
      );
      return new Response(object.body, { headers });
    }

    if (url.pathname.startsWith("/api/")) {
      return json(request, { error: "Not found" }, 404);
    }

    return env.ASSETS.fetch(request);
  },
};

function sanitizeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120) || "upload.bin";
}
