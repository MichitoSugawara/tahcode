import { useState } from "react";
import type { Id } from "../../convex/_generated/dataModel";

export type Member = {
  user: { _id: Id<"users">; name?: string; email?: string; handle?: string };
  role: "owner" | "admin" | "member";
};

export type RuntimeFull = {
  _id: Id<"runtimes">;
  name: string;
  slug: string;
  hostname?: string;
  cwd?: string;
  status: "online" | "offline";
  canUse: boolean;
  providers: { driverKind: string; available: boolean; version?: string }[];
  grants: {
    _id: Id<"runtimeGrants">;
    targetType: "user" | "role";
    targetUserId?: Id<"users">;
    targetRole?: "owner" | "admin" | "member";
  }[];
};

type Props = {
  tab: "context" | "runtime" | "team";
  onTab: (tab: "context" | "runtime" | "team") => void;
  project?: { name: string; slug: string; cwd?: string; repoUrl?: string } | null;
  historyCount: number;
  lastMentions: string[];
  runtimes: RuntimeFull[] | undefined;
  selectedRuntimeId: Id<"runtimes"> | null;
  onSelectRuntime: (id: Id<"runtimes"> | null) => void;
  onRegisterRuntime: (name: string) => void;
  runtimeToken: { runtimeId: string; token: string } | null;
  onGrant: (
    runtimeId: Id<"runtimes">,
    target: { type: "user" | "role"; userId?: Id<"users">; role?: "owner" | "admin" | "member" },
  ) => void;
  onRevokeGrant: (grantId: Id<"runtimeGrants">) => void;
  members: Member[] | undefined;
  inviteToken: string | null;
  onInvite: (role: "admin" | "member") => void;
  onSetRole: (userId: Id<"users">, role: "owner" | "admin" | "member") => void;
  convexUrl: string;
  busy: boolean;
};

export default function RightPanel(props: Props) {
  return (
    <aside className="flex w-80 shrink-0 flex-col gap-3 overflow-y-auto scroll-thin border-l border-stone-200 p-3 dark:border-stone-800">
      <div className="bui-surface flex rounded-xl p-1 text-sm">
        {(["context", "runtime", "team"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => props.onTab(tab)}
            className={`flex-1 rounded-lg px-2 py-1.5 capitalize ${
              props.tab === tab ? "bg-violet-600 text-white" : "text-stone-500"
            }`}
          >
            {tab === "context" ? "Context" : tab === "runtime" ? "Runtime" : "Team"}
          </button>
        ))}
      </div>
      {props.tab === "context" && (
        <ContextTab
          project={props.project}
          historyCount={props.historyCount}
          lastMentions={props.lastMentions}
        />
      )}
      {props.tab === "runtime" && <RuntimeTab {...props} />}
      {props.tab === "team" && <TeamTab {...props} />}
    </aside>
  );
}

function ContextTab(props: Pick<Props, "project" | "historyCount" | "lastMentions">) {
  return (
    <div className="grid gap-2">
      <div className="bui-surface rounded-xl p-3">
        <h3 className="text-xs font-semibold uppercase tracking-widest text-stone-400">
          Project link
        </h3>
        {props.project ? (
          <div className="mt-1 text-sm">
            <div className="font-medium">{props.project.name}</div>
            <div className="font-mono text-[11px] text-stone-500">{props.project.slug}</div>
            {props.project.cwd && (
              <div className="font-mono text-[11px] text-stone-500">{props.project.cwd}</div>
            )}
            {props.project.repoUrl && (
              <div className="break-all text-[11px] text-violet-600">{props.project.repoUrl}</div>
            )}
          </div>
        ) : (
          <p className="mt-1 text-sm text-stone-500">DM（プロジェクト未リンク）</p>
        )}
      </div>
      <div className="bui-surface rounded-xl p-3">
        <h3 className="text-xs font-semibold uppercase tracking-widest text-stone-400">
          History + mentions
        </h3>
        <p className="mt-1 text-sm">直近 {props.historyCount} 件をエージェントに渡します</p>
        <p className="mt-1 text-xs text-stone-500">
          {props.lastMentions.length > 0
            ? props.lastMentions.join(" ")
            : "最新メッセージにメンションなし"}
        </p>
        <p className="mt-2 text-[11px] text-stone-400">Focus モードなし（Phase 1）</p>
      </div>
    </div>
  );
}

function RuntimeTab(props: Props) {
  const [name, setName] = useState("");
  return (
    <div className="grid gap-2">
      <div className="bui-surface rounded-xl p-3">
        <h3 className="text-xs font-semibold uppercase tracking-widest text-stone-400">
          Register this machine
        </h3>
        <form
          className="mt-2 flex gap-1.5"
          onSubmit={(event) => {
            event.preventDefault();
            if (!name.trim()) return;
            props.onRegisterRuntime(name.trim());
            setName("");
          }}
        >
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="例: office-mac"
            className="min-w-0 flex-1 rounded-lg border border-stone-200 bg-transparent px-2 py-1.5 text-sm outline-none"
          />
          <button
            disabled={props.busy}
            className="rounded-lg bg-stone-900 px-2 py-1.5 text-xs font-medium text-white disabled:opacity-50 dark:bg-stone-100 dark:text-stone-900"
          >
            登録
          </button>
        </form>
        {props.runtimeToken && (
          <div className="mt-2 rounded-lg bg-amber-50 p-2 text-[11px] leading-5 text-amber-900 dark:bg-amber-950 dark:text-amber-200">
            <div className="font-semibold">トークンは一度だけ表示されます</div>
            <code className="break-all font-mono">{props.runtimeToken.token}</code>
            <pre className="mt-1 overflow-x-auto whitespace-pre-wrap font-mono">
              {`CONVEX_URL=${props.convexUrl}\nHARNESS_RUNTIME_ID=${props.runtimeToken.runtimeId}\nHARNESS_RUNTIME_TOKEN=${props.runtimeToken.token}\nnpm run runtime -- run`}
            </pre>
          </div>
        )}
      </div>
      {(props.runtimes ?? []).map((runtime) => (
        <div key={String(runtime._id)} className="bui-surface grid gap-2 rounded-xl p-3">
          <div className="flex items-center gap-2">
            <span
              className={`size-2 rounded-full ${runtime.status === "online" ? "bg-emerald-500" : "bg-stone-300"}`}
            />
            <span className="flex-1 truncate text-sm font-medium">{runtime.name}</span>
            <button
              onClick={() =>
                props.onSelectRuntime(
                  props.selectedRuntimeId === runtime._id ? null : runtime._id,
                )
              }
              className={`rounded-lg px-2 py-1 text-xs ${
                props.selectedRuntimeId === runtime._id
                  ? "bg-violet-600 text-white"
                  : "border border-stone-200"
              }`}
            >
              {props.selectedRuntimeId === runtime._id ? "指定中" : "指定"}
            </button>
          </div>
          <div className="flex flex-wrap gap-1">
            {runtime.providers.map((provider) => (
              <span
                key={provider.driverKind}
                className={`rounded-full px-2 py-0.5 font-mono text-[11px] ${
                  provider.available
                    ? "bg-emerald-100 text-emerald-800"
                    : "bg-stone-100 text-stone-400"
                }`}
                title={provider.version ?? ""}
              >
                {provider.driverKind}
              </span>
            ))}
            {runtime.providers.length === 0 && (
              <span className="text-[11px] text-stone-400">未報告（runtime 起動待ち）</span>
            )}
          </div>
          {!runtime.canUse && (
            <p className="text-[11px] text-red-500">
              あなたはこのランタイムの利用許可がありません（default deny）
            </p>
          )}
          <GrantForm runtime={runtime} onGrant={props.onGrant} busy={props.busy} />
          {runtime.grants.map((grant) => (
            <div key={String(grant._id)} className="flex items-center gap-2 text-xs">
              <span className="flex-1 text-stone-500">
                {grant.targetType === "user"
                  ? `user: ${String(grant.targetUserId).slice(0, 8)}…`
                  : `role: ${grant.targetRole}`}
              </span>
              <button
                onClick={() => props.onRevokeGrant(grant._id)}
                className="text-red-500 underline underline-offset-2"
              >
                剥奪
              </button>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function GrantForm(props: {
  runtime: RuntimeFull;
  busy: boolean;
  onGrant: Props["onGrant"];
}) {
  const [type, setType] = useState<"role" | "user">("role");
  const [role, setRole] = useState<"owner" | "admin" | "member">("member");
  const [userId, setUserId] = useState("");
  return (
    <form
      className="flex gap-1.5"
      onSubmit={(event) => {
        event.preventDefault();
        if (type === "role") {
          props.onGrant(props.runtime._id, { type: "role", role });
        } else {
          if (!userId.trim()) return;
          props.onGrant(props.runtime._id, {
            type: "user",
            userId: userId.trim() as Id<"users">,
          });
          setUserId("");
        }
      }}
    >
      <select
        value={type}
        onChange={(event) => setType(event.target.value as "role" | "user")}
        className="rounded-lg border border-stone-200 bg-transparent px-1 py-1 text-xs"
      >
        <option value="role">role</option>
        <option value="user">user</option>
      </select>
      {type === "role" ? (
        <select
          value={role}
          onChange={(event) => setRole(event.target.value as typeof role)}
          className="flex-1 rounded-lg border border-stone-200 bg-transparent px-1 py-1 text-xs"
        >
          <option value="member">member</option>
          <option value="admin">admin</option>
          <option value="owner">owner</option>
        </select>
      ) : (
        <input
          value={userId}
          onChange={(event) => setUserId(event.target.value)}
          placeholder="user id"
          className="min-w-0 flex-1 rounded-lg border border-stone-200 bg-transparent px-2 py-1 font-mono text-xs"
        />
      )}
      <button
        disabled={props.busy}
        className="rounded-lg bg-stone-900 px-2 py-1 text-xs text-white disabled:opacity-50 dark:bg-stone-100 dark:text-stone-900"
      >
        許可
      </button>
    </form>
  );
}

function TeamTab(props: Props) {
  const [role, setRole] = useState<"admin" | "member">("member");
  return (
    <div className="grid gap-2">
      <div className="bui-surface rounded-xl p-3">
        <h3 className="text-xs font-semibold uppercase tracking-widest text-stone-400">
          Members（owner / admin / member）
        </h3>
        <div className="mt-2 grid gap-1.5">
          {(props.members ?? []).map((member) => (
            <div key={String(member.user._id)} className="flex items-center gap-2 text-sm">
              <span className="flex-1 truncate">
                {member.user.name ?? member.user.handle ?? member.user.email ?? "member"}
              </span>
              <select
                value={member.role}
                onChange={(event) =>
                  props.onSetRole(
                    member.user._id,
                    event.target.value as "owner" | "admin" | "member",
                  )
                }
                className="rounded-lg border border-stone-200 bg-transparent px-1 py-0.5 text-xs"
              >
                <option value="owner">owner</option>
                <option value="admin">admin</option>
                <option value="member">member</option>
              </select>
            </div>
          ))}
        </div>
      </div>
      <div className="bui-surface rounded-xl p-3">
        <h3 className="text-xs font-semibold uppercase tracking-widest text-stone-400">
          Invite（admin 以上）
        </h3>
        <form
          className="mt-2 flex gap-1.5"
          onSubmit={(event) => {
            event.preventDefault();
            props.onInvite(role);
          }}
        >
          <select
            value={role}
            onChange={(event) => setRole(event.target.value as typeof role)}
            className="flex-1 rounded-lg border border-stone-200 bg-transparent px-2 py-1.5 text-sm"
          >
            <option value="member">member</option>
            <option value="admin">admin</option>
          </select>
          <button
            disabled={props.busy}
            className="rounded-lg bg-stone-900 px-2 py-1.5 text-xs text-white disabled:opacity-50 dark:bg-stone-100 dark:text-stone-900"
          >
            発行
          </button>
        </form>
        {props.inviteToken && (
          <p className="mt-2 break-all font-mono text-[11px] text-stone-500">
            token: {props.inviteToken}
          </p>
        )}
      </div>
    </div>
  );
}
