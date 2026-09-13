import { describe, expect, it } from "vitest";

import { isReservedHandle, normalizeHandle } from "../shared/handles.ts";

describe("handles", () => {
  it("normalizes to a short lowercase token", () => {
    expect(normalizeHandle("Mai-Chan!")).toBe("maichan");
    expect(normalizeHandle("  Admin_1  ")).toBe("admin_1");
  });

  it("reserves product and provider handles", () => {
    expect(isReservedHandle("admin")).toBeTruthy();
    expect(isReservedHandle("codex")).toBeTruthy();
    expect(isReservedHandle("claude")).toBeTruthy();
    expect(isReservedHandle("cursor")).toBeTruthy();
    expect(isReservedHandle("mai")).toBeFalsy();
  });
});
