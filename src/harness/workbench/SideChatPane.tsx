import { useMutation, useQuery } from "convex/react";
import { MessageSquare } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";

import { Button } from "@/components/atoms/Button";
import { Input } from "@/harness/ui/Field";
import { Notice } from "@/harness/ui/Notice";
import { isPlaceholderId } from "@/lib/optimistic";

import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { WORKBENCH_PANELS } from "./panels";
import {
  clearLocalSideChat,
  peekLocalSideChatUserTexts,
} from "./sideChatLocal";
import { WorkbenchEmpty } from "./WorkbenchEmpty";

function authorLabel(turn: {
  authorHandle?: string;
  authorName?: string;
}): string {
  return turn.authorHandle ?? turn.authorName ?? "メンバー";
}

export function SideChatPane() {
  const { chatId } = useParams();
  const serverChatId =
    chatId && !isPlaceholderId(chatId) ? (chatId as Id<"chats">) : null;
  const page = useQuery(
    api.workbenchSideChat.list,
    serverChatId ? { chatId: serverChatId } : "skip"
  );
  const sendTurn = useMutation(api.workbenchSideChat.send);
  const migrateLocalDrafts = useMutation(
    api.workbenchSideChat.migrateLocalDrafts
  );
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const migratedForChat = useRef<string | null>(null);
  const meta = WORKBENCH_PANELS.chat;

  useEffect(() => {
    if (!serverChatId || page === undefined || page === null) {
      return;
    }
    if (migratedForChat.current === serverChatId) {
      return;
    }
    const texts = peekLocalSideChatUserTexts(serverChatId);
    migratedForChat.current = serverChatId;
    if (texts.length === 0) {
      return;
    }
    void migrateLocalDrafts({
      bodies: texts,
      chatId: serverChatId,
    }).then(() => {
      clearLocalSideChat(serverChatId);
    });
  }, [migrateLocalDrafts, page, serverChatId]);

  if (!serverChatId) {
    return (
      <WorkbenchEmpty
        badge="本線と分離"
        icon={<MessageSquare size={22} />}
        title="チャットを開いてください"
      >
        副スレッドは本線チャットごとに Convex
        に残ります。本線の会話履歴とは混ざりません。@メンションでもジョブは始まりません。
      </WorkbenchEmpty>
    );
  }

  if (page === undefined) {
    return (
      <WorkbenchEmpty
        badge="本線と分離"
        icon={<MessageSquare size={22} />}
        title="読み込み中"
      >
        副スレッドを Convex から取得しています。
      </WorkbenchEmpty>
    );
  }

  if (page === null) {
    return (
      <WorkbenchEmpty
        badge="本線と分離"
        icon={<MessageSquare size={22} />}
        title="このチャットは表示できません"
      >
        副スレッドは本線チャットと同じ公開範囲です。
      </WorkbenchEmpty>
    );
  }

  const send = () => {
    const text = draft.trim();
    if (text.length === 0 || sending) {
      return;
    }
    setSending(true);
    void sendTurn({ body: text, chatId: serverChatId })
      .then(() => {
        setDraft("");
      })
      .finally(() => {
        setSending(false);
      });
  };

  return (
    <div data-side-chat className="flex min-h-0 flex-1 flex-col">
      <div className="border-line shrink-0 border-b px-3 py-2.5">
        <Notice tone="info" title="本線と分離">
          {meta.next}
        </Notice>
      </div>
      <ol
        data-side-chat-state={page.turns.length === 0 ? "empty" : "ready"}
        className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-3 py-3"
      >
        {page.turns.length === 0 ? (
          <li className="text-ink-3 px-0.5 py-6 text-center text-[12.5px] leading-relaxed">
            まだメモはありません。検証中の短いメモを残せます。
          </li>
        ) : (
          page.turns.map((turn) => (
            <li
              key={turn._id}
              data-side-chat-role="user"
              className="bg-hover-2 text-ink rounded-card ml-auto max-w-[92%] px-2.5 py-2 text-[12.5px] leading-relaxed"
            >
              <div className="text-ink-3 mb-1 text-[10.5px]">
                {authorLabel(turn)}
              </div>
              {turn.body}
            </li>
          ))
        )}
      </ol>
      <form
        className="border-line flex shrink-0 items-center gap-2 border-t px-3 py-2.5"
        onSubmit={(event) => {
          event.preventDefault();
          send();
        }}
      >
        <label className="sr-only" htmlFor="workbench-side-chat">
          サイドチャットのメモ
        </label>
        <Input
          id="workbench-side-chat"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="メモを残す（ジョブは始まらない）"
          autoComplete="off"
        />
        <Button
          type="submit"
          size="xs"
          variant="accent"
          disabled={!draft.trim() || sending}
        >
          送る
        </Button>
      </form>
    </div>
  );
}
