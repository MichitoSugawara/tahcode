import { useQuery } from "convex/react";
import { Code2, FileSearch, Home, ListChecks, MessageSquare } from "lucide-react";
import { useEffect } from "react";
import { useParams } from "react-router-dom";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { Button } from "@/components/atoms/Button";
import LoadingState from "@/components/primitives/LoadingState";
import { Composer, useChatAgent, useSendMessage } from "@/harness/Composer";
import { EmptyHero, type Suggestion } from "@/harness/EmptyHero";
import { useOrg, type Chat } from "@/harness/OrgContext";
import { Thread, type ThreadMessage } from "@/harness/thread/Thread";
import { Notice } from "@/harness/ui/Notice";
import { displayName } from "@/lib/format";
import { agentLabel, agentMention } from "@/lib/providers";
import { useDocumentTitle } from "@/lib/title";

/* ─────────────────────────────────────────────────────────
 * CHAT — empty: the hero with chat-specific prompt ideas;
 * otherwise the reading column with the floating composer.
 * ───────────────────────────────────────────────────────── */
export default function ChatPage() {
  const { chatId } = useParams();
  const org = useOrg();
  const chat = useQuery(api.chats.get, chatId ? { chatId: chatId as Id<"chats"> } : "skip") as Chat | null | undefined;
  const messages = useQuery(api.messages.list, chatId ? { chatId: chatId as Id<"chats">, limit: 200 } : "skip") as ThreadMessage[] | undefined;
  const { send } = useSendMessage(chat ?? null);
  const { agent } = useChatAgent(chat ?? null);
  useDocumentTitle(chat ? (chat.kind === "dm" ? "Personal DM" : chat.title) : undefined, org.org.name);

  useEffect(() => {
    if (chat) org.openTab(chat._id);
  }, [chat, org]);

  if (chat === undefined || (chat && messages === undefined)) {
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
            <Button type="button" size="sm" variant="secondary" onClick={org.goHome}>
              <Home size={13} /> ホームへ戻る
            </Button>
          }
        >
          削除されたか、あなたに閲覧権限がありません。プライベートなプロジェクト / チャットは、追加されたメンバーと Owner / Admin にだけ表示されます。
        </Notice>
      </div>
    );
  }

  const project = chat.projectId ? org.projects?.find((item) => item._id === chat.projectId) : undefined;

  if ((messages ?? []).length === 0) {
    /* the chat's bound agent leads every suggestion, so the first message runs on it */
    const tag = chat.kind === "project" ? `${agentMention(agent.driverKind, agent.model)} ` : "";
    const ask = (text: string) => void send(text);
    const suggestions: Suggestion[] = [
      { key: "explain", icon: <FileSearch size={15} />, label: `${tag}このプロジェクトの構成を調べて要約して`, onClick: () => ask(`${tag}このプロジェクトの構成を調べて要約して`) },
      { key: "plan", icon: <ListChecks size={15} />, label: `${tag}次にやるべき作業を 3 つ提案して`, onClick: () => ask(`${tag}次にやるべき作業を 3 つ提案して`) },
      { key: "review", icon: <Code2 size={15} />, label: `${tag}直近の変更をレビューして気になる点を挙げて`, onClick: () => ask(`${tag}直近の変更をレビューして気になる点を挙げて`) },
    ];
    return (
      <div className="min-h-0 flex-1 overflow-y-auto">
        <EmptyHero
          replayKey={String(chat._id)}
          greeting={chat.kind === "dm" ? `こんにちは、${displayName(org.me)}` : project ? project.name : "プロジェクトチャット"}
          question={chat.kind === "dm" ? "何を手伝いましょう？" : `${chat.title} — 何から始めますか？`}
          composer={<Composer chat={chat} tall autoFocus />}
          suggestions={suggestions}
          link={{
            label:
              chat.kind === "dm"
                ? `DM では常時応答します（${agentLabel(agent.driverKind, agent.model)}）。メンションは不要です`
                : `このチャットは ${agentMention(agent.driverKind, agent.model)} が応答します。@cursor/muse-spark-1.3 のようにモデルまで指名できます`,
            onClick: () => undefined,
          }}
        />
        <div className="pointer-events-none fixed right-6 bottom-4 hidden items-center gap-1.5 text-[11.5px] text-ink-3 xl:flex">
          <MessageSquare size={11} /> {chat.kind === "dm" ? `Personal DM · 常時応答 · ${agentLabel(agent.driverKind, agent.model)}` : `${project?.name ?? "project"} · ${agentMention(agent.driverKind, agent.model)} で応答`}
        </div>
      </div>
    );
  }

  return <Thread chat={chat} messages={messages ?? []} />;
}
