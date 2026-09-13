import { describe, expect, it } from "vitest";

import { posixShellQuote } from "../shared/shellQuote.ts";

describe(posixShellQuote, () => {
  it("single-quotes and escapes embedded quotes", () => {
    expect(posixShellQuote("it's")).toBe(`'it'"'"'s'`);
    expect(posixShellQuote("ok")).toBe("'ok'");
  });
});
