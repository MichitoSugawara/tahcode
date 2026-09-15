import { describe, expect, it } from "vitest";

import { fetchPreviewPage } from "../runtime/src/previewFetch.ts";

describe("preview fetch", () => {
  it("stores HTML from the machine-side fetch", async () => {
    const result = await fetchPreviewPage(
      "http://localhost:3000",
      async () =>
        new Response("<html><title>Local</title><body>ok</body></html>", {
          headers: { "content-type": "text/html" },
          status: 200,
        })
    );
    expect(result).toMatchObject({
      httpStatus: 200,
      title: "Local",
    });
    expect(result.body).toContain("ok");
  });

  it("surfaces HTTP failures without inventing a body", async () => {
    const result = await fetchPreviewPage(
      "http://localhost:9",
      async () => new Response("nope", { status: 502 })
    );
    expect(result.error).toContain("502");
    expect(result.body).toBeUndefined();
  });

  it("rejects file URLs before fetch", async () => {
    const result = await fetchPreviewPage("file:///tmp/x");
    expect(result.error).toContain("http");
  });
});
