import { useMutation } from "convex/react";
import { Building2, Lock } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/atoms/Button";
import { useOrg } from "@/harness/OrgContext";
import { Dialog } from "@/harness/ui/Dialog";
import { ChoiceList, Input, Label } from "@/harness/ui/Field";
import { errorSummary } from "@/lib/format";

import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

export function ProjectSettingsDialog({
  onOpenChange,
  open,
  projectId,
}: {
  onOpenChange: (open: boolean) => void;
  open: boolean;
  projectId: Id<"projects">;
}) {
  const { org, projects } = useOrg();
  const update = useMutation(api.projects.update);
  const project = projects?.find((item) => item._id === projectId);
  const [name, setName] = useState(project?.name ?? "");
  const [visibility, setVisibility] = useState<"org" | "private">(
    project?.visibility ?? "org"
  );
  const [repoUrl, setRepoUrl] = useState(project?.repoUrl ?? "");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open || !project) {
      return;
    }
    setName(project.name);
    setVisibility(project.visibility);
    setRepoUrl(project.repoUrl ?? "");
    setBusy(false);
  }, [open, project]);

  if (!project) {
    return null;
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="プロジェクト設定"
      description="名前・公開範囲・リポジトリを変更できます。"
      width={480}
      footer={
        <div className="ml-auto flex items-center gap-1.5">
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
            form="project-settings"
            variant="accent"
            size="sm"
            disabled={busy || !name.trim()}
          >
            保存
          </Button>
        </div>
      }
    >
      <form
        id="project-settings"
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          const nextName = name.trim();
          if (!nextName || busy) {
            return;
          }
          setBusy(true);
          update({
            name: nextName,
            projectId,
            repoUrl: repoUrl.trim() || null,
            visibility,
          }).then(
            () => {
              toast.success("プロジェクトを更新しました");
              onOpenChange(false);
            },
            (error: unknown) => {
              setBusy(false);
              toast.error("プロジェクトを更新できませんでした", {
                description: errorSummary(error),
              });
            }
          );
        }}
      >
        <div>
          <Label htmlFor="project-settings-name">プロジェクト名</Label>
          <Input
            id="project-settings-name"
            autoFocus
            value={name}
            maxLength={80}
            onChange={(event) => setName(event.target.value)}
          />
        </div>
        <div>
          <Label>公開範囲</Label>
          <ChoiceList
            value={visibility}
            onChange={setVisibility}
            options={[
              {
                desc: `${org.name} のメンバー全員が見て参加できます`,
                icon: <Building2 size={14} />,
                label: "Org 全体",
                value: "org",
              },
              {
                desc: "あなたと Owner / Admin、追加したメンバーだけに表示されます",
                icon: <Lock size={14} />,
                label: "プライベート",
                value: "private",
              },
            ]}
          />
        </div>
        <div>
          <Label htmlFor="project-settings-repo" hint="任意">
            リポジトリ URL
          </Label>
          <Input
            id="project-settings-repo"
            value={repoUrl}
            onChange={(event) => setRepoUrl(event.target.value)}
            placeholder="https://github.com/acme/web"
            inputMode="url"
          />
        </div>
      </form>
    </Dialog>
  );
}
