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
