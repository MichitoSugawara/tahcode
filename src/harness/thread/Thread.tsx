import { Cpu } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/atoms/Button";
import { Composer } from "@/harness/Composer";
import { isLive, useOrg, type Chat } from "@/harness/OrgContext";
import { Notice } from "@/harness/ui/Notice";
import { displayName } from "@/lib/format";
import { AgentReply } from "./AgentReply";
import { UserBubble } from "./UserBubble";

export type ThreadMessage = {
  _id: Id<"messages">;
  _creationTime: number;
  authorType: "user" | "agent" | "system";
  authorId?: Id<"users">;
  body: string;
  mentions: string[];
  status?: "streaming" | "done" | "error";
  driverKind?: string;
  jobId?: Id<"jobs">;
  runtimeId?: Id<"runtimes">;
  authorName?: string;
  authorHandle?: string;
};

/* ─────────────────────────────────────────────────────────
 * THREAD — the harness reading column. The composer floats
 * over the thread; the list pads its bottom by the composer's
 * height and stays pinned while replies grow (ResizeObserver
 * for streaming, MutationObserver for whole artifacts).
 * ───────────────────────────────────────────────────────── */
export function Thread({ chat, messages }: { chat: Chat; messages: ThreadMessage[] }) {
  const org = useOrg();
  const scrollRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLDivElement>(null);
  const [composerH, setComposerH] = useState(150);

  useEffect(() => {
    const el = composerRef.current;
    if (!el) return;
    const measure = () => setComposerH(el.offsetHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [chat._id]);

  useEffect(() => {
    const el = scrollRef.current;
    const content = el?.firstElementChild;
    if (!el || !content) return;
    let stick = true;
    let raf = 0;
    const onScroll = () => {
      stick = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    };
    const pin = () => {
      if (!stick) return;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        el.scrollTop = el.scrollHeight;
      });
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    const resize = new ResizeObserver(pin);
    resize.observe(content);
    const mutate = new MutationObserver(pin);
    mutate.observe(content, { childList: true, subtree: true, attributes: true, attributeFilter: ["style"] });
    pin();
    return () => {
      el.removeEventListener("scroll", onScroll);
      resize.disconnect();
      mutate.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [chat._id]);

  /* jump to the bottom when switching chats or when I send */
  const lastId = messages[messages.length - 1]?._id;
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [chat._id, lastId]);

  const usable = (org.runtimes ?? []).filter((runtime) => isLive(runtime, org.now) && runtime.canUse);
  const anyRuntime = (org.runtimes ?? []).length > 0;
  const promptFor = (jobMessage: ThreadMessage) => {
    const index = messages.findIndex((message) => message._id === jobMessage._id);
    for (let i = index - 1; i >= 0; i -= 1) {
      const candidate = messages[i];
      if (candidate?.authorType === "user") return candidate.body;
    }
    return undefined;
  };

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="flex flex-col gap-7 px-4 pt-8 sm:px-8 lg:px-12" style={{ paddingBottom: composerH + 16 }}>
          {messages.map((message, index) => {
            const previous = messages[index - 1];
            if (message.authorType === "user") {
              const mine = String(message.authorId) === String(org.me._id);
              const sameAuthor = previous?.authorType === "user" && String(previous.authorId) === String(message.authorId);
              return (
                <div key={String(message._id)} className={`mx-auto w-full max-w-[720px] ${sameAuthor ? "-mt-4" : ""}`}>
                  <UserBubble
                    text={message.body}
                    authorId={message.authorId ? String(message.authorId) : undefined}
                    authorName={displayName({ name: message.authorName, handle: message.authorHandle })}
                    time={message._creationTime}
                    mine={mine}
                    showAuthor={!sameAuthor && (chat.kind === "project" || !mine)}
                  />
                </div>
              );
            }
            return (
              <div key={String(message._id)} className="mx-auto w-full max-w-[720px]">
                <AgentReply message={message} prompt={promptFor(message)} />
              </div>
            );
          })}
        </div>
      </div>

      {/* soft fade so content dissolves into the bar instead of hard-clipping */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0" style={{ height: composerH + 32, background: "linear-gradient(to top, var(--page) 64%, transparent)" }} />

      <div ref={composerRef} className="absolute inset-x-0 bottom-0 px-4 pb-5 sm:px-8 lg:px-12">
        <div className="mx-auto flex max-w-[720px] flex-col gap-2">
          {anyRuntime && usable.length === 0 && (
            <Notice
              tone="locked"
              title="いま使えるランタイムがありません"
              className="py-2"
              action={
                <Button type="button" size="xs" variant="accent" onClick={() => org.openDialog({ kind: "registerRuntime" })}>
                  <Cpu size={12} /> このマシンを登録
                </Button>
              }
            >
              登録済みのマシンがオフラインか、あなたに利用許可がありません。送信はできますが、エージェントの返信はランタイムが使えるようになるまで届きません。Runtime タブで状態と許可を確認してください。
            </Notice>
          )}
          <Composer chat={chat} tall placeholder={chat.kind === "dm" ? "返信…" : "返信（@codex などで指名）…"} />
        </div>
      </div>
    </div>
  );
}
