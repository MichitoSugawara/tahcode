import { useAuthActions } from "@convex-dev/auth/react";
import { useMutation, useQuery } from "convex/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import Composer from "../components/Composer.tsx";
import MessageItem, { type Message } from "../components/MessageItem.tsx";
import RightPanel from "../components/RightPanel.tsx";
import Sidebar from "../components/Sidebar.tsx";

function stored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export default function AppPage() {
  const { signOut } = useAuthActions();
  const me = useQuery(api.users.me);
  const orgs = useQuery(api.orgs.listMine);
  const catalog = useQuery(api.providers.catalog);

  const [orgId, setOrgId] = useState<Id<"orgs"> | null>(
    () => (stored("th-org") as Id<"orgs"> | null) ?? null,
  );
  const [chatId, setChatId] = useState<Id<"chats"> | null>(
    () => (stored("th-chat") as Id<"chats"> | null) ?? null,
  );
  const [provider, setProvider] = useState(() => stored("th-provider") ?? "codex");
  const [runtimeId, setRuntimeId] = useState<Id<"runtimes"> | null>(
    () => (stored("th-runtime") as Id<"runtimes"> | null) ?? null,
  );
  const [rightTab, setRightTab] = useState<"context" | "runtime" | "team">("context");
  const [busy, setBusy] = useState(false);
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [runtimeToken, setRuntimeToken] = useState<{
    runtimeId: string;
    token: string;
  } | null>(null);
  const [inviteToken, setInviteToken] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const createOrg = useMutation(api.orgs.create);
  const ensureDm = useMutation(api.chats.ensureDm);
  const ensureHandle = useMutation(api.users.ensureHandle);
  const createProject = useMutation(api.projects.create);
  const createChat = useMutation(api.chats.createProjectChat);
  const sendMessage = useMutation(api.messages.send);
  const registerRuntime = useMutation(api.runtimes.register);
  const grantAccess = useMutation(api.runtimes.grant);
  const revokeGrant = useMutation(api.runtimes.revokeGrant);
  const createInvite = useMutation(api.orgs.createInvite);
  const acceptInvite = useMutation(api.orgs.acceptInvite);
  const setRole = useMutation(api.orgs.setRole);
  const recordFile = useMutation(api.files.record);

  const projects = useQuery(api.projects.list, orgId ? { orgId } : "skip");
  const chats = useQuery(api.chats.list, orgId ? { orgId } : "skip");
  const runtimes = useQuery(api.runtimes.list, orgId ? { orgId } : "skip");
  const members = useQuery(api.orgs.members, orgId ? { orgId } : "skip");
  const messages = useQuery(api.messages.list, chatId ? { chatId, limit: 100 } : "skip");
  const activeChat = useQuery(api.chats.get, chatId ? { chatId } : "skip");
  const activeProject = useQuery(
    api.projects.get,
    activeChat && activeChat.projectId ? { projectId: activeChat.projectId } : "skip",
  );

  useEffect(() => {
    if (orgId) localStorage.setItem("th-org", String(orgId));
  }, [orgId]);
  useEffect(() => {
    if (chatId) localStorage.setItem("th-chat", String(chatId));
  }, [chatId]);
  useEffect(() => {
    localStorage.setItem("th-provider", provider);
  }, [provider]);
  useEffect(() => {
    if (runtimeId) localStorage.setItem("th-runtime", String(runtimeId));
  }, [runtimeId]);

  useEffect(() => {
    if (!orgId && orgs && orgs.length > 0 && orgs[0]) {
      setOrgId(orgs[0]._id);
    }
  }, [orgs, orgId]);

  useEffect(() => {
    ensureHandle().catch(() => undefined);
  }, [ensureHandle]);

  useEffect(() => {
    if (!orgId) return;
    ensureDm({ orgId })
      .then((dmId) => {
        if (!chatId) setChatId(dmId);
      })
      .catch(() => undefined);
  }, [orgId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages?.length]);

  const lastMentions = useMemo(() => {
    const lastUser = [...(messages ?? [])].reverse().find((m) => m.authorType === "user");
    return lastUser?.mentions ?? [];
  }, [messages]);

  const handleSend = async (body: string) => {
    if (!chatId) return;
    setSending(true);
    try {
      const result = await sendMessage({
        chatId,
        body,
        runtimeId: runtimeId ?? undefined,
      });
      if (result.dispatched && !result.jobId) {
        toast.info("ランタイム待ち — 右パネルで登録・起動してください");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "送信に失敗しました");
    } finally {
      setSending(false);
    }
  };

  const handleUpload = async (file: File) => {
    if (!orgId || !chatId) return;
    setUploading(true);
    try {
      const response = await fetch("/api/files", {
        method: "POST",
        headers: { "X-File-Name": encodeURIComponent(file.name) },
        body: file,
      });
      if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(
          text || "ファイルサーバに接続できません（wrangler dev 起動待ち）",
        );
      }
      const uploaded = (await response.json()) as {
        key: string;
        name: string;
        contentType: string;
        size: number;
        url: string;
      };
      await recordFile({
        orgId,
        chatId,
        key: uploaded.key,
        name: uploaded.name,
        contentType: uploaded.contentType,
        size: uploaded.size,
      });
      await handleSend(`📎 [${uploaded.name}](${uploaded.url})`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "アップロードに失敗しました");
    } finally {
      setUploading(false);
    }
  };

  const handleRegisterRuntime = async (name: string) => {
    if (!orgId) return;
    setBusy(true);
    try {
      const result = await registerRuntime({
        orgId,
        name,
        hostname: window.location.hostname,
      });
      setRuntimeToken({ runtimeId: String(result.runtimeId), token: result.token });
      setRuntimeId(result.runtimeId);
      toast.success("ランタイムを登録しました。トークンを保存してください");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "登録に失敗しました");
    } finally {
      setBusy(false);
    }
  };

  if (!orgs || me === undefined) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-stone-500">
        <span className="bui-streaming-dot mr-2 inline-block size-2 rounded-full bg-violet-600" />
        接続中…
      </div>
    );
  }

  if (orgs.length === 0) {
    return (
      <EmptyOrg
        onCreate={async (name) => {
          setBusy(true);
          try {
            const id = await createOrg({ name });
            setOrgId(id);
          } catch (error) {
            toast.error(error instanceof Error ? error.message : "作成に失敗しました");
          } finally {
            setBusy(false);
          }
        }}
        busy={busy}
        onAccept={async (token) => {
          setBusy(true);
          try {
            const id = await acceptInvite({ token });
            setOrgId(id);
            toast.success("招待を受け入れました");
          } catch (error) {
            toast.error(error instanceof Error ? error.message : "招待の受入に失敗しました");
          } finally {
            setBusy(false);
          }
        }}
      />
    );
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-3 border-b border-stone-200 px-4 py-2.5 dark:border-stone-800">
        <div className="flex items-center gap-2">
          <span className="inline-block size-6 rounded-lg bg-gradient-to-br from-violet-600 to-fuchsia-500" />
          <span className="text-sm font-semibold tracking-tight">Team Harness</span>
          <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-medium text-violet-700 dark:bg-violet-950 dark:text-violet-300">
            Phase 1
          </span>
        </div>
        <span className="hidden text-xs text-stone-400 md:inline">
          {catalog?.map((item) => item.displayName).join(" · ") ?? "providers…"}
        </span>
        <span className="flex-1" />
        <span className="hidden text-xs text-stone-500 sm:inline">
          {me?.name ?? me?.email ?? ""}
        </span>
        <button
          onClick={() => signOut()}
          className="rounded-lg border border-stone-200 px-2.5 py-1 text-xs text-stone-500 hover:bg-stone-50"
        >
          Sign out
        </button>
      </header>

      <div className="flex min-h-0 flex-1">
        <div className="hidden md:block">
          <Sidebar
            orgs={orgs}
            orgId={orgId}
            onOrgChange={(id) => {
              setOrgId(id);
              setChatId(null);
              setRuntimeId(null);
            }}
            onCreateOrg={async (name) => {
              setBusy(true);
              try {
                const id = await createOrg({ name });
                setOrgId(id);
              } catch (error) {
                toast.error(error instanceof Error ? error.message : "作成に失敗しました");
              } finally {
                setBusy(false);
              }
            }}
            projects={projects}
            onCreateProject={async (name, visibility) => {
              if (!orgId) return;
              setBusy(true);
              try {
                await createProject({ orgId, name, visibility });
              } catch (error) {
                toast.error(error instanceof Error ? error.message : "作成に失敗しました");
              } finally {
                setBusy(false);
              }
            }}
            chats={chats}
            chatId={chatId}
            onChatChange={setChatId}
            onCreateChat={async (projectId, title) => {
              setBusy(true);
              try {
                const id = await createChat({ projectId, title, visibility: "inherit" });
                setChatId(id);
              } catch (error) {
                toast.error(error instanceof Error ? error.message : "作成に失敗しました");
              } finally {
                setBusy(false);
              }
            }}
            runtimes={runtimes}
            creating={busy}
          />
        </div>

        <main className="flex min-w-0 flex-1 flex-col">
          <div className="border-b border-stone-200 px-4 py-2.5 dark:border-stone-800">
            <h1 className="truncate text-sm font-semibold">
              {activeChat
                ? activeChat.kind === "dm"
                  ? "Personal DM — 常時応答"
                  : `${activeChat.title} — @mention で応答`
                : "チャットを選択"}
            </h1>
            <p className="truncate text-[11px] text-stone-400">
              {activeProject
                ? `project: ${activeProject.name} · history + mentions + project link`
                : "history + mentions（DM） · Focus なし"}
            </p>
          </div>
          <div className="grid flex-1 gap-3 overflow-y-auto scroll-thin px-4 py-3">
            {(messages as Message[] | undefined)?.map((message) => (
              <MessageItem key={String(message._id)} message={message} />
            ))}
            {messages?.length === 0 && (
              <div className="bui-surface mx-auto my-8 max-w-md rounded-2xl p-5 text-center">
                <p className="text-sm font-medium">まずは話しかけてみましょう</p>
                <p className="mt-1 text-xs leading-5 text-stone-500">
                  DM では必ず応答します。プロジェクトチャットでは @agent や @codex
                  などのメンションが必要です。
                </p>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
          <div className="px-4 pb-4">
            <Composer
              chatKind={activeChat?.kind}
              disabled={!chatId}
              sending={sending}
              provider={provider}
              onProviderChange={setProvider}
              onSend={handleSend}
              onUpload={handleUpload}
              uploading={uploading}
            />
          </div>
        </main>

        <div className="hidden lg:block">
          <RightPanel
            tab={rightTab}
            onTab={setRightTab}
            project={
              activeProject
                ? {
                    name: activeProject.name,
                    slug: activeProject.slug,
                    cwd: activeProject.cwd,
                    repoUrl: activeProject.repoUrl,
                  }
                : null
            }
            historyCount={messages?.length ?? 0}
            lastMentions={lastMentions}
            runtimes={runtimes}
            selectedRuntimeId={runtimeId}
            onSelectRuntime={setRuntimeId}
            onRegisterRuntime={handleRegisterRuntime}
            runtimeToken={runtimeToken}
            onGrant={async (rid, target) => {
              setBusy(true);
              try {
                if (target.type === "role") {
                  await grantAccess({
                    runtimeId: rid,
                    targetType: "role",
                    targetRole: target.role,
                  });
                } else if (target.userId) {
                  await grantAccess({
                    runtimeId: rid,
                    targetType: "user",
                    targetUserId: target.userId,
                  });
                }
                toast.success("利用許可を付与しました（default deny の例外）");
              } catch (error) {
                toast.error(error instanceof Error ? error.message : "付与に失敗しました");
              } finally {
                setBusy(false);
              }
            }}
            onRevokeGrant={async (grantId) => {
              setBusy(true);
              try {
                await revokeGrant({ grantId });
              } catch (error) {
                toast.error(error instanceof Error ? error.message : "剥奪に失敗しました");
              } finally {
                setBusy(false);
              }
            }}
            members={members}
            inviteToken={inviteToken}
            onInvite={async (role) => {
              if (!orgId) return;
              setBusy(true);
              try {
                const result = await createInvite({ orgId, role });
                setInviteToken(result.token);
              } catch (error) {
                toast.error(error instanceof Error ? error.message : "発行に失敗しました");
              } finally {
                setBusy(false);
              }
            }}
            onSetRole={async (userId, role) => {
              if (!orgId) return;
              setBusy(true);
              try {
                await setRole({ orgId, userId, role });
              } catch (error) {
                toast.error(error instanceof Error ? error.message : "変更に失敗しました");
              } finally {
                setBusy(false);
              }
            }}
            convexUrl={import.meta.env.VITE_CONVEX_URL ?? "(VITE_CONVEX_URL 未設定)"}
            busy={busy}
          />
        </div>
      </div>
    </div>
  );
}

function EmptyOrg(props: {
  busy: boolean;
  onCreate: (name: string) => void;
  onAccept: (token: string) => void;
}) {
  return (
    <div className="mx-auto flex h-full max-w-md flex-col justify-center gap-4 p-6">
      <h1 className="text-2xl font-semibold tracking-tight">Org を作りましょう</h1>
      <form
        className="bui-surface flex gap-2 rounded-2xl p-4"
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          const name = String(data.get("name") ?? "").trim();
          if (name) props.onCreate(name);
        }}
      >
        <input
          name="name"
          placeholder="例: acme"
          className="min-w-0 flex-1 rounded-lg border border-stone-200 bg-transparent px-3 py-2 text-sm outline-none"
        />
        <button
          disabled={props.busy}
          className="bui-send rounded-xl px-4 py-2 text-sm font-semibold disabled:opacity-50"
        >
          作成
        </button>
      </form>
      <form
        className="bui-surface flex gap-2 rounded-2xl p-4"
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          const token = String(data.get("token") ?? "").trim();
          if (token) props.onAccept(token);
        }}
      >
        <input
          name="token"
          placeholder="招待トークンで参加"
          className="min-w-0 flex-1 rounded-lg border border-stone-200 bg-transparent px-3 py-2 font-mono text-sm outline-none"
        />
        <button
          disabled={props.busy}
          className="rounded-xl border border-stone-200 px-4 py-2 text-sm disabled:opacity-50"
        >
          参加
        </button>
      </form>
    </div>
  );
}
