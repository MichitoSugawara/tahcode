import { execFileSync } from "node:child_process";

import { describe, expect, it } from "vitest";

import { bridgeArgs } from "../packages/cli/src/bridge.ts";

describe("bridge-only default start", () => {
  it("passes --no-daemon when launching the child bridge", () => {
    expect(bridgeArgs({ cwd: "/tmp/work", noDaemon: true })).toStrictEqual([
      "start",
      "--foreground",
      "--no-daemon",
      "--cwd",
      "/tmp/work",
    ]);
  });

  it("omits --no-daemon only when a Multica daemon is requested", () => {
    expect(bridgeArgs({ cwd: "/tmp/work", noDaemon: false })).toStrictEqual([
      "start",
      "--foreground",
      "--cwd",
      "/tmp/work",
    ]);
  });

  it("help describes tahcode bridge as the default, not Multica as required", () => {
    const output = execFileSync("npm", ["run", "cli", "--", "--help"], {
      encoding: "utf-8",
    });
    expect(output).toContain("tahcode ブリッジ");
    expect(output).toContain("既定はブリッジのみ");
    expect(output).toContain("tahcode のジョブには不要");
    expect(output).not.toContain(
      "このマシンを tahcode の Org につなぎ、Multica daemon でエージェントを動かす"
    );
  });
});
