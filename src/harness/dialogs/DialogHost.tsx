import { useOrg } from "@/harness/OrgContext";

import type { Id } from "../../../convex/_generated/dataModel";
import { CreateOrgDialog } from "./CreateOrgDialog";
import { CreateProjectDialog } from "./CreateProjectDialog";
import { GrantAccessDialog } from "./GrantAccessDialog";
import { InviteDialog } from "./InviteDialog";
import { MapProjectFolderDialog } from "./MapProjectFolderDialog";
import { NewChatDialog } from "./NewChatDialog";
import { RegisterRuntimeDialog } from "./RegisterRuntimeDialog";
import { RuntimeProvidersDialog } from "./RuntimeProvidersDialog";

/** Renders whichever org-scoped dialog is open in context. */
export function DialogHost({
  onOrgCreated,
}: {
  onOrgCreated: (orgId: Id<"orgs">) => void;
}) {
  const { dialog, closeDialog } = useOrg();
  const close = (open: boolean) => {
    if (!open) {
      closeDialog();
    }
  };
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
      <NewChatDialog
        open={dialog?.kind === "newChat"}
        onOpenChange={close}
        initialProjectId={
          dialog?.kind === "newChat" ? dialog.projectId : undefined
        }
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
    </>
  );
}
