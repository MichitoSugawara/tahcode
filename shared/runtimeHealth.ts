/** Heartbeat older than this is treated as dead (server + UI). */
export const STALE_RUNTIME_MS = 90_000;

/**
 * Agent reply written when send cannot pick an online runtime.
 * The chat UI must not keep this as a sticky warning wall — live chrome
 * hides once any usable runtime is online.
 */
export const NO_ONLINE_RUNTIME_BODY =
  "オンラインのマシンランタイムがありません。設定のランタイムからこのマシンを登録し、`npm i -g tahcode` → `tahcode link …` → `tahcode start` を実行してください。";

export type RuntimePresence = {
  canUse?: boolean;
  lastSeenAt?: number;
  status: string;
};

export function isLiveRuntime(
  runtime: Pick<RuntimePresence, "lastSeenAt" | "status">,
  now = Date.now(),
  staleAfterMs = STALE_RUNTIME_MS
): boolean {
  return (
    runtime.status === "online" &&
    runtime.lastSeenAt !== undefined &&
    now - runtime.lastSeenAt < staleAfterMs
  );
}

/** True when the chat can dispatch to at least one live, permitted runtime. */
export function hasUsableOnlineRuntime(
  runtimes: readonly RuntimePresence[],
  now: number,
  staleAfterMs = STALE_RUNTIME_MS
): boolean {
  return runtimes.some(
    (runtime) =>
      runtime.canUse === true && isLiveRuntime(runtime, now, staleAfterMs)
  );
}

/**
 * Live composer chrome: hide while the org runtime list is loading, and
 * hide as soon as any usable machine is online (designated or not).
 */
export function shouldShowNoRuntimeChrome(
  runtimes: readonly RuntimePresence[] | undefined,
  now: number,
  staleAfterMs = STALE_RUNTIME_MS
): boolean {
  if (runtimes === undefined) {
    return false;
  }
  return !hasUsableOnlineRuntime(runtimes, now, staleAfterMs);
}

/** Server writes these without a job or runtime when nothing can pick up. */
export function isNoOnlineRuntimeNotice(message: {
  jobId?: unknown;
  runtimeId?: unknown;
}): boolean {
  return !message.jobId && !message.runtimeId;
}

/** Quiet in-thread line — never the sticky warning wall. */
export function noRuntimeReplyCopy(connected: boolean): string {
  return connected
    ? "このメッセージの送信時はオンラインのランタイムがなかったため、実行しませんでした。"
    : "オンラインのランタイムがなかったため、この回は実行しませんでした。";
}

/** Queued chat jobs that nobody claims fail after this window. */
export const QUEUED_CLAIM_TIMEOUT_MS = STALE_RUNTIME_MS;

/**
 * If the assigned machine is already stale, fail sooner than the full
 * claim window so the wait spinner does not run out the clock.
 */
export const UNCLAIMED_OFFLINE_GRACE_MS = 15_000;

export function unclaimedJobError(runtimeName?: string): string {
  const who = runtimeName?.trim()
    ? `「${runtimeName.trim()}」`
    : "割り当てたマシン";
  return `${who} がジョブを受け取りませんでした。設定のランタイムでオンラインか確認し、tahcode start を実行してください。別の環境にリンクしたままなら、この画面の登録手順でつなぎ直してください。`;
}

export function queuedRuntimeWaitLabel(input: {
  assignedLive: boolean | null;
  runtimeName?: string;
}): string {
  if (input.assignedLive === true || input.assignedLive === null) {
    return "ランタイムの受付待ち";
  }
  const name = input.runtimeName?.trim();
  return name
    ? `${name} が応答していません`
    : "割り当てたマシンが応答していません";
}

export function shouldFailUnclaimedJob(input: {
  assignedLive: boolean;
  now: number;
  queuedAt: number;
  claimTimeoutMs?: number;
  offlineGraceMs?: number;
}): boolean {
  const age = input.now - input.queuedAt;
  const timeout = input.claimTimeoutMs ?? QUEUED_CLAIM_TIMEOUT_MS;
  if (age >= timeout) {
    return true;
  }
  const grace = input.offlineGraceMs ?? UNCLAIMED_OFFLINE_GRACE_MS;
  return !input.assignedLive && age >= grace;
}
