import { describe, expect, it } from "vitest";

import {
  contentDisposition,
  normalizeContentType,
  sanitizeFileName,
} from "../shared/files.ts";

describe("file MIME hardening", () => {
  it("forces active content to octet-stream", () => {
    expect(normalizeContentType("text/html")).toBe("application/octet-stream");
    expect(normalizeContentType("application/javascript")).toBe(
      "application/octet-stream"
    );
    expect(normalizeContentType("image/svg+xml")).toBe(
      "application/octet-stream"
    );
    expect(normalizeContentType("image/png")).toBe("image/png");
  });

  it("inlines only safe types", () => {
    expect(contentDisposition("image/png", "pic.png")).toContain("inline");
    expect(contentDisposition("text/html", "page.html")).toContain(
      "attachment"
    );
  });

  it("strips path characters from file names", () => {
    expect(sanitizeFileName("../etc/passwd")).toBe(".._etc_passwd");
  });
});
