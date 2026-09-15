export const SIDEBAR_RAIL_KEYS = [
  "new",
  "home",
  "invite",
  "connectors",
] as const;

export type SidebarRailKey = (typeof SIDEBAR_RAIL_KEYS)[number];

export type SidebarSectionId = "projects" | "chats";

export interface SidebarModelItem {
  id: string;
  kind: "dm" | "project" | "thread";
  label: string;
  meta?: string;
  privateItem: boolean;
}

export interface SidebarModelGroup {
  addKind?: "createProject" | "newChat";
  emptyHint?: string;
  hideHeader?: boolean;
  id: string;
  items: SidebarModelItem[];
  kind: "empty-projects" | "personal" | "project";
  label: string;
  privateGroup: boolean;
  projectId?: string;
}

export interface SidebarModelSection {
  addKind?: "createProject" | "newChat";
  groups: SidebarModelGroup[];
  id: SidebarSectionId;
  label: string;
}

export interface SidebarModelChat {
  _id: string;
  kind: "dm" | "project" | "thread";
  ownerId?: string;
  projectId?: string;
  title: string;
  visibility: "inherit" | "private";
}

export interface SidebarModelProject {
  _id: string;
  name: string;
  visibility: "org" | "private";
}

function personalChat(
  chats: readonly SidebarModelChat[],
  meId: string
): SidebarModelChat | undefined {
  return chats.find(
    (chat) => chat.kind === "dm" && String(chat.ownerId) === String(meId)
  );
}

function ownerThreads(
  chats: readonly SidebarModelChat[],
  meId: string
): SidebarModelChat[] {
  return chats.filter(
    (chat) => chat.kind === "thread" && String(chat.ownerId) === String(meId)
  );
}

function projectChats(
  chats: readonly SidebarModelChat[],
  projectId: string
): SidebarModelChat[] {
  return chats.filter(
    (chat) =>
      chat.kind === "project" && String(chat.projectId) === String(projectId)
  );
}

export function sidebarGroupAddLabel(
  group: SidebarModelGroup
): string | undefined {
  if (group.addKind === "createProject") {
    return "新しいプロジェクト";
  }
  if (group.addKind === "newChat") {
    return `${group.label} に新しいチャット`;
  }
  return undefined;
}

export function sidebarSectionAddLabel(
  section: Pick<SidebarModelSection, "addKind">
): string | undefined {
  if (section.addKind === "createProject") {
    return "新しいプロジェクト";
  }
  if (section.addKind === "newChat") {
    return "新しいチャット";
  }
  return undefined;
}

export function sidebarSectionMoreLabel(label: string): string {
  return `${label}のメニュー`;
}

export function buildSidebarSections({
  chats,
  isAdmin,
  meId,
  projects,
}: {
  chats: readonly SidebarModelChat[] | undefined;
  isAdmin: boolean;
  meId: string;
  projects: readonly SidebarModelProject[] | undefined;
}): SidebarModelSection[] {
  const projectGroups: SidebarModelGroup[] = (projects ?? []).map(
    (project) => ({
      addKind: "newChat" as const,
      emptyHint: "チャットはまだありません。ホバーの作成ボタンで追加",
      id: String(project._id),
      items: projectChats(chats ?? [], String(project._id)).map((chat) => ({
        id: String(chat._id),
        kind: "project" as const,
        label: chat.title,
        privateItem: chat.visibility === "private",
      })),
      kind: "project" as const,
      label: project.name,
      privateGroup: project.visibility === "private",
      projectId: String(project._id),
    })
  );

  if (projectGroups.length === 0) {
    projectGroups.push({
      emptyHint: isAdmin
        ? "まだプロジェクトがありません。見出しの ＋ で最初のプロジェクトを作成"
        : "参加しているプロジェクトのみ表示されます。Owner / Admin に追加を依頼するか、自分で作成できます",
      hideHeader: true,
      id: "no-projects",
      items: [],
      kind: "empty-projects",
      label: "プロジェクト",
      privateGroup: false,
    });
  }

  const dm = personalChat(chats ?? [], meId);
  const threads = ownerThreads(chats ?? [], meId);
  const personalItems: SidebarModelItem[] = [];
  if (dm) {
    personalItems.push({
      id: String(dm._id),
      kind: "dm",
      label: "Personal DM",
      meta: "常時応答",
      privateItem: false,
    });
  }
  for (const chat of threads) {
    personalItems.push({
      id: String(chat._id),
      kind: "thread",
      label: chat.title,
      meta: "常時応答",
      privateItem: false,
    });
  }
  const personal: SidebarModelGroup = {
    emptyHint: "DM を準備しています…",
    hideHeader: true,
    id: "personal",
    items: personalItems,
    kind: "personal",
    label: "パーソナル",
    privateGroup: false,
  };

  return [
    {
      addKind: "createProject",
      groups: projectGroups,
      id: "projects",
      label: "プロジェクト",
    },
    {
      addKind: "newChat",
      groups: [personal],
      id: "chats",
      label: "DM",
    },
  ];
}
