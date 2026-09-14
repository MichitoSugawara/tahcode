import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  NO_ONLINE_RUNTIME_BODY,
  QUEUED_CLAIM_TIMEOUT_MS,
  STALE_RUNTIME_MS,
  UNCLAIMED_OFFLINE_GRACE_MS,
  hasUsableOnlineRuntime,
  isLiveRuntime,
  isNoOnlineRuntimeNotice,
  noRuntimeReplyCopy,
  queuedRuntimeWaitLabel,
  shouldFailUnclaimedJob,
  shouldShowNoRuntimeChrome,
  unclaimedJobError,
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

describe(shouldFailUnclaimedJob, () => {
  it("fails after the claim window even if the machine still looks live", () => {
    expect(
      shouldFailUnclaimedJob({
        assignedLive: true,
        now: NOW + QUEUED_CLAIM_TIMEOUT_MS,
        queuedAt: NOW,
      })
    ).toBeTruthy();
    expect(
      shouldFailUnclaimedJob({
        assignedLive: true,
        now: NOW + QUEUED_CLAIM_TIMEOUT_MS - 1,
        queuedAt: NOW,
      })
    ).toBeFalsy();
  });

  it("fails sooner when the assigned machine never heartbeats", () => {
    expect(
      shouldFailUnclaimedJob({
        assignedLive: false,
        now: NOW + UNCLAIMED_OFFLINE_GRACE_MS,
        queuedAt: NOW,
      })
    ).toBeTruthy();
    expect(
      shouldFailUnclaimedJob({
        assignedLive: false,
        now: NOW + UNCLAIMED_OFFLINE_GRACE_MS - 1,
        queuedAt: NOW,
      })
    ).toBeFalsy();
  });
});

describe(queuedRuntimeWaitLabel, () => {
  it("keeps the wait copy while live or still loading, then names a silent machine", () => {
    expect(
      queuedRuntimeWaitLabel({ assignedLive: true, runtimeName: "mac-0914" })
    ).toBe("ランタイムの受付待ち");
    expect(
      queuedRuntimeWaitLabel({ assignedLive: null, runtimeName: "mac-0914" })
    ).toBe("ランタイムの受付待ち");
    expect(
      queuedRuntimeWaitLabel({ assignedLive: false, runtimeName: "mac-0914" })
    ).toBe("mac-0914 が応答していません");
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
    expect(reply).toContain("queuedRuntimeWaitLabel");
  });

  it("keeps vendor internals out of the unclaimed-job error", () => {
    expect(unclaimedJobError("mac-0914")).not.toMatch(
      /OpenConnector|OOMOL|workers\.dev|gateway/i
    );
    expect(unclaimedJobError("mac-0914")).toContain("mac-0914");
    expect(unclaimedJobError("mac-0914")).toContain("tahcode start");
  });
});
