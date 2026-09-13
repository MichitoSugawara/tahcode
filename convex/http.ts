import { httpRouter } from "convex/server";

import { MAX_FILE_BYTES, normalizeContentType } from "../shared/files.ts";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { httpAction } from "./_generated/server";
import { auth } from "./auth";

const http = httpRouter();
auth.addHttpRoutes(http);

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
    status,
  });
}

http.route({
  handler: httpAction(async (ctx, request) => {
    try {
      const payload = (await request.json()) as { ticket?: unknown };
      if (typeof payload.ticket !== "string" || payload.ticket.length < 8) {
        return json({ error: "Invalid upload ticket" }, 400);
      }
      const result = await ctx.runMutation(internal.files.consumeUploadTicket, {
        ticket: payload.ticket,
      });
      return json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unauthorized";
      return json({ error: message }, 401);
    }
  }),
  method: "POST",
  path: "/files/consume-upload",
});

http.route({
  handler: httpAction(async (ctx, request) => {
    try {
      const payload = (await request.json()) as {
        key?: unknown;
        ticket?: unknown;
      };
      if (
        typeof payload.ticket !== "string" ||
        typeof payload.key !== "string"
      ) {
        return json({ error: "Invalid download ticket" }, 400);
      }
      const result = await ctx.runQuery(
        internal.files.authorizeDownloadTicket,
        { key: payload.key, ticket: payload.ticket }
      );
      if (!result) {
        return json({ error: "Unauthorized" }, 401);
      }
      return json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unauthorized";
      return json({ error: message }, 401);
    }
  }),
  method: "POST",
  path: "/files/authorize-download",
});

http.route({
  handler: httpAction(async (ctx, request) => {
    try {
      const runtimeId = request.headers.get("X-Runtime-Id")?.trim();
      const token = request.headers.get("X-Runtime-Token")?.trim();
      const jobId = request.headers.get("X-Job-Id")?.trim();
      const leaseId = request.headers.get("X-Lease-Id")?.trim();
      const rawName = request.headers.get("X-File-Name")?.trim();
      const rawPath = request.headers.get("X-Local-Path")?.trim();
      if (!runtimeId || !token || !jobId || !leaseId || !rawName) {
        return json({ error: "Missing artifact ingest headers" }, 401);
      }
      const bytes = await request.arrayBuffer();
      if (bytes.byteLength === 0) {
        return json({ error: "Empty file" }, 400);
      }
      if (bytes.byteLength > MAX_FILE_BYTES) {
        return json({ error: "File exceeds 20MB" }, 413);
      }
      const contentType = normalizeContentType(
        request.headers.get("Content-Type") ?? undefined
      );
      const blob = new Blob([new Uint8Array(bytes)], { type: contentType });
      const storageId = await ctx.storage.store(blob);
      const result = await ctx.runMutation(internal.files.ingestFromRuntime, {
        contentType,
        jobId: jobId as Id<"jobs">,
        leaseId,
        localPath: rawPath ? decodeURIComponent(rawPath) : undefined,
        name: decodeURIComponent(rawName),
        runtimeId: runtimeId as Id<"runtimes">,
        size: bytes.byteLength,
        storageId,
        token,
      });
      return json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unauthorized";
      return json({ error: message }, 401);
    }
  }),
  method: "POST",
  path: "/artifacts/ingest",
});

export default http;
