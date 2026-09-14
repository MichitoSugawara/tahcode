import type { DesktopUpdateState } from "@tahcode/core/desktop";
import { isDesktopUpdateState } from "@tahcode/core/desktop";
import { useCallback, useEffect, useState } from "react";

import { getDesktopBridge, hasDesktopUpdater } from "@/lib/desktop";

export function useDesktopUpdate(): {
  apply: () => Promise<void>;
  check: () => Promise<void>;
  download: () => Promise<void>;
  openRelease: () => Promise<void>;
  ready: boolean;
  setAutoUpdate: (enabled: boolean) => Promise<void>;
  state: DesktopUpdateState | null;
  supported: boolean;
} {
  const supported = hasDesktopUpdater();
  const [state, setState] = useState<DesktopUpdateState | null>(null);

  useEffect(() => {
    const bridge = getDesktopBridge();
    const getUpdateState = bridge?.getUpdateState;
    const onUpdateState = bridge?.onUpdateState;
    if (!getUpdateState || !onUpdateState) {
      return;
    }
    let cancelled = false;
    const load = async () => {
      const next = await getUpdateState();
      if (!cancelled && isDesktopUpdateState(next)) {
        setState(next);
      }
    };
    void load();
    const unsubscribe = onUpdateState((next) => {
      setState(next);
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [supported]);

  const check = useCallback(async () => {
    const next = await getDesktopBridge()?.checkForUpdates?.();
    if (isDesktopUpdateState(next)) {
      setState(next);
    }
  }, []);

  const download = useCallback(async () => {
    const next = await getDesktopBridge()?.downloadUpdate?.();
    if (isDesktopUpdateState(next)) {
      setState(next);
    }
  }, []);

  const apply = useCallback(async () => {
    const next = await getDesktopBridge()?.applyUpdate?.();
    if (isDesktopUpdateState(next)) {
      setState(next);
    }
  }, []);

  const setAutoUpdate = useCallback(async (enabled: boolean) => {
    const next = await getDesktopBridge()?.setAutoUpdate?.(enabled);
    if (isDesktopUpdateState(next)) {
      setState(next);
    }
  }, []);

  const openRelease = useCallback(async () => {
    await getDesktopBridge()?.openLatestRelease?.();
  }, []);

  return {
    apply,
    check,
    download,
    openRelease,
    ready: state !== null,
    setAutoUpdate,
    state,
    supported,
  };
}
