import { Cpu } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/atoms/Button";
import { Composer, useChatAgent, useSendMessage } from "@/harness/Composer";
import { isLive, useOrg } from "@/harness/OrgContext";
import type { Chat } from "@/harness/OrgContext";
import { Notice } from "@/harness/ui/Notice";
import { displayName } from "@/lib/format";
import { agentMention, isProviderKind } from "@/lib/providers";

import type { Id } from "../../../convex/_generated/dataModel";
import { AgentReply } from "./AgentReply";
import { FollowUps } from "./FollowUps";
import { UserBubble } from "./UserBubble";

export interface ThreadMessage {
  _id: Id<"messages">;
  _creationTime: number;
  authorType: "user" | "agent" | "system";
  authorId?: Id<"users">;
  body: string;
  mentions: string[];
  status?: "streaming" | "done" | "error" | "cancelled";
  driverKind?: string;
  model?: string;
  jobId?: Id<"jobs">;
  runtimeId?: Id<"runtimes">;
  authorName?: string;
  authorHandle?: string;
}

/* ─────────────────────────────────────────────────────────
 * THREAD — the harness reading column. The composer floats
 * over the thread; the list pads its bottom by the composer's
 * height and stays pinned while replies grow (ResizeObserver
 * for streaming, MutationObserver for whole artifacts).
 * ───────────────────────────────────────────────────────── */
export function Thread({
  chat,
  hasOlder = false,
  loadingOlder = false,
  messages,
  onLoadOlder,
}: {
  chat: Chat;
  hasOlder?: boolean;
  loadingOlder?: boolean;
  messages: ThreadMessage[];
  onLoadOlder?: () => void;
}) {
  const org = useOrg();
  const { send } = useSendMessage(chat);
  const { agent } = useChatAgent(chat);
  const scrollRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLDivElement>(null);
  const [composerH, setComposerH] = useState(150);

  useEffect(() => {
    const el = composerRef.current;
    if (!el) {
      return;
    }
    const measure = () => setComposerH(el.offsetHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [chat._id]);

  useEffect(() => {
    const el = scrollRef.current;
    const content = el?.firstElementChild;
    if (!el || !content) {
      return;
    }
    let stick = true;
    let raf = 0;
    const onScroll = () => {
      stick = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    };
    const pin = () => {
      if (!stick) {
        return;
      }
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        el.scrollTop = el.scrollHeight;
      });
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    const resize = new ResizeObserver(pin);
    resize.observe(content);
    const mutate = new MutationObserver(pin);
    mutate.observe(content, {
      attributeFilter: ["style"],
      attributes: true,
      childList: true,
      subtree: true,
    });
    pin();
    return () => {
      el.removeEventListener("scroll", onScroll);
      resize.disconnect();
      mutate.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [chat._id]);

  /* jump to the bottom when switching chats or when I send */
  const lastId = messages.at(-1)?._id;
  useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    }
  }, [chat._id, lastId]);

  const usable = (org.runtimes ?? []).filter(
    (runtime) => isLive(runtime, org.now) && runtime.canUse
  );
  const anyRuntime = (org.runtimes ?? []).length > 0;
  const last = messages.at(-1);
  const settledReply =
    last &&
    last.authorType === "agent" &&
    last.status === "done" &&
    !!last.jobId;
  /* follow-ups keep talking to whoever just answered (provider + model), else the chat's agent */
  const lastAgent =
    last?.driverKind && isProviderKind(last.driverKind)
      ? { driverKind: last.driverKind, model: last.model ?? null }
      : agent;
  const tag =
    chat.kind === "project"
      ? `${agentMention(lastAgent.driverKind, lastAgent.model)} `
      : "";
  const followUps = settledReply
    ? [
        `${tag}この結果をもとに実装まで進めて`,
        `${tag}変更点と次の一手を 3 行で要約して`,
      ]
    : [];
  const promptFor = (jobMessage: ThreadMessage) => {
    const index = messages.findIndex(
      (message) => message._id === jobMessage._id
    );
    for (let i = index - 1; i >= 0; i -= 1) {
      const candidate = messages[i];
      if (candidate?.authorType === "user") {
        return candidate.body;
      }
    }
    return "";
  };

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
      >
        <div
          className="flex flex-col gap-7 px-4 pt-8 sm:px-8 lg:px-12"
          style={{ paddingBottom: composerH + 16 }}
        >
          {hasOlder && onLoadOlder && (
            <div className="mx-auto w-full max-w-[720px]">
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={loadingOlder}
                onClick={onLoadOlder}
              >
                {loadingOlder
                  ? "以前のメッセージを読み込み中…"
                  : "以前のメッセージを読み込む"}
              </Button>
            </div>
          )}
          {messages.map((message, index) => {
            const previous = messages[index - 1];
            if (message.authorType === "user") {
              const mine = String(message.authorId) === String(org.me._id);
              const sameAuthor =
                previous?.authorType === "user" &&
                String(previous.authorId) === String(message.authorId);
              return (
                <div
                  key={String(message._id)}
                  className={`mx-auto w-full max-w-[720px] ${sameAuthor ? "-mt-4" : ""}`}
                >
                  <UserBubble
                    text={message.body}
                    authorId={
                      message.authorId ? String(message.authorId) : undefined
                    }
                    authorName={displayName({
                      handle: message.authorHandle,
                      name: message.authorName,
                    })}
                    time={message._creationTime}
                    mine={mine}
                    showAuthor={
                      !sameAuthor && (chat.kind === "project" || !mine)
                    }
                  />
                </div>
              );
            }
            const isLast = index === messages.length - 1;
            return (
              <div
                key={String(message._id)}
                className="mx-auto w-full max-w-[720px]"
              >
                <AgentReply
                  message={message}
                  prompt={promptFor(message)}
                  onRetry={(text) => void send(text)}
                />
                {isLast && settledReply && (
                  <FollowUps
                    prompts={followUps}
                    onPick={(text) => void send(text)}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* soft fade so content dissolves into the bar instead of hard-clipping */}
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0"
        style={{
          background: "linear-gradient(to top, var(--page) 64%, transparent)",
          height: composerH + 32,
        }}
      />

      <div
        ref={composerRef}
        className="absolute inset-x-0 bottom-0 px-4 pb-5 sm:px-8 lg:px-12"
      >
        <div className="mx-auto flex max-w-[720px] flex-col gap-2">
          {anyRuntime && usable.length === 0 && (
            <Notice
              tone="locked"
              title="いま使えるランタイムがありません"
              className="py-2"
              action={
                <Button
                  type="button"
                  size="xs"
                  variant="accent"
                  onClick={() => org.openDialog({ kind: "registerRuntime" })}
                >
                  <Cpu size={12} /> このマシンを登録
                </Button>
              }
            >
              登録済みのマシンがオフラインか、あなたに利用許可がありません。送信はできます。オンラインのランタイムがなければ、エージェントはセットアップ手順を返信します。Runtime
              タブで状態と許可を確認してください。
            </Notice>
          )}
          <Composer
            chat={chat}
            tall
            placeholder={
              chat.kind === "dm"
                ? "返信…"
                : `返信（${agentMention(agent.driverKind, agent.model)} などで指名）…`
            }
          />
        </div>
      </div>
    </div>
  );
}
