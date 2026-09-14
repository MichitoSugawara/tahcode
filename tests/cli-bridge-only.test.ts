import { execFileSync } from "node:child_process";

import { describe, expect, it } from "vitest";

import { bridgeArgs } from "../packages/cli/src/bridge.ts";

function cli(args: string[]): { status: number; stdout: string } {
  try {
    const stdout = execFileSync("npm", ["run", "cli", "--", ...args], {
      encoding: "utf-8",
    });
    return { status: 0, stdout };
  } catch (error) {
    const failed = error as {
      status?: number;
      stdout?: string;
      stderr?: string;
    };
    return {
      status: failed.status ?? 1,
      stdout: `${failed.stdout ?? ""}${failed.stderr ?? ""}`,
    };
  }
}

describe("bridge-only start", () => {
  it("launches the child bridge with start --foreground only", () => {
    expect(bridgeArgs({ cwd: "/tmp/work" })).toStrictEqual([
      "start",
      "--foreground",
      "--cwd",
      "/tmp/work",
    ]);
  });

  it("help names the tahcode bridge", () => {
    const output = cli(["--help"]).stdout;
    expect(output).toContain("tahcode ブリッジ");
    expect(output).not.toContain(
      "このマシンを tahcode の Org につなぎ、Multica daemon でエージェントを動かす"
    );
  });

  it("help omits leftover Multica commands", () => {
    const output = cli(["--help"]).stdout;
    expect(output).not.toContain("--daemon");
    expect(output).not.toContain("install-multica");
    expect(output).not.toContain("tahcode multica");
    expect(output).not.toContain("Multica daemon");
  });

  it("rejects --daemon", () => {
    const daemon = cli(["start", "--daemon"]);
    expect(daemon.status).not.toBe(0);
    expect(daemon.stdout).toContain(
      "Multica は tahcode のランタイムではありません"
    );
  });

  it("rejects install-multica and tahcode multica", () => {
    const install = cli(["install-multica"]);
    expect(install.status).not.toBe(0);
    expect(install.stdout).toContain("Multica コマンドは削除されました");
    const passthrough = cli(["multica", "login"]);
    expect(passthrough.status).not.toBe(0);
    expect(passthrough.stdout).toContain("Multica コマンドは削除されました");
  });

  it("rejects stop multica", () => {
    const stop = cli(["stop", "multica"]);
    expect(stop.status).not.toBe(0);
    expect(stop.stdout).toContain("対象はブリッジのみ");
  });
});
