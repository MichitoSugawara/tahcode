import { describe, expect, it } from "vitest";

import {
  BRIDGE_CAPABILITY_PREVIEW,
  clipPreviewBody,
  extractHtmlTitle,
  parsePreviewUrl,
  previewRenderMode,
  previewUrlErrorMessage,
  pushPreviewHistory,
  runtimeHasPreview,
  withHtmlBase,
} from "../shared/workbenchPreview.ts";

describe("workbench preview contract", () => {
  it("advertises the preview capability bit", () => {
    expect(runtimeHasPreview([BRIDGE_CAPABILITY_PREVIEW])).toBeTruthy();
    expect(runtimeHasPreview([])).toBeFalsy();
  });

  it("parses URLs the way t3code PreviewInvalidUrlError does", () => {
    expect(parsePreviewUrl("").ok).toBeFalsy();
    expect(parsePreviewUrl("not a url").ok).toBeFalsy();
    expect(parsePreviewUrl("ftp://example.com")).toMatchObject({
      ok: false,
      reason: "unsupported-protocol",
    });
    expect(parsePreviewUrl("https://example.com/app").ok).toBeTruthy();
  });

  it("treats a host:port as http like t3code's URL normalizer", () => {
    const local = parsePreviewUrl("localhost:3000");
    expect(local.ok).toBeTruthy();
    expect("url" in local ? local.url.href : "").toBe("http://localhost:3000/");
  });

  it("explains invalid URLs in Japanese", () => {
    expect(previewUrlErrorMessage("empty")).toContain("URL");
    expect(previewUrlErrorMessage("unsupported-protocol")).toContain("https");
  });

  it("picks iframe-src for public https and srcdoc for machine HTML", () => {
    expect(
      previewRenderMode({
        status: "success",
        url: "https://example.com",
      })
    ).toBe("iframe-src");
    expect(
      previewRenderMode({
        body: "<html><body>ok</body></html>",
        contentType: "text/html",
        status: "success",
        url: "http://localhost:5173",
      })
    ).toBe("iframe-srcdoc");
    expect(
      previewRenderMode({
        body: '{"ok":true}',
        contentType: "application/json",
        status: "success",
        url: "http://127.0.0.1:8787/health",
      })
    ).toBe("text");
    expect(previewRenderMode({ status: "idle", url: "" })).toBe("empty");
    expect(
      previewRenderMode({
        status: "failed",
        url: "http://localhost:9",
      })
    ).toBe("error");
  });

  it("injects a base href so relative assets resolve against the machine URL", () => {
    expect(
      withHtmlBase("<html><head></head></html>", "http://localhost:3000/")
    ).toContain('<base href="http://localhost:3000/">');
    expect(extractHtmlTitle("<html><title>  App  </title></html>")).toBe("App");
    expect(clipPreviewBody("ab")).toHaveLength(2);
    expect(pushPreviewHistory(["a", "b"], "a")).toStrictEqual(["b", "a"]);
  });
});
