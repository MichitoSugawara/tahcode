import { useMutation } from "convex/react";
import { AtSign, Cpu, Folder, MessageSquarePlus, Paperclip, Sparkles, UserPlus, UserRound } from "lucide-react";
import { useCallback, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { Monogram } from "@/components/atoms/EntityChip";
import PromptBar, { type PromptMenuItem, type PromptPicker } from "@/components/primitives/PromptBar";
import { isLive, useOrg, type Chat } from "@/harness/OrgContext";
import { useSetChatAgent } from "@/harness/optimisticMutations";
import { colorFor, displayName, formatBytes, monogram } from "@/lib/format";
import { MENTION_BOUNDARY, MENTION_HANDLE, activeAgentToken, hasAgentMention } from "@/lib/mentions";
import { placeholderId, resolveId } from "@/lib/optimistic";
import {
  PROVIDERS,
  agentMention,
  isProviderKind,
  modelDisplayName,
  modelMentionExample,
  modelSourceHint,
  modelsFor,
  supportsModelPick,
  type ProviderDriverKind,
} from "@/lib/providers";

/* the draft ends in an @token still being typed — hold the auto-mention hint */
const TYPING_MENTION = new RegExp(`${MENTION_BOUNDARY}@${MENTION_HANDLE}*$`);

/* ─────────────────────────────────────────────────────────
 * COMPOSER — PromptBar wired to the org: @ agents + members,
 * / commands, provider + model + runtime pickers, R2
 * attachments, and the Phase 1 rule that project chats
 * auto-mention the chat's agent (`@cursor/muse-spark-1.3`) so a
 * plain message still reaches it.
 * ───────────────────────────────────────────────────────── */

const MENTION_RE = new RegExp(`@${MENTION_HANDLE}+`, "g");

export type ComposerAgent = { driverKind: ProviderDriverKind; model: string | null };

/**
 * The agent a chat runs on: the chat's own binding when it has one, else the
 * org's last-used pick. Changing it writes both, so the choice sticks for the
 * chat (every member, every device) and seeds the next unbound chat.
 */
export function useChatAgent(chat: Chat | null) {
  const org = useOrg();
  const bindChat = useSetChatAgent();
  const agent: ComposerAgent = chat?.driverKind
    ? { driverKind: chat.driverKind, model: chat.model ?? null }
    : { driverKind: org.provider, model: org.model };
  const setAgent = useCallback(
    (driverKind: ProviderDriverKind, model: string | null) => {
      org.setAgent(driverKind, model);
      if (chat) {
        /* a chat opened straight from its create dialog may still carry a placeholder id */
        void resolveId(chat._id)
          .then((chatId) => bindChat({ chatId, driverKind, model: model ?? undefined }))
          .catch((error: unknown) => toast.error(error instanceof Error ? error.message : "エージェントの設定に失敗しました"));
      }
    },
    [org, chat, bindChat],
  );
  return { agent, setAgent };
}

/** Send with the Phase 1 rules applied (auto-mention in project chats,
 *  R2 uploads appended as links, runtime hint from the picker, and the
 *  chat's provider / model sent along so DMs bind to them too).
 *  The user's bubble is inserted optimistically so the thread moves the
 *  moment ⏎ is pressed; the agent's reply row still comes from the server. */
export function useSendMessage(chat: Chat | null) {
  const org = useOrg();
  const { agent } = useChatAgent(chat);
  const sendMessage = useMutation(api.messages.send).withOptimisticUpdate((store, args) => {
    for (const { args: listArgs, value } of store.getAllQueries(api.messages.list)) {
      if (value === undefined || listArgs.chatId !== args.chatId) continue;
      store.setQuery(api.messages.list, listArgs, [
        ...value,
        {
          _id: placeholderId("messages"),
          _creationTime: Date.now(),
          chatId: args.chatId,
          authorType: "user",
          authorId: org.me._id,
          body: args.body,
          mentions: Array.from(new Set(args.body.match(MENTION_RE) ?? [])),
          authorName: org.me.name,
          authorHandle: org.me.handle,
        },
      ]);
    }
  });
  const recordFile = useMutation(api.files.record);
  const [busy, setBusy] = useState(false);

  const upload = async (chatId: Id<"chats">, file: File): Promise<string> => {
    const response = await fetch("/api/files", { method: "POST", headers: { "X-File-Name": encodeURIComponent(file.name) }, body: file });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(text || "ファイルサーバに接続できません（wrangler dev の起動を確認）");
    }
    const uploaded = (await response.json()) as { key: string; name: string; contentType: string; size: number; url: string };
    await recordFile({ orgId: org.org._id, chatId, key: uploaded.key, name: uploaded.name, contentType: uploaded.contentType, size: uploaded.size });
    return `📎 [${uploaded.name}](${uploaded.url})`;
  };

  const send = async (text: string, files: File[] = []) => {
    if (!chat || busy) return null;
    setBusy(true);
    try {
      /* a chat opened straight from its create dialog may still carry a placeholder id */
      const chatId = await resolveId(chat._id);
      const links: string[] = [];
      for (const file of files) links.push(await upload(chatId, file));
      let body = [text, ...links].filter(Boolean).join("\n");
      if (chat.kind === "project" && !hasAgentMention(body)) body = `${agentMention(agent.driverKind, agent.model)} ${body}`;
      const result = await sendMessage({
        chatId,
        body,
        runtimeId: org.runtimeId ?? undefined,
        driverKind: agent.driverKind,
        model: agent.model ?? undefined,
      });
      return { chatId, dispatched: result.dispatched, jobId: result.jobId };
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "送信に失敗しました");
      return null;
    } finally {
      setBusy(false);
    }
  };

  return { send, busy };
}

export function Composer({
  chat,
  tall = false,
  placeholder,
  autoFocus,
  onSubmit,
  onSent,
}: {
  chat: Chat | null;
  tall?: boolean;
  placeholder?: string;
  autoFocus?: boolean;
  /** fires as the message leaves the composer — before the round-trip, so callers can navigate at once */
  onSubmit?: (chat: Chat) => void;
  onSent?: (result: { chatId: Id<"chats">; dispatched: boolean; jobId?: Id<"jobs"> }) => void;
}) {
  const org = useOrg();
  const { send: sendWithRules, busy } = useSendMessage(chat);
  const { agent, setAgent } = useChatAgent(chat);
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<File[]>([]);
  const [draft, setDraft] = useState("");

  const disabled = !chat;
  const isProject = chat?.kind === "project";
  const typingMention = TYPING_MENTION.test(draft);
  const needsMention = isProject && draft.trim().length > 0 && !hasAgentMention(draft) && !typingMention;
  const mention = agentMention(agent.driverKind, agent.model);
  const provider = PROVIDERS[agent.driverKind];

  const liveRuntimes = useMemo(() => (org.runtimes ?? []).filter((runtime) => isLive(runtime, org.now)), [org.runtimes, org.now]);
  const usable = useMemo(() => liveRuntimes.filter((runtime) => runtime.canUse), [liveRuntimes]);
  const installed = useMemo(
    () => new Set(usable.flatMap((runtime) => runtime.providers.filter((provider) => provider.available).map((provider) => provider.driverKind))),
    [usable],
  );

  /* `@cursor/` switches the @ menu from providers + people to that provider's models */
  const modelToken = useMemo(() => {
    const token = activeAgentToken(draft);
    return token && token.modelQuery !== null ? token : null;
  }, [draft]);

  const mentions: PromptMenuItem[] = useMemo(() => {
    if (modelToken) {
      const kind = modelToken.providerKind;
      const info = PROVIDERS[kind];
      return modelsFor(kind).map((model) => ({
        key: `m-${kind}-${model.slug}`,
        name: `@${modelToken.handle}/${model.slug}`,
        desc: model.name,
        icon: <Monogram color={info.color}>{info.label.charAt(0)}</Monogram>,
        insert: `@${modelToken.handle}/${model.slug} `,
        trailing: model.legacy ? "legacy" : undefined,
      }));
    }
    const agents: PromptMenuItem[] = [
      { key: "agent", name: "@agent", desc: "このチャットの既定エージェントで実行", icon: <Sparkles size={14} />, insert: "@agent " },
      ...Object.entries(PROVIDERS).map(([kind, info]) => ({
        key: kind,
        name: `@${info.handle}`,
        desc: `${info.label} で実行（@${info.handle}/… でモデル指定）`,
        icon: <Monogram color={info.color}>{info.label.charAt(0)}</Monogram>,
        insert: `@${info.handle} `,
        trailing: installed.has(kind as never) ? "利用可" : liveRuntimes.length > 0 ? "未検出" : undefined,
      })),
    ];
    const people: PromptMenuItem[] = (org.members ?? [])
      .filter((member) => member.user.handle)
      .map((member) => ({
        key: `u-${String(member.user._id)}`,
        name: `@${member.user.handle}`,
        desc: displayName(member.user),
        icon: <Monogram color={colorFor(String(member.user._id))}>{monogram(displayName(member.user))}</Monogram>,
        insert: `@${member.user.handle} `,
        trailing: String(member.user._id) === String(org.me._id) ? "あなた" : undefined,
      }));
    return [...agents, ...people];
  }, [modelToken, org.members, org.me._id, installed, liveRuntimes.length]);

  const commands: PromptMenuItem[] = [
    { key: "new", name: "/new", desc: "新しいチャット", icon: <MessageSquarePlus size={14} />, action: () => org.openDialog({ kind: "newChat" }) },
    { key: "project", name: "/project", desc: "新しいプロジェクト", icon: <Folder size={14} />, action: () => org.openDialog({ kind: "createProject" }) },
    { key: "runtime", name: "/runtime", desc: "マシンランタイムを登録", icon: <Cpu size={14} />, action: () => org.openDialog({ kind: "registerRuntime" }) },
    { key: "dm", name: "/dm", desc: "Personal DM を開く", icon: <UserRound size={14} />, action: () => org.dmId && org.goChat(org.dmId) },
    ...(org.isAdmin ? [{ key: "invite", name: "/invite", desc: "メンバーを招待", icon: <UserPlus size={14} />, action: () => org.openDialog({ kind: "invite" }) }] : []),
  ];

  const plusItems: PromptMenuItem[] = [
    { key: "attach", name: "ファイルを添付", desc: "Cloudflare R2 に保存（20MB まで）", icon: <Paperclip size={14} />, action: () => fileRef.current?.click() },
  ];

  const models = modelsFor(agent.driverKind);
  const pickers: PromptPicker[] = [
    {
      id: "provider",
      ariaLabel: "プロバイダを選択",
      label: provider.label,
      items: Object.entries(PROVIDERS).map(([kind, info]) => ({
        key: kind,
        name: info.label,
        tag: installed.has(kind as never) ? "利用可" : liveRuntimes.length > 0 ? "未検出" : undefined,
      })),
      value: agent.driverKind,
      onChange: (key) => {
        /* model slugs are provider-specific, so a provider change resets to that CLI's default */
        if (isProviderKind(key) && key !== agent.driverKind) setAgent(key, null);
      },
      footer: "t3code 由来のプロバイダ配線 · CLI はランタイム側（dalecode start / Multica daemon）",
    },
    {
      id: "model",
      ariaLabel: "モデルを選択",
      label: agent.model ? (modelDisplayName(agent.driverKind, agent.model) ?? agent.model) : "既定モデル",
      items: [
        { key: "", name: "既定モデル", tag: "CLI の設定" },
        ...(supportsModelPick(agent.driverKind)
          ? models.map((model) => ({ key: model.slug, name: model.name, tag: model.legacy ? "legacy" : undefined }))
          : []),
      ],
      value: agent.model ?? "",
      onChange: (key) => setAgent(agent.driverKind, key || null),
      footer: supportsModelPick(agent.driverKind)
        ? `メンションは @${provider.handle}/<slug> の形になります · 既定 = CLI 側の設定 · 出典: ${modelSourceHint(agent.driverKind)}`
        : `${provider.label} は headless CLI がなく、モデルは選べません`,
    },
    {
      id: "runtime",
      ariaLabel: "ランタイムを選択",
      icon: <Cpu size={12} />,
      label: org.runtimeId ? (org.runtimes?.find((runtime) => runtime._id === org.runtimeId)?.name ?? "指定中") : "自動",
      items: [
        { key: "auto", name: "自動選択", tag: usable.length > 0 ? `${usable.length} 台` : "待機" },
        ...(org.runtimes ?? []).map((runtime) => ({
          key: String(runtime._id),
          name: runtime.name,
          tag: !runtime.canUse ? "許可なし" : isLive(runtime, org.now) ? "オンライン" : "オフライン",
          disabled: !runtime.canUse,
        })),
      ],
      value: org.runtimeId ? String(org.runtimeId) : "auto",
      onChange: (key) => org.setRuntimeId(key === "auto" ? null : (key as Id<"runtimes">)),
      emptyHint: "ランタイムがありません",
      footer: (org.runtimes ?? []).length === 0 ? "「/runtime」でこのマシンを登録（npm i -g dalecode）" : "default deny — 許可のないマシンは選べません",
    },
  ];

  const send = async (text: string) => {
    if (chat && !busy) onSubmit?.(chat);
    const result = await sendWithRules(text, pending);
    if (result) {
      setPending([]);
      setDraft("");
      onSent?.(result);
    }
  };

  let hint: ReactNode = null;
  if (disabled) hint = "チャットを開くと送信できます";
  else if (needsMention) hint = (
    <span className="inline-flex flex-wrap items-center gap-1">
      <AtSign size={11} /> メンションがないので送信時に <code className="font-mono text-ink-2">{mention}</code> を自動付与します（Phase 1 のルール）
    </span>
  );
  else if (isProject) hint = `${mention} がこのチャットのエージェント · ${modelMentionExample(agent.driverKind)} のように別のモデルも指名できます · ⏎ 送信 · ⇧⏎ 改行`;
  else hint = `DM ではエージェントが常に応答します（${mention}） · ⏎ 送信 · ⇧⏎ 改行`;

  return (
    <>
      <PromptBar
        tall={tall}
        disabled={disabled}
        busy={busy}
        placeholder={placeholder ?? (isProject ? `${mention} にタスクを頼む、または相談を書く…` : "何でも聞いてください…")}
        mentions={mentions}
        commands={commands}
        plusItems={plusItems}
        pickers={pickers}
        attachments={pending.map((file) => ({ name: `${file.name} · ${formatBytes(file.size)}`, size: file.size }))}
        onRemoveAttachment={(index) => setPending((current) => current.filter((_, i) => i !== index))}
        onSend={send}
        onDraftChange={setDraft}
        hint={hint}
        autoFocus={autoFocus}
        menuFooter={{ at: modelToken ? `${PROVIDERS[modelToken.providerKind].label} のモデル · @${modelToken.handle} だけなら CLI の既定モデル` : "エージェントかメンバーを選択 · @provider/ でモデル候補" }}
      />
      <input
        ref={fileRef}
        type="file"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) {
            if (file.size > 20 * 1024 * 1024) toast.error("20MB までのファイルを添付できます");
            else setPending((current) => [...current, file]);
          }
          event.target.value = "";
        }}
      />
    </>
  );
}
