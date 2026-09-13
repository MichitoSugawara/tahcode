import { describe, expect, it } from "vitest";

import { cancelMulticaTask } from "../runtime/src/multicaCancel.ts";

describe(cancelMulticaTask, () => {
  it("returns ok:false when the Multica binary is missing", () => {
    const previous = process.env.MULTICA_BIN;
    process.env.MULTICA_BIN = "/no/such/tahcode-multica-bin";
    try {
      const result = cancelMulticaTask("task_test");
      expect(result.ok).toBeFalsy();
      expect(result.detail.length).toBeGreaterThan(0);
    } finally {
      if (previous === undefined) {
        delete process.env.MULTICA_BIN;
      } else {
        process.env.MULTICA_BIN = previous;
      }
    }
  });

  it("rejects an empty task id without spawning", () => {
    expect(cancelMulticaTask("   ")).toStrictEqual({
      detail: "empty task id",
      ok: false,
    });
  });
});
