import { useMutation } from "convex/react";
import { AtSign, Cpu, Folder, MessageSquarePlus, Paperclip, Sparkles, UserPlus, UserRound } from "lucide-react";
import { useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { Monogram } from "@/components/atoms/EntityChip";
import PromptBar, { type PromptMenuItem, type PromptPicker } from "@/components/primitives/PromptBar";
import { isLive, useOrg, type Chat } from "@/harness/OrgContext";
import { colorFor, displayName, formatBytes, monogram } from "@/lib/format";
import { MENTION_BOUNDARY, MENTION_HANDLE, hasAgentMention } from "@/lib/mentions";
import { PROVIDERS, isProviderKind, providerHandle } from "@/lib/providers";

/* the draft ends in an @token still being typed — hold the auto-mention hint */
const TYPING_MENTION = new RegExp(`${MENTION_BOUNDARY}@${MENTION_HANDLE}*$`);

/* ─────────────────────────────────────────────────────────
 * COMPOSER — PromptBar wired to the org: @ agents + members,
 * / commands, provider + runtime pickers, R2 attachments, and
 * the Phase 1 rule that project chats auto-mention the chosen
 * provider so a plain message still reaches an agent.
 * ───────────────────────────────────────────────────────── */

/** Send with the Phase 1 rules applied (auto-mention in project chats,
 *  R2 uploads appended as links, runtime hint from the picker). */
export function useSendMessage(chat: Chat | null) {
  const org = useOrg();
  const sendMessage = useMutation(api.messages.send);
  const recordFile = useMutation(api.files.record);
  const [busy, setBusy] = useState(false);

  const upload = async (file: File): Promise<string> => {
    const response = await fetch("/api/files", { method: "POST", headers: { "X-File-Name": encodeURIComponent(file.name) }, body: file });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(text || "ファイルサーバに接続できません（wrangler dev の起動を確認）");
    }
    const uploaded = (await response.json()) as { key: string; name: string; contentType: string; size: number; url: string };
    await recordFile({ orgId: org.org._id, chatId: chat?._id, key: uploaded.key, name: uploaded.name, contentType: uploaded.contentType, size: uploaded.size });
    return `📎 [${uploaded.name}](${uploaded.url})`;
  };

  const send = async (text: string, files: File[] = []) => {
    if (!chat || busy) return null;
    setBusy(true);
    try {
      const links: string[] = [];
      for (const file of files) links.push(await upload(file));
      let body = [text, ...links].filter(Boolean).join("\n");
      if (chat.kind === "project" && !hasAgentMention(body)) body = `@${providerHandle(org.provider)} ${body}`;
      const result = await sendMessage({ chatId: chat._id, body, runtimeId: org.runtimeId ?? undefined });
      return { chatId: chat._id, dispatched: result.dispatched, jobId: result.jobId };
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
  onSent,
}: {
  chat: Chat | null;
  tall?: boolean;
  placeholder?: string;
  autoFocus?: boolean;
  onSent?: (result: { chatId: Id<"chats">; dispatched: boolean; jobId?: Id<"jobs"> }) => void;
}) {
  const org = useOrg();
  const { send: sendWithRules, busy } = useSendMessage(chat);
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<File[]>([]);
  const [draft, setDraft] = useState("");

  const disabled = !chat;
  const isProject = chat?.kind === "project";
  const typingMention = TYPING_MENTION.test(draft);
  const needsMention = isProject && draft.trim().length > 0 && !hasAgentMention(draft) && !typingMention;
  const handle = providerHandle(org.provider);

  const liveRuntimes = useMemo(() => (org.runtimes ?? []).filter((runtime) => isLive(runtime, org.now)), [org.runtimes, org.now]);
  const usable = useMemo(() => liveRuntimes.filter((runtime) => runtime.canUse), [liveRuntimes]);
  const installed = useMemo(
    () => new Set(usable.flatMap((runtime) => runtime.providers.filter((provider) => provider.available).map((provider) => provider.driverKind))),
    [usable],
  );

  const mentions: PromptMenuItem[] = useMemo(() => {
    const agents: PromptMenuItem[] = [
      { key: "agent", name: "@agent", desc: "既定のプロバイダで実行", icon: <Sparkles size={14} />, insert: "@agent " },
      ...Object.entries(PROVIDERS).map(([kind, provider]) => ({
        key: kind,
        name: `@${provider.handle}`,
        desc: `${provider.label} で実行`,
        icon: <Monogram color={provider.color}>{provider.label.charAt(0)}</Monogram>,
        insert: `@${provider.handle} `,
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
  }, [org.members, org.me._id, installed, liveRuntimes.length]);

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

  const pickers: PromptPicker[] = [
    {
      id: "provider",
      ariaLabel: "プロバイダを選択",
      label: PROVIDERS[org.provider].label,
      items: Object.entries(PROVIDERS).map(([kind, provider]) => ({
        key: kind,
        name: provider.label,
        tag: installed.has(kind as never) ? "利用可" : liveRuntimes.length > 0 ? "未検出" : undefined,
      })),
      value: org.provider,
      onChange: (key) => {
        if (isProviderKind(key)) org.setProvider(key);
      },
      footer: "t3code 由来のプロバイダ配線 · CLI はランタイム側（dalecode start / Multica daemon）",
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
      <AtSign size={11} /> メンションがないので送信時に <code className="font-mono text-ink-2">@{handle}</code> を自動付与します（Phase 1 のルール）
    </span>
  );
  else if (isProject) hint = "@codex / @claude などでエージェントが応答 · ⏎ 送信 · ⇧⏎ 改行";
  else hint = "DM ではエージェントが常に応答します · ⏎ 送信 · ⇧⏎ 改行";

  return (
    <>
      <PromptBar
        tall={tall}
        disabled={disabled}
        busy={busy}
        placeholder={placeholder ?? (isProject ? "@codex にタスクを頼む、または相談を書く…" : "何でも聞いてください…")}
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
