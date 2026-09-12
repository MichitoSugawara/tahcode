import { useOrg } from "@/harness/OrgContext";
import { CreateOrgDialog } from "./CreateOrgDialog";
import { CreateProjectDialog } from "./CreateProjectDialog";
import { GrantAccessDialog } from "./GrantAccessDialog";
import { InviteDialog } from "./InviteDialog";
import { NewChatDialog } from "./NewChatDialog";
import { RegisterRuntimeDialog } from "./RegisterRuntimeDialog";

/** Renders whichever org-scoped dialog is open in context. */
export function DialogHost({ onOrgCreated }: { onOrgCreated: (orgId: import("../../../convex/_generated/dataModel").Id<"orgs">) => void }) {
  const { dialog, closeDialog } = useOrg();
  const close = (open: boolean) => {
    if (!open) closeDialog();
  };
  return (
    <>
      <CreateOrgDialog open={dialog?.kind === "createOrg"} onOpenChange={close} onCreated={onOrgCreated} />
      <CreateProjectDialog open={dialog?.kind === "createProject"} onOpenChange={close} />
      <NewChatDialog open={dialog?.kind === "newChat"} onOpenChange={close} initialProjectId={dialog?.kind === "newChat" ? dialog.projectId : undefined} />
      <RegisterRuntimeDialog open={dialog?.kind === "registerRuntime"} onOpenChange={close} />
      {dialog?.kind === "grant" && <GrantAccessDialog open onOpenChange={close} runtimeId={dialog.runtimeId} />}
      <InviteDialog open={dialog?.kind === "invite"} onOpenChange={close} />
    </>
  );
}
