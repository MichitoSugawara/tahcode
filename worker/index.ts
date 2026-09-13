import {
  MAX_FILE_BYTES,
  normalizeContentType,
  sanitizeFileName,
} from "../shared/files.ts";
import {
  callConvexJson,
  corsHeaders,
  downloadHeaders,
  fileKeyFromPath,
} from "./lib.ts";

export interface Env {
  ASSETS: { fetch: (request: Request) => Promise<Response> };
  CONVEX_SITE_URL?: string;
  FILES: R2Bucket;
}

function json(request: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders(request),
    },
    status,
  });
}

function requireSiteUrl(env: Env): string | null {
  const url = env.CONVEX_SITE_URL?.trim();
  return url && /^https?:\/\//.test(url) ? url : null;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders(request), status: 204 });
    }

    if (url.pathname === "/api/files" && request.method === "POST") {
      return await handleUpload(request, env);
    }

    if (url.pathname.startsWith("/api/files/") && request.method === "GET") {
      return await handleDownload(request, env, url);
    }

    if (url.pathname.startsWith("/api/")) {
      return json(request, { error: "Not found" }, 404);
    }

    return env.ASSETS.fetch(request);
  },
};

async function handleUpload(request: Request, env: Env): Promise<Response> {
  const siteUrl = requireSiteUrl(env);
  if (!siteUrl) {
    return json(request, { error: "File server is not configured" }, 503);
  }
  const ticket = request.headers.get("X-Upload-Ticket")?.trim();
  if (!ticket) {
    return json(request, { error: "Upload ticket required" }, 401);
  }
  const claimed = await callConvexJson(siteUrl, "/files/consume-upload", {
    ticket,
  });
  if (!claimed.ok || typeof claimed.data.key !== "string") {
    return json(
      request,
      { error: claimed.data.error ?? "Unauthorized" },
      claimed.status || 401
    );
  }
  const bytes = await request.arrayBuffer();
  if (bytes.byteLength === 0) {
    return json(request, { error: "Empty file" }, 400);
  }
  if (bytes.byteLength > MAX_FILE_BYTES) {
    return json(request, { error: "File exceeds 20MB" }, 413);
  }
  if (
    typeof claimed.data.size === "number" &&
    claimed.data.size > 0 &&
    bytes.byteLength !== claimed.data.size
  ) {
    return json(
      request,
      { error: "File size does not match upload ticket" },
      400
    );
  }
  const fileName = sanitizeFileName(
    decodeURIComponent(request.headers.get("X-File-Name") ?? "") ||
      (typeof claimed.data.name === "string" ? claimed.data.name : "upload.bin")
  );
  const contentType = normalizeContentType(
    request.headers.get("Content-Type") ??
      (typeof claimed.data.contentType === "string"
        ? claimed.data.contentType
        : undefined)
  );
  await env.FILES.put(claimed.data.key, bytes, {
    customMetadata: { fileName },
    httpMetadata: { contentType },
  });
  return json(request, {
    contentType,
    key: claimed.data.key,
    name: fileName,
    size: bytes.byteLength,
    url: `/api/files/${encodeURIComponent(claimed.data.key)}`,
  });
}

async function handleDownload(
  request: Request,
  env: Env,
  url: URL
): Promise<Response> {
  const siteUrl = requireSiteUrl(env);
  if (!siteUrl) {
    return json(request, { error: "File server is not configured" }, 503);
  }
  const ticket = url.searchParams.get("ticket")?.trim();
  if (!ticket) {
    return json(request, { error: "Download ticket required" }, 401);
  }
  const key = fileKeyFromPath(url.pathname);
  if (!key) {
    return json(request, { error: "Not found" }, 404);
  }
  const authorized = await callConvexJson(
    siteUrl,
    "/files/authorize-download",
    { key, ticket }
  );
  if (!authorized.ok) {
    return json(
      request,
      { error: authorized.data.error ?? "Unauthorized" },
      authorized.status || 401
    );
  }
  const object = await env.FILES.get(key);
  if (!object) {
    return json(request, { error: "Not found" }, 404);
  }
  const contentType = normalizeContentType(
    (typeof authorized.data.contentType === "string"
      ? authorized.data.contentType
      : undefined) ?? object.httpMetadata?.contentType
  );
  const fileName =
    (typeof authorized.data.name === "string" && authorized.data.name) ||
    object.customMetadata?.fileName ||
    "file";
  return new Response(object.body, {
    headers: downloadHeaders(request, contentType, fileName),
  });
}
