/** Bridge reports this when it can abort a claimed chat job (AbortSignal / kill). */
export const BRIDGE_CAPABILITY_JOB_CANCEL = "jobCancel";

export const JOB_CANCELLED_MESSAGE = "中断しました";

const COMPLETED_BODY_MAX = 100_000;

/**
 * `jobs:complete` must replace the streamed body, never concatenate.
 * If `finalText` is already the message (or a suffix — a retry / bad concat),
 * keep the current body so we do not append a second copy.
 */
export function resolveCompletedMessageBody(
  currentBody: string,
  finalText: string
): string {
  const next = finalText.slice(-COMPLETED_BODY_MAX);
  if (next.length === 0) {
    return currentBody;
  }
  if (currentBody === next || currentBody.endsWith(next)) {
    return currentBody;
  }
  return next;
}
