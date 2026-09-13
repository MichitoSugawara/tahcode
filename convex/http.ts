import { httpRouter } from "convex/server";

import { internal } from "./_generated/api";
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

export default http;
