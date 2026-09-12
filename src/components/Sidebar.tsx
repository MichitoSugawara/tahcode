import type { Id } from "../../convex/_generated/dataModel";

export type Org = { _id: Id<"orgs">; name: string; slug: string; role: string };
export type Project = {
  _id: Id<"projects">;
  name: string;
  slug: string;
  visibility: string;
};
export type Chat = {
  _id: Id<"chats">;
  projectId?: Id<"projects">;
  kind: "dm" | "project";
  title: string;
  visibility: string;
};
export type Runtime = {
  _id: Id<"runtimes">;
  name: string;
  status: "online" | "offline";
  canUse: boolean;
};

type Props = {
  orgs: Org[] | undefined;
  orgId: Id<"orgs"> | null;
  onOrgChange: (id: Id<"orgs">) => void;
  onCreateOrg: (name: string) => void;
  projects: Project[] | undefined;
  onCreateProject: (name: string, visibility: "org" | "private") => void;
  chats: Chat[] | undefined;
  chatId: Id<"chats"> | null;
  onChatChange: (id: Id<"chats">) => void;
  onCreateChat: (projectId: Id<"projects">, title: string) => void;
  runtimes: Runtime[] | undefined;
  creating: boolean;
};

export default function Sidebar(props: Props) {
  return (
    <aside className="flex w-72 shrink-0 flex-col gap-4 overflow-y-auto scroll-thin border-r border-stone-200 p-3 dark:border-stone-800">
      <OrgSection
        orgs={props.orgs}
        orgId={props.orgId}
        onOrgChange={props.onOrgChange}
        onCreateOrg={props.onCreateOrg}
        creating={props.creating}
      />
      <ChatSection
        chats={props.chats}
        chatId={props.chatId}
        onChatChange={props.onChatChange}
        projects={props.projects}
        onCreateChat={props.onCreateChat}
      />
      <ProjectSection
        projects={props.projects}
        onCreateProject={props.onCreateProject}
        creating={props.creating}
      />
      <RuntimeSection runtimes={props.runtimes} />
    </aside>
  );
}

function OrgSection(props: Pick<Props, "orgs" | "orgId" | "onOrgChange" | "onCreateOrg" | "creating">) {
  return (
    <section className="grid gap-2">
      <h2 className="px-1 text-[11px] font-semibold uppercase tracking-widest text-stone-400">
        Org
      </h2>
      <select
        value={props.orgId ?? ""}
        onChange={(event) => props.onOrgChange(event.target.value as Id<"orgs">)}
        className="bui-surface w-full rounded-xl px-2 py-2 text-sm outline-none"
      >
        <option value="" disabled>
          選択…
        </option>
        {(props.orgs ?? []).map((org) => (
          <option key={String(org._id)} value={String(org._id)}>
            {org.name}（{org.role}）
          </option>
        ))}
      </select>
      <InlineCreate
        placeholder="新しい Org 名"
        button="Org 作成"
        busy={props.creating}
        onCreate={props.onCreateOrg}
      />
    </section>
  );
}

function ChatSection(
  props: Pick<Props, "chats" | "chatId" | "onChatChange" | "projects" | "onCreateChat">,
) {
  const dms = (props.chats ?? []).filter((chat) => chat.kind === "dm");
  const projectChats = (props.chats ?? []).filter((chat) => chat.kind === "project");
  return (
    <section className="grid gap-2">
      <h2 className="px-1 text-[11px] font-semibold uppercase tracking-widest text-stone-400">
        Chats
      </h2>
      {dms.map((chat) => (
        <ChatRow
          key={String(chat._id)}
          active={props.chatId === chat._id}
          title="Personal DM"
          meta="常時応答"
          onClick={() => props.onChatChange(chat._id)}
        />
      ))}
      {props.projects?.map((project) => (
        <div key={String(project._id)} className="grid gap-1">
          <div className="flex items-center justify-between px-1 pt-1">
            <span className="truncate text-xs font-medium text-stone-500">
              {project.name}
            </span>
            <NewChatInline
              onCreate={(title) => props.onCreateChat(project._id, title)}
            />
          </div>
          {projectChats
            .filter((chat) => String(chat.projectId) === String(project._id))
            .map((chat) => (
              <ChatRow
                key={String(chat._id)}
                active={props.chatId === chat._id}
                title={chat.title}
                meta="@mention で応答"
                onClick={() => props.onChatChange(chat._id)}
              />
            ))}
        </div>
      ))}
    </section>
  );
}

function ChatRow(props: { active: boolean; title: string; meta: string; onClick: () => void }) {
  return (
    <button
      onClick={props.onClick}
      className={`rounded-xl px-3 py-2 text-left text-sm transition ${
        props.active
          ? "bg-violet-600 text-white"
          : "hover:bg-stone-100 dark:hover:bg-stone-800"
      }`}
    >
      <div className="truncate font-medium">{props.title}</div>
      <div className={`text-[11px] ${props.active ? "opacity-80" : "text-stone-400"}`}>
        {props.meta}
      </div>
    </button>
  );
}

function ProjectSection(
  props: Pick<Props, "projects" | "onCreateProject" | "creating">,
) {
  return (
    <section className="grid gap-2">
      <h2 className="px-1 text-[11px] font-semibold uppercase tracking-widest text-stone-400">
        Projects
      </h2>
      {(props.projects ?? []).map((project) => (
        <div
          key={String(project._id)}
          className="bui-surface flex items-center justify-between rounded-xl px-3 py-2 text-sm"
        >
          <span className="truncate">{project.name}</span>
          <span className="text-[11px] text-stone-400">{project.visibility}</span>
        </div>
      ))}
      <InlineCreateProject busy={props.creating} onCreate={props.onCreateProject} />
    </section>
  );
}

function RuntimeSection(props: { runtimes: Runtime[] | undefined }) {
  return (
    <section className="grid gap-2">
      <h2 className="px-1 text-[11px] font-semibold uppercase tracking-widest text-stone-400">
        Runtimes
      </h2>
      {(props.runtimes ?? []).length === 0 && (
        <p className="px-1 text-xs leading-5 text-stone-400">
          未登録。右パネルの Runtime タブから登録できます。
        </p>
      )}
      {(props.runtimes ?? []).map((runtime) => (
        <div
          key={String(runtime._id)}
          className="bui-surface flex items-center gap-2 rounded-xl px-3 py-2 text-sm"
        >
          <span
            className={`size-2 rounded-full ${runtime.status === "online" ? "bg-emerald-500" : "bg-stone-300"}`}
          />
          <span className="flex-1 truncate">{runtime.name}</span>
          {!runtime.canUse && <span className="text-[11px] text-red-500">deny</span>}
        </div>
      ))}
    </section>
  );
}

function InlineCreate(props: {
  placeholder: string;
  button: string;
  busy: boolean;
  onCreate: (name: string) => void;
}) {
  return (
    <form
      className="flex gap-1.5"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        const name = String(data.get("name") ?? "").trim();
        if (!name) return;
        props.onCreate(name);
        event.currentTarget.reset();
      }}
    >
      <input
        name="name"
        placeholder={props.placeholder}
        className="bui-surface min-w-0 flex-1 rounded-lg px-2 py-1.5 text-sm outline-none"
      />
      <button
        disabled={props.busy}
        className="rounded-lg bg-stone-900 px-2 py-1.5 text-xs font-medium text-white disabled:opacity-50 dark:bg-stone-100 dark:text-stone-900"
      >
        {props.button}
      </button>
    </form>
  );
}

function InlineCreateProject(props: {
  busy: boolean;
  onCreate: (name: string, visibility: "org" | "private") => void;
}) {
  return (
    <form
      className="grid gap-1.5"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        const name = String(data.get("name") ?? "").trim();
        const visibility = String(data.get("visibility") ?? "org") as "org" | "private";
        if (!name) return;
        props.onCreate(name, visibility);
        event.currentTarget.reset();
      }}
    >
      <div className="flex gap-1.5">
        <input
          name="name"
          placeholder="新しい Project 名"
          className="bui-surface min-w-0 flex-1 rounded-lg px-2 py-1.5 text-sm outline-none"
        />
        <select name="visibility" className="bui-surface rounded-lg px-1 py-1.5 text-xs">
          <option value="org">org</option>
          <option value="private">private</option>
        </select>
      </div>
      <button
        disabled={props.busy}
        className="rounded-lg bg-stone-900 px-2 py-1.5 text-xs font-medium text-white disabled:opacity-50 dark:bg-stone-100 dark:text-stone-900"
      >
        Project 作成
      </button>
    </form>
  );
}

function NewChatInline(props: { onCreate: (title: string) => void }) {
  return (
    <form
      className="flex items-center gap-1"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        const title = String(data.get("title") ?? "").trim() || "Untitled";
        props.onCreate(title);
        event.currentTarget.reset();
      }}
    >
      <input
        name="title"
        placeholder="+ chat"
        className="w-20 rounded-md border border-stone-200 bg-transparent px-1.5 py-0.5 text-[11px] outline-none"
      />
    </form>
  );
}
