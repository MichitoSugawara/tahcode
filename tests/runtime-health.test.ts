import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  NO_ONLINE_RUNTIME_BODY,
  STALE_RUNTIME_MS,
  hasUsableOnlineRuntime,
  isLiveRuntime,
  isNoOnlineRuntimeNotice,
  noRuntimeReplyCopy,
  shouldShowNoRuntimeChrome,
} from "../shared/runtimeHealth.ts";

const NOW = 1_700_000_000_000;

function runtime(input: {
  canUse?: boolean;
  lastSeenAt?: number;
  status?: "online" | "offline";
}) {
  return {
    canUse: input.canUse ?? true,
    lastSeenAt: input.lastSeenAt,
    status: input.status ?? "online",
  };
}

describe(isLiveRuntime, () => {
  it("requires a fresh heartbeat, not just status=online", () => {
    expect(
      isLiveRuntime(runtime({ lastSeenAt: NOW - 1_000 }), NOW)
    ).toBeTruthy();
    expect(
      isLiveRuntime(
        runtime({ lastSeenAt: NOW - STALE_RUNTIME_MS, status: "online" }),
        NOW
      )
    ).toBeFalsy();
    expect(
      isLiveRuntime(
        runtime({ lastSeenAt: NOW - 1_000, status: "offline" }),
        NOW
      )
    ).toBeFalsy();
  });
});

describe(hasUsableOnlineRuntime, () => {
  it("is false when the org has no runtimes", () => {
    expect(hasUsableOnlineRuntime([], NOW)).toBeFalsy();
  });

  it("treats any live permitted machine as usable, not only a designated one", () => {
    const designatedOffline = runtime({
      lastSeenAt: NOW - STALE_RUNTIME_MS - 1,
      status: "online",
    });
    const otherOnline = runtime({ lastSeenAt: NOW - 5_000 });
    expect(
      hasUsableOnlineRuntime([designatedOffline, otherOnline], NOW)
    ).toBeTruthy();
  });

  it("ignores live machines the viewer cannot use", () => {
    expect(
      hasUsableOnlineRuntime(
        [runtime({ canUse: false, lastSeenAt: NOW - 1_000 })],
        NOW
      )
    ).toBeFalsy();
  });
});

describe(shouldShowNoRuntimeChrome, () => {
  it("hides while the runtime list is still loading", () => {
    expect(shouldShowNoRuntimeChrome(undefined, NOW)).toBeFalsy();
  });

  it("shows when nothing usable is online, then hides once one is", () => {
    const offline = runtime({ lastSeenAt: NOW - 1_000, status: "offline" });
    expect(shouldShowNoRuntimeChrome([offline], NOW)).toBeTruthy();
    const online = runtime({ lastSeenAt: NOW - 1_000 });
    expect(shouldShowNoRuntimeChrome([offline, online], NOW)).toBeFalsy();
  });
});

describe(isNoOnlineRuntimeNotice, () => {
  it("matches the jobless setup reply, not a real agent run", () => {
    expect(isNoOnlineRuntimeNotice({ jobId: undefined })).toBeTruthy();
    expect(
      isNoOnlineRuntimeNotice({ jobId: "jobs:1", runtimeId: "runtimes:1" })
    ).toBeFalsy();
  });
});

describe("no-runtime copy", () => {
  it("keeps vendor internals out of the setup body", () => {
    expect(NO_ONLINE_RUNTIME_BODY).not.toMatch(
      /OpenConnector|OOMOL|workers\.dev|gateway/i
    );
    expect(NO_ONLINE_RUNTIME_BODY).toContain("tahcode start");
  });

  it("uses a quiet historical line instead of a sticky warning wall", () => {
    expect(noRuntimeReplyCopy(false)).toContain("実行しませんでした");
    expect(noRuntimeReplyCopy(true)).toContain(
      "送信時はオンラインのランタイムがなかった"
    );
    const reply = readFileSync("src/harness/thread/AgentReply.tsx", "utf-8");
    expect(reply).not.toContain(
      "オンラインで利用できるマシンランタイムがありません"
    );
    expect(reply).toContain("noRuntimeReplyCopy");
  });
});
