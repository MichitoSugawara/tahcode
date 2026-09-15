import { useMemo, useState } from "react";
import { useParams } from "react-router-dom";

import { Button } from "@/components/atoms/Button";
import { Input } from "@/harness/ui/Field";
import { Notice } from "@/harness/ui/Notice";
import { useStoredState } from "@/lib/storage";

import { WORKBENCH_PANELS } from "./panels";

const SIDE_CHAT_MAX = 40;

export type SideChatMessage = {
  id: string;
  role: "assistant" | "user";
  text: string;
};

const SEED: SideChatMessage = {
  id: "seed",
  role: "assistant",
  text: "本線チャットとは別の副スレッドです。いまはブラウザ内の下書きだけで、メンション規則には乗りません。",
};

const LOCAL_ACK =
  "（ローカル）バックエンド未接続。このメモはこのブラウザにだけ残ります。";

export function sideChatStorageKey(chatId: string | undefined): string {
  return `th:workbench:sidechat:${chatId ?? "home"}`;
}

export function parseSideChatMessages(raw: unknown): SideChatMessage[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const messages: SideChatMessage[] = [];
  for (const item of raw) {
    if (typeof item !== "object" || item === null) {
      continue;
    }
    const record = item as Record<string, unknown>;
    if (typeof record.id !== "string" || record.id.length === 0) {
      continue;
    }
    if (typeof record.text !== "string" || record.text.length === 0) {
      continue;
    }
    if (record.role !== "assistant" && record.role !== "user") {
      continue;
    }
    messages.push({
      id: record.id,
      role: record.role,
      text: record.text,
    });
    if (messages.length >= SIDE_CHAT_MAX) {
      break;
    }
  }
  return messages;
}

export function appendSideChatTurn(
  current: SideChatMessage[],
  text: string,
  now = Date.now()
): SideChatMessage[] {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return current;
  }
  const base = current.length > 0 ? current : [SEED];
  const next: SideChatMessage[] = [
    ...base,
    { id: `u-${now}`, role: "user", text: trimmed },
    { id: `a-${now}`, role: "assistant", text: LOCAL_ACK },
  ];
  return next.length > SIDE_CHAT_MAX ? next.slice(-SIDE_CHAT_MAX) : next;
}

export function SideChatPane() {
  const { chatId } = useParams();
  const key = sideChatStorageKey(chatId);
  const [raw, setRaw] = useStoredState<unknown>(key, []);
  const messages = useMemo(() => parseSideChatMessages(raw), [raw]);
  const [draft, setDraft] = useState("");
  const shown = messages.length > 0 ? messages : [SEED];
  const meta = WORKBENCH_PANELS.chat;

  const send = () => {
    const next = appendSideChatTurn(messages, draft);
    if (next === messages) {
      return;
    }
    setRaw(next);
    setDraft("");
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-line shrink-0 border-b px-3 py-2.5">
        <Notice tone="info" title="ローカル下書き">
          {meta.next} 本線の会話履歴とは混ざりません。
        </Notice>
      </div>
      <ol className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-3 py-3">
        {shown.map((message) => (
          <li
            key={message.id}
            data-side-chat-role={message.role}
            className={`rounded-card max-w-[92%] px-2.5 py-2 text-[12.5px] leading-relaxed ${
              message.role === "user"
                ? "bg-hover-2 text-ink ml-auto"
                : "bg-inset text-ink-2"
            }`}
          >
            {message.text}
          </li>
        ))}
      </ol>
      <form
        className="border-line flex shrink-0 items-center gap-2 border-t px-3 py-2.5"
        onSubmit={(event) => {
          event.preventDefault();
          send();
        }}
      >
        <label className="sr-only" htmlFor="workbench-side-chat">
          サイドチャットの下書き
        </label>
        <Input
          id="workbench-side-chat"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="メモを残す（このブラウザのみ）"
          autoComplete="off"
        />
        <Button
          type="submit"
          size="xs"
          variant="accent"
          disabled={!draft.trim()}
        >
          送る
        </Button>
      </form>
    </div>
  );
}
