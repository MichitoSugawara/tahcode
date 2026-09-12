import { Cpu, Folder, MessageSquare, Sparkles, UserPlus } from "lucide-react";
import { useMemo, useState } from "react";
import { Composer, useSendMessage } from "@/harness/Composer";
import { EmptyHero, type Suggestion } from "@/harness/EmptyHero";
import { isLive, useOrg } from "@/harness/OrgContext";
import { displayName } from "@/lib/format";

const PROMPTS = [
  "この Org でエージェントに何ができるか、3 行で説明して",
  "いま接続しているランタイムと使える CLI を一覧にして",
  "新しいプロジェクトを始めるときの手順を提案して",
  "直近の会話を要約して、次にやることを 3 つ挙げて",
  "README の書き方をレビューして改善案を出して",
];

/* ─────────────────────────────────────────────────────────
 * HOME — the harness hero. Typing here starts a run in your
 * Personal DM; the suggestions are the next real step for
 * this org (project, runtime, invite) plus prompt ideas.
 * ───────────────────────────────────────────────────────── */
export default function HomePage() {
  const org = useOrg();
  const [offset, setOffset] = useState(0);
  const dm = org.chats?.find((chat) => chat.kind === "dm" && String(chat.ownerId) === String(org.me._id)) ?? null;
  const liveRuntimes = (org.runtimes ?? []).filter((runtime) => isLive(runtime, org.now));
  const { send } = useSendMessage(dm);
  const ask = (text: string) => {
    void send(text).then((result) => {
      if (result) org.goChat(result.chatId);
    });
  };

  const suggestions = useMemo<Suggestion[]>(() => {
    const steps: Suggestion[] = [];
    if ((org.projects ?? []).length === 0) {
      steps.push({ key: "project", icon: <Folder size={15} />, label: "最初のプロジェクトを作る", onClick: () => org.openDialog({ kind: "createProject" }) });
    }
    if ((org.runtimes ?? []).length === 0) {
      steps.push({ key: "runtime", icon: <Cpu size={15} />, label: "このマシンをランタイムとして登録する", onClick: () => org.openDialog({ kind: "registerRuntime" }) });
    } else if (liveRuntimes.length === 0) {
      steps.push({ key: "runtime-off", icon: <Cpu size={15} />, label: "ランタイムがオフラインです — 起動状況を確認", onClick: org.goSettings });
    }
    if (org.isAdmin && (org.members ?? []).length <= 1) {
      steps.push({ key: "invite", icon: <UserPlus size={15} />, label: "メンバーを招待する", onClick: () => org.openDialog({ kind: "invite" }) });
    }
    const prompts: Suggestion[] = [];
    for (let i = 0; i < 3 - Math.min(steps.length, 2); i += 1) {
      const text = PROMPTS[(offset + i) % PROMPTS.length]!;
      prompts.push({ key: `p${i}`, icon: <MessageSquare size={15} />, label: text, onClick: () => ask(text) });
    }
    return [...steps.slice(0, 2), ...prompts].slice(0, 4);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [org.projects, org.runtimes, org.members, org.isAdmin, liveRuntimes.length, offset, dm]);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <EmptyHero
        replayKey={String(org.org._id)}
        greeting={`こんにちは、${displayName(org.me)}`}
        question={`${org.org.name} で何をしますか？`}
        composer={
          <Composer
            chat={dm}
            tall
            autoFocus
            placeholder="Personal DM でエージェントに聞く…（常時応答）"
            onSent={(result) => org.goChat(result.chatId)}
          />
        }
        suggestions={suggestions}
        onShuffle={() => setOffset((current) => (current + 3) % PROMPTS.length)}
        link={{ label: (org.runtimes ?? []).length === 0 ? "ランタイムを接続してエージェントを動かす" : "Personal DM を開く", onClick: () => ((org.runtimes ?? []).length === 0 ? org.openDialog({ kind: "registerRuntime" }) : dm && org.goChat(dm._id)) }}
      />
      <div className="pointer-events-none fixed right-6 bottom-4 hidden items-center gap-1.5 text-[11.5px] text-ink-3 xl:flex">
        <Sparkles size={11} /> Beautiful UI harness · Dark Green+
      </div>
    </div>
  );
}
