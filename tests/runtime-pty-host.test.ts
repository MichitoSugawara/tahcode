import { existsSync } from "node:fs";
import { homedir } from "node:os";

import { describe, expect, it } from "vitest";

import {
  encodePtyCommand,
  parsePtyHostLine,
  PtyProcess,
  resolvePtyCwd,
} from "../runtime/src/ptyHost.ts";
import type { PtyHostEvent } from "../runtime/src/ptyHost.ts";

describe("pty host protocol", () => {
  it("round-trips write/resize/close lines", () => {
    expect(encodePtyCommand({ data: "ls\r", kind: "write" })).toBe(
      `W ${Buffer.from("ls\r", "utf-8").toString("base64")}\n`
    );
    expect(encodePtyCommand({ cols: 80, kind: "resize", rows: 24 })).toBe(
      "R 80 24\n"
    );
    expect(encodePtyCommand({ kind: "close" })).toBe("C\n");
  });

  it("parses started/output/exit the way the Python helper emits them", () => {
    expect(parsePtyHostLine("S 4242")).toStrictEqual({
      kind: "started",
      pid: 4242,
    });
    expect(
      parsePtyHostLine(`O ${Buffer.from("hi", "utf-8").toString("base64")}`)
    ).toStrictEqual({ data: "hi", kind: "output" });
    expect(parsePtyHostLine("X 0")).toStrictEqual({ code: 0, kind: "exit" });
    expect(parsePtyHostLine("E boom")).toStrictEqual({
      kind: "error",
      message: "boom",
    });
  });

  it("resolves an empty cwd to the home directory", () => {
    expect(resolvePtyCwd("", "/Users/ada")).toBe("/Users/ada");
    expect(resolvePtyCwd("~/code", "/Users/ada")).toBe("/Users/ada/code");
  });
});

function waitFor(predicate: () => boolean, timeoutMs = 8000): Promise<void> {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      if (predicate()) {
        resolve();
        return;
      }
      if (Date.now() - started > timeoutMs) {
        reject(new Error("timed out waiting for PTY event"));
        return;
      }
      setTimeout(tick, 40);
    };
    tick();
  });
}

describe("pty host smoke", () => {
  it("forks a local shell through python3 and echoes a marker", async () => {
    const python =
      existsSync("/usr/bin/python3") || existsSync("/usr/bin/python");
    expect(python).toBeTruthy();
    const events: PtyHostEvent[] = [];
    const process = new PtyProcess(homedir(), 80, 24, (event) => {
      events.push(event);
    });
    try {
      await waitFor(() => events.some((event) => event.kind === "started"));
      process.write("echo tah69-pty\r");
      await waitFor(() =>
        events.some(
          (event) => event.kind === "output" && event.data.includes("tah69-pty")
        )
      );
      expect(
        events.some(
          (event) => event.kind === "output" && event.data.includes("tah69-pty")
        )
      ).toBeTruthy();
    } finally {
      process.close();
    }
  }, 12_000);
});
