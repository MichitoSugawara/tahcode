import { normalizeOptionalRepoUrl } from "@shared/filesystemBrowse.ts";
import { Building2, Lock } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/atoms/Button";
import { FolderBrowser } from "@/harness/dialogs/FolderBrowser";
import {
  GithubRepoField,
  MachineFolderFields,
} from "@/harness/dialogs/ProjectResourceFields";
import { useCreateProjectWithChat } from "@/harness/optimisticMutations";
import { isLive, useOrg } from "@/harness/OrgContext";
import type { Runtime } from "@/harness/OrgContext";
import { Dialog } from "@/harness/ui/Dialog";
import { ChoiceList, Input, Label } from "@/harness/ui/Field";
import { pickDesktopFolder, useDesktopHostname } from "@/lib/desktop";
import { folderPickForRuntime } from "@/lib/folderPick";
import { errorSummary } from "@/lib/format";

import type { Id } from "../../../convex/_generated/dataModel";

export function CreateProjectDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { goPendingChat, now, org, runtimes } = useOrg();
  const createProject = useCreateProjectWithChat();
  const desktopHost = useDesktopHostname();
  const [name, setName] = useState("");
  const [visibility, setVisibility] = useState<"org" | "private">("org");
  const [repoUrl, setRepoUrl] = useState("");
  const [suggestedRepo, setSuggestedRepo] = useState<string | null>(null);
  const [machineFolders, setMachineFolders] = useState<Record<string, string>>(
    {}
  );
  const [browsing, setBrowsing] = useState<Runtime | null>(null);

  const reset = () => {
    setName("");
    setVisibility("org");
    setRepoUrl("");
    setSuggestedRepo(null);
    setMachineFolders({});
    setBrowsing(null);
  };

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

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          reset();
        }
        onOpenChange(next);
      }}
      title="新しいプロジェクト"
      description="名前だけ必須です。GitHub リポジトリとマシン別フォルダはあとからでも設定できます。"
      width={560}
      footer={
        browsing ? undefined : (
          <>
            <span className="text-ink-3 text-[12px]">
              作成後に「General」チャットを開きます
            </span>
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
                form="create-project"
                variant="accent"
                size="sm"
                disabled={!name.trim()}
              >
                プロジェクトを作成
              </Button>
            </div>
          </>
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
          id="create-project"
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            const projectName = name.trim();
            if (!projectName) {
              return;
            }
            const folders = Object.entries(machineFolders)
              .map(([runtimeId, path]) => ({
                cwd: path.trim(),
                runtimeId: runtimeId as Id<"runtimes">,
              }))
              .filter((folder) => folder.cwd.length > 0);
            const { chatPlaceholder, projectCreated, chatCreated } =
              createProject(
                {
                  cwd: folders[0]?.cwd,
                  folders: folders.length > 0 ? folders : undefined,
                  name: projectName,
                  repoUrl: normalizeOptionalRepoUrl(repoUrl),
                  visibility,
                },
                "General"
              );
            reset();
            onOpenChange(false);
            goPendingChat(chatPlaceholder, chatCreated);
            projectCreated.then(
              () => {
                toast.success(`プロジェクト「${projectName}」を作成しました`);
                chatCreated.catch((error: unknown) =>
                  toast.error("General チャットを作成できませんでした", {
                    description: errorSummary(error),
                  })
                );
              },
              (error: unknown) =>
                toast.error(
                  `プロジェクト「${projectName}」を作成できませんでした`,
                  { description: errorSummary(error) }
                )
            );
          }}
        >
          <div>
            <Label htmlFor="create-project-name">プロジェクト名</Label>
            <Input
              id="create-project-name"
              autoFocus
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="例: Web リニューアル"
              maxLength={80}
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
            id="create-project-repo"
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
