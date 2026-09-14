import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Dialog } from "@/harness/ui/Dialog";
import { getDesktopBridge, isDesktopShell } from "@/lib/desktop";

import {
  DesktopUpdateFallback,
  DesktopUpdatePanel,
} from "./DesktopUpdatePanel";
import { useDesktopUpdate } from "./useDesktopUpdate";

export function DesktopUpdateHost() {
  const desktop = isDesktopShell();
  const update = useDesktopUpdate();
  const [open, setOpen] = useState(false);
  const toastedVersion = useRef<string | null>(null);

  useEffect(() => {
    void getDesktopBridge()?.markUpdateUiReady?.();
    const unsubscribe = getDesktopBridge()?.onOpenUpdateUi?.(() => {
      setOpen(true);
    });
    return () => {
      unsubscribe?.();
    };
  }, []);

  useEffect(() => {
    const state = update.state;
    if (
      !state ||
      open ||
      state.lastCheckReason !== "auto" ||
      state.phase !== "available" ||
      !state.availableVersion ||
      toastedVersion.current === state.availableVersion
    ) {
      return;
    }
    toastedVersion.current = state.availableVersion;
    toast(state.message, {
      action: {
        label: "確認",
        onClick: () => {
          setOpen(true);
        },
      },
    });
  }, [open, update.state]);

  if (!desktop) {
    return null;
  }

  return (
    <Dialog
      description="tahcode Desktop のバージョン確認と自動更新の設定です。"
      open={open}
      title="デスクトップの更新"
      onOpenChange={setOpen}
    >
      {update.supported && update.state ? (
        <DesktopUpdatePanel
          apply={update.apply}
          check={update.check}
          download={update.download}
          openRelease={update.openRelease}
          setAutoUpdate={update.setAutoUpdate}
          state={update.state}
        />
      ) : (
        <DesktopUpdateFallback />
      )}
    </Dialog>
  );
}
