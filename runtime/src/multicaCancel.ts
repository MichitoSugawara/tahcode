import { spawnSync } from "node:child_process";

/**
 * Leftover best-effort stop for a Multica issue task id. tahcode jobs spawn
 * the provider CLI through the bridge; Multica is not on the default path.
 * If a historic job still recorded `multicaTaskId`, cancel that too.
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
