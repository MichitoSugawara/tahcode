import { spawn } from "node:child_process";

import { describe, expect, it } from "vitest";

import { abortSpawnedProcess } from "../runtime/src/providers.ts";

describe(abortSpawnedProcess, () => {
  it("kills a long-running child process group", async () => {
    const child = spawn("sleep", ["30"], {
      detached: true,
      stdio: "ignore",
    });
    const started = Date.now();
    const closed = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error("process was not killed"));
      }, 4000);
      child.on("close", () => {
        clearTimeout(timer);
        resolve();
      });
      child.on("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
    });
    abortSpawnedProcess(child);
    await closed;
    expect(Date.now() - started).toBeLessThan(4000);
  });
});
