import { useQuery } from "convex/react";
import { AtSign, Folder, History, Lock, UserRound } from "lucide-react";
import { useMemo } from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Monogram } from "@/components/atoms/EntityChip";
import { StatusPill } from "@/components/atoms/StatusPill";
import { TextRow } from "@/components/atoms/TextRow";
import ContextCards, { type ContextChunk } from "@/components/primitives/ContextCards";
import { useOrg } from "@/harness/OrgContext";
import { Notice } from "@/harness/ui/Notice";
import { colorFor, displayName, monogram } from "@/lib/format";
import { PROVIDERS } from "@/lib/providers";

/* What the agent receives on the next run: history + mentions +
 * project link (Phase 1: no Focus mode). Rendered with Beautiful
 * UI's ContextCards so it reads like retrieved context, because it is. */
export function ContextPane({ chatId }: { chatId?: string }) {
  const { projects } = useOrg();
  const chat = useQuery(api.chats.get, chatId ? { chatId: chatId as Id<"chats"> } : "skip");
  const messages = useQuery(api.messages.list, chatId ? { chatId: chatId as Id<"chats">, limit: 200 } : "skip");
  const chatMembers = useQuery(api.chats.members, chatId && chat?.kind === "project" ? { chatId: chatId as Id<"chats"> } : "skip");
  const project = chat?.projectId ? projects?.find((item) => item._id === chat.projectId) : undefined;

  const lastMentions = useMemo(() => {
    const lastUser = [...(messages ?? [])].reverse().find((message) => message.authorType === "user");
    return lastUser?.mentions ?? [];
  }, [messages]);

  if (!chatId) {
    return (
      <div className="flex flex-col gap-3">
        <Notice tone="info" title="チャットを開くとコンテキストが表示されます">
          エージェントに渡すのは <span className="font-medium text-ink">会話履歴 + メンション + プロジェクトリンク</span> の 3 つです。Focus モードは Phase 1 にはありません。
        </Notice>
        <div className="rounded-card bg-surface shadow-card">
          <div className="primitive-card-bar border-b border-line text-[13px] font-medium text-ink">応答ルール</div>
          <div className="px-3 py-1">
            <TextRow label="Personal DM" value={<StatusPill tone="green">常時応答</StatusPill>} />
            <TextRow label="プロジェクトチャット" value={<StatusPill tone="accent">@mention で応答</StatusPill>} />
          </div>
        </div>
      </div>
    );
  }

  if (chat === undefined) return <div className="text-[13px] text-ink-3">読み込み中…</div>;
  if (chat === null) return <Notice tone="locked" title="このチャットは表示できません">参加しているチャットのみコンテキストを確認できます。</Notice>;

  const historyCount = Math.min(messages?.length ?? 0, 30);
  const chunks: ContextChunk[] = [
    {
      title: project ? project.name : "Personal DM（プロジェクト未リンク）",
      chars: project ? (project.visibility === "private" ? "private" : "org") : "dm",
      body: project
        ? [project.repoUrl ? `repo: ${project.repoUrl}` : null, project.cwd ? `cwd: ${project.cwd}` : null].filter(Boolean).join(" · ") || "リソース未設定 — プロジェクト名だけが渡されます"
        : "DM ではプロジェクトの代わりにあなたの Org 名だけが渡されます。",
      source: project ? project.slug : "no project link",
      badge: "PRJ",
      tone: "bg-accent",
    },
    {
      title: "会話履歴",
      chars: `${historyCount} 件`,
      body: historyCount > 0 ? "直近 30 件のメッセージを時系列で渡します。" : "まだメッセージがありません。最初の 1 通から履歴になります。",
      source: "messages (最新 30 件)",
      badge: "HIS",
      tone: "bg-green",
    },
    {
      title: "メンション",
      chars: `${lastMentions.length} 件`,
      body: lastMentions.length > 0 ? `直近のあなたの投稿: ${lastMentions.join(" ")}` : chat.kind === "dm" ? "DM ではメンション不要です。" : "@codex や @claude を付けるとその provider で実行します。",
      source: "last user message",
      badge: "@",
      tone: "bg-orange",
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-card bg-surface shadow-card">
        <div className="primitive-card-bar flex items-center justify-between border-b border-line">
          <span className="text-[13px] font-medium text-ink">{chat.kind === "dm" ? "Personal DM" : chat.title}</span>
          {chat.kind === "dm" ? <StatusPill tone="green">常時応答</StatusPill> : <StatusPill tone="accent">@mention で応答</StatusPill>}
        </div>
        <div className="px-3 py-1">
          <TextRow
            label={<span className="inline-flex items-center gap-1.5"><Folder size={13} /> プロジェクト</span>}
            value={project ? project.name : "—"}
            meta={project?.visibility === "private" ? <Lock size={12} /> : undefined}
          />
          <TextRow label={<span className="inline-flex items-center gap-1.5"><History size={13} /> 履歴</span>} value={`${historyCount} 件`} meta="最大 30" />
          <TextRow
            label={<span className="inline-flex items-center gap-1.5"><AtSign size={13} /> ハンドル</span>}
            value={
              <span className="flex flex-wrap justify-end gap-1">
                {Object.values(PROVIDERS)
                  .slice(0, 2)
                  .map((provider) => (
                    <code key={provider.handle} className="rounded-[4px] bg-inset px-1 font-mono text-[11px] text-ink-2">@{provider.handle}</code>
                  ))}
                <code className="rounded-[4px] bg-inset px-1 font-mono text-[11px] text-ink-2">@agent</code>
              </span>
            }
          />
        </div>
      </div>

      <ContextCards chunks={chunks} labels={{ header: "エージェントに渡すもの", count: String(chunks.length) }} className="max-w-none" />

      {chat.kind === "project" && (
        <div className="rounded-card bg-surface shadow-card">
          <div className="primitive-card-bar flex items-center justify-between border-b border-line">
            <span className="inline-flex items-center gap-1.5 text-[13px] font-medium text-ink">
              <UserRound size={13} /> 参加メンバー
            </span>
            <span className="text-[12px] tabular-nums text-ink-3">{chatMembers?.length ?? "…"}</span>
          </div>
          <div className="flex flex-col gap-1 p-2">
            {(chatMembers ?? []).map((user) => (
              <div key={String(user._id)} className="flex h-8 items-center gap-2 rounded-[6px] px-1.5 text-[13px] text-ink">
                <Monogram color={colorFor(String(user._id))}>{monogram(displayName(user))}</Monogram>
                <span className="min-w-0 flex-1 truncate">{displayName(user)}</span>
                {user.handle && <span className="font-mono text-[11px] text-ink-3">@{user.handle}</span>}
              </div>
            ))}
            {chatMembers && chatMembers.length === 0 && <div className="px-1.5 py-1 text-[12px] text-ink-3">参加者はいません</div>}
          </div>
        </div>
      )}

      <p className="px-0.5 text-[11.5px] leading-relaxed text-ink-3">Focus モード・Kanban・クラウドエージェントは Phase 2 以降の対象です。</p>
    </div>
  );
}
