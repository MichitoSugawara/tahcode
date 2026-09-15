import { normalizeOptionalRepoUrl } from "@shared/filesystemBrowse.ts";
import { useMutation } from "convex/react";
import { Building2, Lock } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/atoms/Button";
import { FolderBrowser } from "@/harness/dialogs/FolderBrowser";
import {
  GithubRepoField,
  MachineFolderFields,
} from "@/harness/dialogs/ProjectResourceFields";
import { isLive, useOrg } from "@/harness/OrgContext";
import type { Runtime } from "@/harness/OrgContext";
import { Dialog } from "@/harness/ui/Dialog";
import { ChoiceList, Input, Label } from "@/harness/ui/Field";
import { pickDesktopFolder, useDesktopHostname } from "@/lib/desktop";
import { folderPickForRuntime } from "@/lib/folderPick";
import { errorSummary } from "@/lib/format";

import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

function foldersRecord(
  folders: { cwd: string; runtimeId: Id<"runtimes"> }[] | undefined
): Record<string, string> {
  const next: Record<string, string> = {};
  for (const folder of folders ?? []) {
    next[String(folder.runtimeId)] = folder.cwd;
  }
  return next;
}

export function ProjectSettingsDialog({
  onOpenChange,
  open,
  projectId,
}: {
  onOpenChange: (open: boolean) => void;
  open: boolean;
  projectId: Id<"projects">;
}) {
  const { now, org, projects, runtimes } = useOrg();
  const update = useMutation(api.projects.update);
  const setFolders = useMutation(api.projects.setRuntimeFolders);
  const project = projects?.find((item) => item._id === projectId);
  const desktopHost = useDesktopHostname();
  const [name, setName] = useState(project?.name ?? "");
  const [visibility, setVisibility] = useState<"org" | "private">(
    project?.visibility ?? "org"
  );
  const [repoUrl, setRepoUrl] = useState(project?.repoUrl ?? "");
  const [suggestedRepo, setSuggestedRepo] = useState<string | null>(null);
  const [machineFolders, setMachineFolders] = useState<Record<string, string>>(
    () => foldersRecord(project?.folders)
  );
  const [browsing, setBrowsing] = useState<Runtime | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open || !project) {
      return;
    }
    setName(project.name);
    setVisibility(project.visibility);
    setRepoUrl(project.repoUrl ?? "");
    setSuggestedRepo(null);
    setMachineFolders(foldersRecord(project.folders));
    setBrowsing(null);
    setBusy(false);
  }, [open, project]);

  const applyFolder = (runtimeId: string, path: string, gitRemote?: string) => {
    setMachineFolders((current) => ({ ...current, [runtimeId]: path }));
    if (gitRemote && repoUrl.trim().length < 1) {
      setSuggestedRepo(gitRemote);
    }
  };

  const pickForRuntime = async (runtime: Runtime) => {
    const pick = folderPickForRuntime({
      desktopHost,
      live: isLive(runtime, now),
      runtime,
    });
    if (pick.mode === "native") {
      const result = await pickDesktopFolder(
        machineFolders[String(runtime._id)]
      );
      if (!result || result.canceled) {
        return;
      }
      applyFolder(String(runtime._id), result.path, result.gitRemoteUrl);
      return;
    }
    if (pick.mode === "browse") {
      setBrowsing(runtime);
    }
  };

  if (!project) {
    return null;
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="プロジェクト設定"
      description="GitHub リポジトリとマシン別フォルダは任意です。空のまま保存できます。"
      width={560}
      footer={
        browsing ? undefined : (
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
        )
      }
    >
      {browsing ? (
        <FolderBrowser
          runtime={browsing}
          desktopHost={desktopHost}
          initialPath={machineFolders[String(browsing._id)]}
          now={now}
          onCancel={() => setBrowsing(null)}
          onSelect={(path, gitRemoteUrl) => {
            applyFolder(String(browsing._id), path, gitRemoteUrl);
            setBrowsing(null);
          }}
        />
      ) : (
        <form
          id="project-settings"
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            const nextName = name.trim();
            if (!nextName || busy) {
              return;
            }
            const folders = Object.entries(machineFolders)
              .map(([runtimeId, path]) => ({
                cwd: path.trim(),
                runtimeId: runtimeId as Id<"runtimes">,
              }))
              .filter((folder) => folder.cwd.length > 0);
            setBusy(true);
            void setFolders({ folders, projectId })
              .then(() =>
                update({
                  name: nextName,
                  projectId,
                  repoUrl: normalizeOptionalRepoUrl(repoUrl) ?? null,
                  visibility,
                })
              )
              .then(() => {
                toast.success("プロジェクトを更新しました");
                onOpenChange(false);
              })
              .catch((error: unknown) => {
                setBusy(false);
                toast.error("プロジェクトを更新できませんでした", {
                  description: errorSummary(error),
                });
              });
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
          <GithubRepoField
            id="project-settings-repo"
            value={repoUrl}
            onChange={setRepoUrl}
            suggestedRepo={suggestedRepo}
            onDismissSuggestion={() => setSuggestedRepo(null)}
          />
          <MachineFolderFields
            desktopHost={desktopHost}
            folders={machineFolders}
            now={now}
            runtimes={runtimes}
            onClear={(runtimeId) =>
              setMachineFolders((current) =>
                Object.fromEntries(
                  Object.entries(current).filter(([id]) => id !== runtimeId)
                )
              )
            }
            onPick={(runtime) => {
              void pickForRuntime(runtime);
            }}
          />
        </form>
      )}
    </Dialog>
  );
}
