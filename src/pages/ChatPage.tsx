import { useQuery } from "convex/react";
import {
  Code2,
  FileSearch,
  Home,
  ListChecks,
  MessageSquare,
} from "lucide-react";
import { useEffect } from "react";
import { useParams } from "react-router-dom";

import { Button } from "@/components/atoms/Button";
import LoadingState from "@/components/primitives/LoadingState";
import { Composer, useChatAgent, useSendMessage } from "@/harness/Composer";
import { EmptyHero, useHeroComposerMenu } from "@/harness/EmptyHero";
import type { Suggestion } from "@/harness/EmptyHero";
import { useOrg } from "@/harness/OrgContext";
import type { Chat } from "@/harness/OrgContext";
import { Thread } from "@/harness/thread/Thread";
import { Notice } from "@/harness/ui/Notice";
import { useChatMessages } from "@/harness/useChatMessages";
import { displayName } from "@/lib/format";
import {
  hasPlaceholder,
  isPlaceholderId,
  markLoaded,
  placeholderOf,
} from "@/lib/optimistic";
import { agentLabel, agentMention } from "@/lib/providers";
import { useDocumentTitle } from "@/lib/title";

import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

/* ─────────────────────────────────────────────────────────
 * CHAT — empty: the hero with chat-specific prompt ideas;
 * otherwise the reading column with the floating composer.
 * A chat that is still being created arrives here under a
 * placeholder id: it is read from the org's (optimistically
 * patched) chat list and renders as empty until the real id
 * replaces it in the URL.
 * ───────────────────────────────────────────────────────── */
export default function ChatPage() {
  const { chatId } = useParams();
  const org = useOrg();
  const placeholder = isPlaceholderId(chatId);
  const onServer =
    chatId && !placeholder ? { chatId: chatId as Id<"chats"> } : null;
  const fetched = useQuery(api.chats.get, onServer ?? "skip") as
    | Chat
    | null
    | undefined;
  const { hasOlder, loadOlder, loadingOlder, messages } = useChatMessages(
    fetched?._id ?? null,
    Boolean(fetched)
  );
  /* while `get` is in flight the sidebar list already knows the row — placeholder or just-created;
   * a placeholder nobody is creating (stale URL after a reload) is treated like a missing chat */
  const listed = org.chats?.find((item) => String(item._id) === chatId);
  const chat =
    fetched === undefined
      ? placeholder && !hasPlaceholder(chatId)
        ? null
        : listed
      : fetched;
  const { send } = useSendMessage(chat ?? null);
  const { agent } = useChatAgent(chat ?? null);
  const { composerMenuOpen, onSuggestMenuOpenChange } = useHeroComposerMenu();
  useDocumentTitle(
    chat ? (chat.kind === "dm" ? "Personal DM" : chat.title) : undefined,
    org.org.name
  );

  useEffect(() => {
    if (chat) {
      org.openTab(chat._id);
    }
  }, [chat, org]);
  useEffect(() => {
    if (chatId && messages !== undefined) {
      markLoaded(chatId);
    }
  }, [chatId, messages]);

  if (
    chat === undefined ||
    (onServer && fetched === undefined) ||
    (Boolean(fetched) && messages === undefined)
  ) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <LoadingState label="チャットを開いています" variant="Dots" />
      </div>
    );
  }

  if (chat === null) {
    return (
      <div className="mx-auto flex w-full max-w-[560px] flex-1 flex-col justify-center p-6">
        <Notice
          tone="locked"
          title="このチャットは開けません"
          action={
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={org.goHome}
            >
              <Home size={13} /> ホームへ戻る
            </Button>
          }
        >
          削除されたか、あなたに閲覧権限がありません。非公開プロジェクトはプロジェクトメンバーと
          Owner / Admin
          に表示されます。非公開チャットはチャットメンバーだけが開けます。
        </Notice>
      </div>
    );
  }

  const project = chat.projectId
    ? org.projects?.find((item) => item._id === chat.projectId)
    : undefined;

  if ((messages ?? []).length === 0) {
    /* the chat's bound agent leads every suggestion, so the first message runs on it */
    const tag =
      chat.kind === "project"
        ? `${agentMention(agent.driverKind, agent.model)} `
        : "";
    const ask = (text: string) => void send(text);
    const suggestions: Suggestion[] = [
      {
        icon: <FileSearch size={15} />,
        key: "explain",
        label: `${tag}このプロジェクトの構成を調べて要約して`,
        onClick: () => ask(`${tag}このプロジェクトの構成を調べて要約して`),
      },
      {
        icon: <ListChecks size={15} />,
        key: "plan",
        label: `${tag}次にやるべき作業を 3 つ提案して`,
        onClick: () => ask(`${tag}次にやるべき作業を 3 つ提案して`),
      },
      {
        icon: <Code2 size={15} />,
        key: "review",
        label: `${tag}直近の変更をレビューして気になる点を挙げて`,
        onClick: () => ask(`${tag}直近の変更をレビューして気になる点を挙げて`),
      },
    ];
    return (
      <div className="min-h-0 flex-1 overflow-y-auto">
        <EmptyHero
          /* keep the entrance storyboard from replaying when the placeholder id becomes the real one */
          replayKey={placeholderOf(String(chat._id)) ?? String(chat._id)}
          greeting={
            chat.kind === "dm"
              ? `こんにちは、${displayName(org.me)}`
              : project
                ? project.name
                : "プロジェクトチャット"
          }
          question={
            chat.kind === "dm"
              ? "何を手伝いましょう？"
              : `${chat.title} — 何から始めますか？`
          }
          composer={
            <Composer
              chat={chat}
              tall
              autoFocus
              onSuggestMenuOpenChange={onSuggestMenuOpenChange}
            />
          }
          composerMenuOpen={composerMenuOpen}
          suggestions={suggestions}
        />
        <div className="text-ink-3 pointer-events-none fixed right-6 bottom-4 hidden items-center gap-1.5 text-[11.5px] xl:flex">
          <MessageSquare size={11} />{" "}
          {chat.kind === "dm"
            ? `Personal DM · 常時応答 · ${agentLabel(agent.driverKind, agent.model)}`
            : `${project?.name ?? "project"} · ${agentMention(agent.driverKind, agent.model)} で応答`}
        </div>
      </div>
    );
  }

  return (
    <Thread
      chat={chat}
      messages={messages ?? []}
      hasOlder={hasOlder}
      loadingOlder={loadingOlder}
      onLoadOlder={() => void loadOlder()}
    />
  );
}
