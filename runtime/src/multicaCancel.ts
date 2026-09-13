import { spawnSync } from "node:child_process";

/**
 * Best-effort stop for a Multica issue task. tahcode jobs usually spawn the
 * provider CLI directly; when a job recorded a Multica task id, cancel that
 * path too so the daemon does not keep the agent running.
 */
export function cancelMulticaTask(taskId: string): {
  detail: string;
  ok: boolean;
} {
  const trimmed = taskId.trim();
  if (trimmed.length < 1) {
    return { detail: "empty task id", ok: false };
  }
  const bin = process.env.MULTICA_BIN ?? "multica";
  const result = spawnSync(bin, ["issue", "cancel-task", trimmed], {
    encoding: "utf-8",
    timeout: 15_000,
  });
  if (result.error) {
    return { detail: result.error.message, ok: false };
  }
  const detail = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();
  return { detail, ok: result.status === 0 };
}
