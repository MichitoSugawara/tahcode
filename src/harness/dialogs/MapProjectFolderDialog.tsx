import { useMutation } from "convex/react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/atoms/Button";
import { useOrg } from "@/harness/OrgContext";
import { Dialog } from "@/harness/ui/Dialog";
import { Input, Label } from "@/harness/ui/Field";
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
    project?.cwd ??
    "";
  const [cwd, setCwd] = useState(existing);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) {
      setCwd(existing);
    }
  }, [existing, open]);

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="このマシンのフォルダ"
      description={`${project?.name ?? "プロジェクト"} を ${runtime?.name ?? "このマシン"} で動かす作業ディレクトリです。ネイティブのフォルダ選択は後続で接続します。`}
      width={480}
      footer={
        <div className="flex items-center gap-1.5">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onOpenChange(false)}
          >
            キャンセル
          </Button>
          <Button
            type="submit"
            form="map-project-folder"
            variant="accent"
            size="sm"
            disabled={!cwd.trim() || busy}
          >
            フォルダを保存
          </Button>
        </div>
      }
    >
      <form
        id="map-project-folder"
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          const path = cwd.trim();
          if (!path || busy) {
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
      >
        <div>
          <Label hint="ランタイム側のパス">作業ディレクトリ</Label>
          <Input
            autoFocus
            value={cwd}
            onChange={(event) => setCwd(event.target.value)}
            placeholder="~/code/web"
            className="font-mono"
          />
        </div>
      </form>
    </Dialog>
  );
}
