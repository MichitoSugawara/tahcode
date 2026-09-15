import { useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { Composer, useChatAgent } from "@/harness/Composer";
import { EmptyHero, useHeroComposerMenu } from "@/harness/EmptyHero";
import { NewChatCheckoutBar } from "@/harness/NewChatCheckoutBar";
import { NewChatProjectSwitch } from "@/harness/NewChatProjectSwitch";
import { useCreateProjectChat } from "@/harness/optimisticMutations";
import { useOrg } from "@/harness/OrgContext";
import type { Chat } from "@/harness/OrgContext";
import { errorSummary } from "@/lib/format";
import {
  NEW_CHAT_PLACEHOLDER,
  NEW_CHAT_TITLE,
  readNewChatProjectParam,
  resolveNewChatProjectId,
  titleFromFirstMessage,
} from "@/lib/newChat";
import { orgNewChatPath } from "@/lib/orgPaths";
import { useDocumentTitle } from "@/lib/title";

import type { Id } from "../../convex/_generated/dataModel";

/* ─────────────────────────────────────────────────────────
 * NEW CHAT — t3code New thread as a full page (TAH-68).
 * Default is No project (Personal DM). A project is optional;
 * first send creates that project's chat. Agent pickers live
 * inside the composer. Folder picking stays TAH-67.
 * ───────────────────────────────────────────────────────── */
export default function NewChatPage() {
  const org = useOrg();
  const location = useLocation();
  const navigate = useNavigate();
  const { composerMenuOpen, onSuggestMenuOpenChange } = useHeroComposerMenu();
  const createChat = useCreateProjectChat();
  const { agent } = useChatAgent(null);
  const pendingCreated = useRef<Promise<Id<"chats">> | null>(null);
  const requested = readNewChatProjectParam(location.search);
  const projectIds = new Set(
    (org.projects ?? []).map((item) => String(item._id))
  );
  const projectId =
    org.projects === undefined
      ? requested
      : resolveNewChatProjectId(requested, projectIds);
  const project =
    projectId === null
      ? null
      : (org.projects?.find((item) => String(item._id) === projectId) ?? null);
  const dm =
    org.chats?.find(
      (chat) =>
        chat.kind === "dm" && String(chat.ownerId) === String(org.me._id)
    ) ?? null;

  useDocumentTitle(NEW_CHAT_TITLE, org.org.name);

  const selectProject = (id: Id<"projects"> | null) => {
    navigate(orgNewChatPath(org.org.slug, id), { replace: true });
  };

  const ensureChat = async (draft: string): Promise<Chat | null> => {
    if (!project) {
      return dm;
    }
    const title = titleFromFirstMessage(draft);
    const { created, placeholder } = createChat({
      driverKind: agent.driverKind,
      model: agent.model ?? undefined,
      options: agent.options,
      profileId: project.profileId,
      projectId: project._id,
      title,
      visibility: "inherit",
    });
    pendingCreated.current = created;
    created.catch((error: unknown) => {
      toast.error(`「${title}」を作成できませんでした`, {
        description: errorSummary(error),
      });
    });
    return {
      _id: placeholder,
      driverKind: agent.driverKind,
      kind: "project",
      model: agent.model ?? undefined,
      options: agent.options,
      orgId: org.org._id,
      profileId: project.profileId,
      projectId: project._id,
      title,
      visibility: "inherit",
    };
  };

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <EmptyHero
        replayKey={String(org.org._id)}
        align="center"
        question={
          <NewChatProjectSwitch
            project={project}
            projects={org.projects ?? []}
            onSelect={selectProject}
            onCreateProject={() => org.openDialog({ kind: "createProject" })}
          />
        }
        composer={
          <Composer
            chat={project ? null : dm}
            ensureChat={project ? ensureChat : undefined}
            tall
            autoFocus
            hideHint
            placeholder={NEW_CHAT_PLACEHOLDER}
            onSubmit={(chat) => {
              if (chat.kind === "project" && pendingCreated.current) {
                org.goPendingChat(chat._id, pendingCreated.current);
                return;
              }
              org.goChat(chat._id);
            }}
            onSuggestMenuOpenChange={onSuggestMenuOpenChange}
          />
        }
        afterComposer={
          <NewChatCheckoutBar
            cwd={project?.cwd}
            hasProject={Boolean(project)}
          />
        }
        composerMenuOpen={composerMenuOpen}
        suggestions={[]}
      />
    </div>
  );
}
