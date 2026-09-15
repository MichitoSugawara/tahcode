import { chatDisplayTitle } from "@shared/chatKind.ts";
import { useMutation } from "convex/react";
import { useParams } from "react-router-dom";

import { useOrg } from "@/harness/OrgContext";

import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { ConfirmDialog } from "./ConfirmDialog";
import { CreateOrgDialog } from "./CreateOrgDialog";
import { CreateProjectDialog } from "./CreateProjectDialog";
import { GrantAccessDialog } from "./GrantAccessDialog";
import { InviteDialog } from "./InviteDialog";
import { MapProjectFolderDialog } from "./MapProjectFolderDialog";
import { ProjectSettingsDialog } from "./ProjectSettingsDialog";
import { RegisterRuntimeDialog } from "./RegisterRuntimeDialog";
import { RenameDialog } from "./RenameDialog";
import { RuntimeProvidersDialog } from "./RuntimeProvidersDialog";

/** Renders whichever org-scoped dialog is open in context. */
export function DialogHost({
  onOrgCreated,
}: {
  onOrgCreated: (orgId: Id<"orgs">) => void;
}) {
  const { chats, closeDialog, closeTab, dialog, goHome, projects } = useOrg();
  const { chatId } = useParams();
  const renameChat = useMutation(api.chats.rename);
  const removeChat = useMutation(api.chats.remove);
  const renameProject = useMutation(api.projects.update);
  const removeProject = useMutation(api.projects.remove);
  const close = (open: boolean) => {
    if (!open) {
      closeDialog();
    }
  };
  const activeChat =
    dialog?.kind === "renameChat" || dialog?.kind === "deleteChat"
      ? chats?.find((chat) => chat._id === dialog.chatId)
      : undefined;
  const activeProject =
    dialog?.kind === "renameProject" || dialog?.kind === "deleteProject"
      ? projects?.find((project) => project._id === dialog.projectId)
      : undefined;
  return (
    <>
      <CreateOrgDialog
        open={dialog?.kind === "createOrg"}
        onOpenChange={close}
        onCreated={onOrgCreated}
      />
      <CreateProjectDialog
        open={dialog?.kind === "createProject"}
        onOpenChange={close}
      />
      <RegisterRuntimeDialog
        open={dialog?.kind === "registerRuntime"}
        onOpenChange={close}
      />
      {dialog?.kind === "grant" && (
        <GrantAccessDialog
          open
          onOpenChange={close}
          runtimeId={dialog.runtimeId}
        />
      )}
      {dialog?.kind === "runtimeProviders" && (
        <RuntimeProvidersDialog
          open
          onOpenChange={close}
          runtimeId={dialog.runtimeId}
          focus={dialog.focus}
        />
      )}
      <InviteDialog open={dialog?.kind === "invite"} onOpenChange={close} />
      {dialog?.kind === "mapProjectFolder" && (
        <MapProjectFolderDialog
          open
          onOpenChange={close}
          projectId={dialog.projectId}
          runtimeId={dialog.runtimeId}
        />
      )}
      {dialog?.kind === "projectSettings" && (
        <ProjectSettingsDialog
          open
          onOpenChange={close}
          projectId={dialog.projectId}
        />
      )}
      {dialog?.kind === "renameChat" && activeChat && (
        <RenameDialog
          open
          onOpenChange={close}
          title="チャット名を変更"
          label="名前"
          initialValue={chatDisplayTitle(activeChat)}
          onSubmit={async (title) => {
            await renameChat({ chatId: activeChat._id, title });
          }}
        />
      )}
      {dialog?.kind === "renameProject" && activeProject && (
        <RenameDialog
          open
          onOpenChange={close}
          title="プロジェクト名を変更"
          label="名前"
          initialValue={activeProject.name}
          onSubmit={async (name) => {
            await renameProject({ name, projectId: activeProject._id });
          }}
        />
      )}
      {dialog?.kind === "deleteChat" && activeChat && (
        <ConfirmDialog
          open
          onOpenChange={close}
          title="チャットを削除"
          description={`「${chatDisplayTitle(activeChat)}」を削除します。メッセージと実行履歴も消えます。`}
          confirmLabel="削除する"
          successMessage="チャットを削除しました"
          onConfirm={async () => {
            const id = activeChat._id;
            await removeChat({ chatId: id });
            closeTab(id);
            if (chatId === String(id)) {
              goHome();
            }
          }}
        />
      )}
      {dialog?.kind === "deleteProject" && activeProject && (
        <ConfirmDialog
          open
          onOpenChange={close}
          title="プロジェクトを削除"
          description={`「${activeProject.name}」と配下のチャットを削除します。`}
          confirmLabel="削除する"
          successMessage="プロジェクトを削除しました"
          onConfirm={async () => {
            const projectId = activeProject._id;
            const childIds = (chats ?? [])
              .filter((chat) => chat.projectId === projectId)
              .map((chat) => chat._id);
            await removeProject({ projectId });
            for (const id of childIds) {
              closeTab(id);
            }
            if (chatId && childIds.some((id) => String(id) === chatId)) {
              goHome();
            }
          }}
        />
      )}
    </>
  );
}
