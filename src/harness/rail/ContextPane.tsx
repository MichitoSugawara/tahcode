import { useQuery } from "convex/react";
import {
  Activity,
  AtSign,
  Folder,
  History,
  Layers,
  Lock,
  UserRound,
} from "lucide-react";
import { useMemo } from "react";
import { toast } from "sonner";

import { Chip } from "@/components/atoms/Chip";
import { Monogram } from "@/components/atoms/EntityChip";
import { Shimmer } from "@/components/atoms/Shimmer";
import { StatusPill } from "@/components/atoms/StatusPill";
import { TextRow } from "@/components/atoms/TextRow";
import { ValuePill } from "@/components/atoms/ValuePill";
import ContextCards from "@/components/primitives/ContextCards";
import type { ContextChunk } from "@/components/primitives/ContextCards";
import TaskRows from "@/components/primitives/TaskRows";
import type { TaskRow } from "@/components/primitives/TaskRows";
import { useSetChatProfile } from "@/harness/optimisticMutations";
import { useOrg } from "@/harness/OrgContext";
import { Notice } from "@/harness/ui/Notice";
import { ProfilePicker } from "@/harness/ui/ProfilePicker";
import {
  colorFor,
  displayName,
  errorSummary,
  monogram,
  truncate,
} from "@/lib/format";
import { isPlaceholderId } from "@/lib/optimistic";
import {
  PROVIDERS,
  agentLabel,
  agentMention,
  providerLabel,
} from "@/lib/providers";

import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

/* What the agent receives on the next run: history + mentions +
 * project link (Phase 1: no Focus mode). Rendered with Beautiful
 * UI's ContextCards so it reads like retrieved context, because it is. */
const NO_MESSAGES: never[] = [];

export function ContextPane({ chatId }: { chatId?: string }) {
  const { org, projects, runtimes, chats } = useOrg();
  const bindProfile = useSetChatProfile();
  const profiles = useQuery(
    api.skillProfiles.list,
    org ? { orgId: org._id } : "skip"
  );
  /* a chat still being created has a placeholder id: nothing to ask the server for yet */
  const serverId =
    chatId && !isPlaceholderId(chatId) ? (chatId as Id<"chats">) : null;
  const fetched = useQuery(
    api.chats.get,
    serverId ? { chatId: serverId } : "skip"
  );
  const listed = chats?.find((item) => String(item._id) === chatId);
  const chat = fetched === undefined ? listed : fetched;
  const fetchedPage = useQuery(
    api.messages.list,
    fetched ? { chatId: fetched._id, limit: 30 } : "skip"
  );
  const messages = fetched ? fetchedPage?.messages : NO_MESSAGES;
  const chatMembers = useQuery(
    api.chats.members,
    serverId && chat?.kind === "project" ? { chatId: serverId } : "skip"
  );
  const jobs = useQuery(
    api.jobs.listByChat,
    serverId && chat ? { chatId: serverId } : "skip"
  );
  const project = chat?.projectId
    ? projects?.find((item) => item._id === chat.projectId)
    : undefined;

  const taskRows = useMemo<TaskRow[]>(
    () =>
      (jobs ?? []).slice(0, 5).map((job) => {
        const runtime = runtimes?.find((item) => item._id === job.runtimeId);
        const status: TaskRow["status"] =
          job.status === "done"
            ? "done"
            : job.status === "failed"
              ? "failed"
              : job.status === "running"
                ? "running"
                : "queued";
        return {
          amount: job.model
            ? agentLabel(job.driverKind, job.model)
            : providerLabel(job.driverKind),
          details: [
            { label: "ランタイム", meta: runtime?.name ?? "—" },
            { label: "状態", meta: job.status },
            ...(job.error
              ? [{ label: "エラー", meta: truncate(job.error, 40) }]
              : []),
          ],
          key: String(job._id),
          label: truncate(job.prompt.replace(/^@\S+\s*/, ""), 34),
          status,
          step: 1,
        };
      }),
    [jobs, runtimes]
  );

  const lastMentions = useMemo(() => {
    const lastUser = [...(messages ?? [])]
      .reverse()
      .find((message) => message.authorType === "user");
    return lastUser?.mentions ?? [];
  }, [messages]);

  if (!chatId) {
    return (
      <div className="flex flex-col gap-3">
        <Notice tone="info" title="チャットを開くとコンテキストが表示されます">
          エージェントに渡すのは{" "}
          <span className="text-ink font-medium">
            会話履歴 + メンション + プロジェクトリンク
          </span>{" "}
          の 3 つです。Focus モードは Phase 1 にはありません。
        </Notice>
        <div className="rounded-card bg-surface shadow-card">
          <div className="primitive-card-bar border-line text-ink border-b text-[13px] font-medium">
            応答ルール
          </div>
          <div className="px-3 py-1">
            <TextRow
              label="Personal DM"
              value={<StatusPill tone="green">常時応答</StatusPill>}
            />
            <TextRow
              label="プロジェクトチャット"
              value={<StatusPill tone="accent">@mention で応答</StatusPill>}
            />
          </div>
        </div>
      </div>
    );
  }

  if (chat === undefined) {
    return (
      <div className="text-[13px]">
        <Shimmer>コンテキストを読み込んでいます</Shimmer>
      </div>
    );
  }
  if (chat === null) {
    return (
      <Notice tone="locked" title="このチャットは表示できません">
        参加しているチャットのみコンテキストを確認できます。
      </Notice>
    );
  }

  const historyCount = Math.min(messages?.length ?? 0, 30);
  const boundAgent = chat.driverKind
    ? agentMention(chat.driverKind, chat.model)
    : null;
  const attachedProfile = profiles?.find(
    (profile) => String(profile._id) === String(chat.profileId)
  );
  const inheritedProfile =
    !chat.profileId && project?.profileId
      ? profiles?.find(
          (profile) => String(profile._id) === String(project.profileId)
        )
      : undefined;
  const effectiveProfile = attachedProfile ?? inheritedProfile;
  const chunks: ContextChunk[] = [
    {
      badge: "PRJ",
      body: project
        ? [
            project.repoUrl ? `repo: ${project.repoUrl}` : null,
            project.cwd ? `cwd: ${project.cwd}` : null,
          ]
            .filter(Boolean)
            .join(" · ") || "リソース未設定 — プロジェクト名だけが渡されます"
        : "DM ではプロジェクトの代わりにあなたの Org 名だけが渡されます。",
      chars: project
        ? project.visibility === "private"
          ? "private"
          : "org"
        : "dm",
      source: project ? project.slug : "no project link",
      title: project ? project.name : "Personal DM（プロジェクト未リンク）",
      tone: "bg-accent",
    },
    {
      badge: "HIS",
      body:
        historyCount > 0
          ? "直近 30 件のメッセージを時系列で渡します。"
          : "まだメッセージがありません。最初の 1 通から履歴になります。",
      chars: `${historyCount} 件`,
      source: "messages (最新 30 件)",
      title: "会話履歴",
      tone: "bg-green",
    },
    {
      badge: "@",
      body:
        lastMentions.length > 0
          ? `直近のあなたの投稿: ${lastMentions.join(" ")}`
          : chat.kind === "dm"
            ? "DM ではメンション不要です。"
            : "@codex や @cursor/muse-spark-1.3 を付けるとその provider / model で実行します。",
      chars: `${lastMentions.length} 件`,
      source: "last user message",
      title: "メンション",
      tone: "bg-orange",
    },
    {
      badge: "SKL",
      body: effectiveProfile
        ? `${effectiveProfile.name}（${effectiveProfile.skillCount} 件）。本文はプロンプトに入れず、マシンへ同期します。`
        : "プロファイル未設定。スキルは同期されません。",
      chars: effectiveProfile ? `${effectiveProfile.skillCount} 件` : "0",
      source: "skill profile",
      title: "スキル",
      tone: "bg-accent",
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-card bg-surface shadow-card">
        <div className="primitive-card-bar border-line flex items-center justify-between border-b">
          <span className="text-ink text-[13px] font-medium">
            {chat.kind === "dm" ? "Personal DM" : chat.title}
          </span>
          {chat.kind === "dm" ? (
            <StatusPill tone="green">常時応答</StatusPill>
          ) : (
            <StatusPill tone="accent">@mention で応答</StatusPill>
          )}
        </div>
        <div className="px-3 py-1">
          <TextRow
            label={
              <span className="inline-flex items-center gap-1.5">
                <Folder size={13} /> プロジェクト
              </span>
            }
            value={project ? project.name : "—"}
            meta={
              project?.visibility === "private" ? <Lock size={12} /> : undefined
            }
          />
          <TextRow
            label={
              <span className="inline-flex items-center gap-1.5">
                <History size={13} /> 履歴
              </span>
            }
            value={
              <ValuePill tone={historyCount > 0 ? "accent" : "neutral"}>
                {historyCount} 件
              </ValuePill>
            }
            meta="最大 30"
          />
          <TextRow
            label={
              <span className="inline-flex items-center gap-1.5">
                <AtSign size={13} /> エージェント
              </span>
            }
            value={
              <span className="flex flex-wrap justify-end gap-1">
                {boundAgent ? (
                  <Chip tone="accent">{boundAgent}</Chip>
                ) : (
                  <>
                    {Object.values(PROVIDERS)
                      .slice(0, 2)
                      .map((provider) => (
                        <Chip key={provider.handle}>@{provider.handle}</Chip>
                      ))}
                    <Chip tone="accent">@agent</Chip>
                  </>
                )}
              </span>
            }
            meta={
              boundAgent ? "このチャットの既定" : "未設定（コンポーザで選択）"
            }
          />
          <TextRow
            label={
              <span className="inline-flex items-center gap-1.5">
                <Layers size={13} /> プロファイル
              </span>
            }
            value={effectiveProfile ? effectiveProfile.name : "なし"}
            meta={
              attachedProfile
                ? "このチャット"
                : inheritedProfile
                  ? "プロジェクトの既定"
                  : "未同期"
            }
          />
        </div>
      </div>

      {serverId && (
        <div className="rounded-card bg-surface shadow-card">
          <div className="primitive-card-bar border-line text-ink border-b text-[13px] font-medium">
            スキルプロファイル
          </div>
          <div className="px-3 py-2">
            <ProfilePicker
              profiles={profiles}
              value={chat.profileId ?? null}
              onChange={(next) => {
                bindProfile({ chatId: serverId, profileId: next }).catch(
                  (error: unknown) => {
                    toast.error("プロファイルを変更できませんでした", {
                      description: errorSummary(error),
                    });
                  }
                );
              }}
            />
            <p className="text-ink-3 mt-2 text-[12px] leading-relaxed">
              未設定のときはプロジェクトの既定を使います。同期は次のジョブ開始時です。
            </p>
          </div>
        </div>
      )}

      <ContextCards
        chunks={chunks}
        labels={{
          count: String(chunks.length),
          header: "エージェントに渡すもの",
        }}
        className="max-w-none"
      />

      {taskRows.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2 px-0.5">
            <span className="text-ink inline-flex items-center gap-1.5 text-[13px] font-semibold">
              <Activity size={13} /> 実行履歴
            </span>
            <span className="bg-inset text-ink-2 shadow-hairline inline-flex h-5 items-center rounded-md px-1.5 text-[11.5px] font-medium tabular-nums">
              {jobs?.length ?? 0}
            </span>
            <span className="text-ink-3 ml-auto text-[11.5px]">直近 5 件</span>
          </div>
          <TaskRows
            variant="List"
            rows={taskRows}
            className="max-w-none"
            labels={{ completed: "完了", failed: "失敗", queued: "待機" }}
          />
        </div>
      )}

      {chat.kind === "project" && (
        <div className="rounded-card bg-surface shadow-card">
          <div className="primitive-card-bar border-line flex items-center justify-between border-b">
            <span className="text-ink inline-flex items-center gap-1.5 text-[13px] font-medium">
              <UserRound size={13} /> 参加メンバー
            </span>
            <span className="text-ink-3 text-[12px] tabular-nums">
              {chatMembers?.length ?? "…"}
            </span>
          </div>
          <div className="flex flex-col gap-1 p-2">
            {(chatMembers ?? []).map((user) => (
              <div
                key={String(user._id)}
                className="text-ink flex h-8 items-center gap-2 rounded-[6px] px-1.5 text-[13px]"
              >
                <Monogram color={colorFor(String(user._id))}>
                  {monogram(displayName(user))}
                </Monogram>
                <span className="min-w-0 flex-1 truncate">
                  {displayName(user)}
                </span>
                {user.handle && (
                  <span className="text-ink-3 font-mono text-[11px]">
                    @{user.handle}
                  </span>
                )}
              </div>
            ))}
            {chatMembers && chatMembers.length === 0 && (
              <div className="text-ink-3 px-1.5 py-1 text-[12px]">
                参加者はいません
              </div>
            )}
          </div>
        </div>
      )}

      <p className="text-ink-3 px-0.5 text-[11.5px] leading-relaxed">
        Focus モード・Kanban・クラウドエージェントは Phase 2 以降の対象です。
      </p>
    </div>
  );
}
