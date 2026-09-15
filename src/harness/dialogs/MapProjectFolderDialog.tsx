import { useMutation } from "convex/react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/atoms/Button";
import { FolderBrowser } from "@/harness/dialogs/FolderBrowser";
import { isLive, useOrg } from "@/harness/OrgContext";
import { Dialog } from "@/harness/ui/Dialog";
import { pickDesktopFolder, useDesktopHostname } from "@/lib/desktop";
import { folderPickForRuntime } from "@/lib/folderPick";
import { errorSummary } from "@/lib/format";

import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

export function MapProjectFolderDialog({
  open,
  onOpenChange,
  projectId,
  runtimeId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: Id<"projects">;
  runtimeId: Id<"runtimes">;
}) {
  const org = useOrg();
  const setFolder = useMutation(api.projects.setRuntimeFolder);
  const project = org.projects?.find((item) => item._id === projectId);
  const runtime = org.runtimes?.find((item) => item._id === runtimeId);
  const existing =
    project?.folders?.find((folder) => folder.runtimeId === runtimeId)?.cwd ??
    "";
  const desktopHost = useDesktopHostname();
  const [busy, setBusy] = useState(false);
  const [nativeTried, setNativeTried] = useState(false);
  const [showBrowser, setShowBrowser] = useState(false);

  useEffect(() => {
    if (open) {
      setBusy(false);
      setNativeTried(false);
      setShowBrowser(false);
    }
  }, [open]);

  useEffect(() => {
    if (!open || !runtime || nativeTried) {
      return;
    }
    const pick = folderPickForRuntime({
      desktopHost,
      live: isLive(runtime, org.now),
      runtime,
    });
    if (pick.mode !== "native") {
      setNativeTried(true);
      setShowBrowser(true);
      return;
    }
    setNativeTried(true);
    void pickDesktopFolder(existing || undefined).then((result) => {
      if (!result || result.canceled || busy) {
        setShowBrowser(true);
        return;
      }
      setBusy(true);
      void setFolder({ cwd: result.path, projectId, runtimeId })
        .then(() => {
          toast.success("フォルダを保存しました");
          onOpenChange(false);
        })
        .catch((error: unknown) => {
          toast.error("フォルダを保存できませんでした", {
            description: errorSummary(error),
          });
          setShowBrowser(true);
        })
        .finally(() => setBusy(false));
    });
  }, [
    busy,
    desktopHost,
    existing,
    nativeTried,
    onOpenChange,
    open,
    org.now,
    projectId,
    runtime,
    runtimeId,
    setFolder,
  ]);

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="このマシンのフォルダ"
      description={`${project?.name ?? "プロジェクト"} を ${runtime?.name ?? "このマシン"} で動かす作業ディレクトリです。`}
      width={560}
    >
      {runtime && showBrowser ? (
        <FolderBrowser
          runtime={runtime}
          desktopHost={desktopHost}
          initialPath={existing}
          now={org.now}
          onCancel={() => onOpenChange(false)}
          onSelect={(path) => {
            if (busy) {
              return;
            }
            setBusy(true);
            void setFolder({ cwd: path, projectId, runtimeId })
              .then(() => {
                toast.success("フォルダを保存しました");
                onOpenChange(false);
              })
              .catch((error: unknown) => {
                toast.error("フォルダを保存できませんでした", {
                  description: errorSummary(error),
                });
              })
              .finally(() => setBusy(false));
          }}
        />
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-ink-3 text-[12.5px] leading-relaxed">
            {runtime
              ? "この Mac のフォルダ選択を開いています。キャンセルすると一覧から選べます。"
              : "マシンが見つかりません。"}
          </p>
          <div className="flex justify-end">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onOpenChange(false)}
            >
              閉じる
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  );
}
