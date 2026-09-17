import { isLiveRuntime } from "@shared/runtimeHealth.ts";
import { runtimeHasPreview } from "@shared/workbenchPreview.ts";
import {
  runtimeHasScreen,
  runtimeHasScreenInput,
} from "@shared/workbenchScreen.ts";
import { runtimeHasPty } from "@shared/workbenchTerminal.ts";
import { useParams } from "react-router-dom";

import { useOrg } from "@/harness/OrgContext";
import type { Project, Runtime } from "@/harness/OrgContext";
import { projectPeekPath } from "@/harness/sidebarHover";

export function pickWorkbenchRuntime(
  runtimes: readonly Runtime[],
  preferredId: string | null,
  now: number
): Runtime | undefined {
  const live = runtimes.filter(
    (runtime) => runtime.canUse && isLiveRuntime(runtime, now)
  );
  return live.find((runtime) => runtime._id === preferredId) ?? live[0];
}

export function workbenchCwd(
  runtime: Runtime | undefined,
  project: Project | undefined
): string {
  if (!runtime) {
    return "";
  }
  return projectPeekPath(project ?? {}, runtime._id) ?? runtime.cwd ?? "";
}

export function useWorkbenchMachine() {
  const org = useOrg();
  const { chatId } = useParams();
  const runtime = pickWorkbenchRuntime(
    org.runtimes ?? [],
    org.runtimeId,
    org.now
  );
  const chat = org.chats?.find((item) => item._id === chatId);
  const project = org.projects?.find(
    (item) => item._id === (chat?.projectId ?? org.composerProjectId)
  );
  return {
    chatId,
    cwd: workbenchCwd(runtime, project),
    hasPreview: runtimeHasPreview(runtime?.capabilities),
    hasPty: runtimeHasPty(runtime?.capabilities),
    hasScreen: runtimeHasScreen(runtime?.capabilities),
    hasScreenInput: runtimeHasScreenInput(runtime?.capabilities),
    online: runtime !== undefined,
    runtime,
  };
}
