import { hasUsableOnlineRuntime } from "@shared/runtimeHealth.ts";
import { Cpu } from "lucide-react";

import { Button } from "@/components/atoms/Button";
import { useOrg } from "@/harness/OrgContext";
import { registerRuntimeCtaLabel } from "@/lib/desktop";

export function useOnlineMachine() {
  const org = useOrg();
  return hasUsableOnlineRuntime(org.runtimes ?? [], org.now);
}

export function MachineNeededAction() {
  const org = useOrg();
  const registered = (org.runtimes ?? []).length > 0;
  return (
    <Button
      type="button"
      size="xs"
      variant="accent"
      onClick={() =>
        registered
          ? org.goSettings("runtimes")
          : org.openDialog({ kind: "registerRuntime" })
      }
    >
      <Cpu size={12} />
      {registered ? "設定で確認" : registerRuntimeCtaLabel()}
    </Button>
  );
}

export function BridgeUpdateAction() {
  return (
    <Button
      type="button"
      size="xs"
      variant="accent"
      onClick={() => {
        void navigator.clipboard.writeText(
          "npm i -g tahcode@latest && tahcode restart"
        );
      }}
    >
      更新コマンドをコピー
    </Button>
  );
}
