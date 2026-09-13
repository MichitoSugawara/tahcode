import { useConvex, useQuery } from "convex/react";
import { useEffect, useRef, useState } from "react";

import type { ThreadMessage } from "@/harness/thread/Thread";

import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

const PAGE_SIZE = 80;

export function useChatMessages(chatId: Id<"chats"> | null, enabled: boolean) {
  const convex = useConvex();
  const latestPage = useQuery(
    api.messages.list,
    enabled && chatId ? { chatId, limit: PAGE_SIZE } : "skip"
  );
  const [older, setOlder] = useState<ThreadMessage[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [olderDone, setOlderDone] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const loadingOlderRef = useRef(false);

  useEffect(() => {
    setOlder([]);
    setCursor(null);
    setOlderDone(false);
  }, [chatId]);

  const latest = latestPage?.messages ?? [];
  const latestIds = new Set(latest.map((message) => String(message._id)));
  const messages = [
    ...older.filter((message) => !latestIds.has(String(message._id))),
    ...latest,
  ];

  const loadOlder = async () => {
    if (!chatId || !latestPage || loadingOlderRef.current) {
      return;
    }
    loadingOlderRef.current = true;
    setLoadingOlder(true);
    try {
      const page = await convex.query(api.messages.list, {
        chatId,
        cursor: cursor ?? latestPage.continueCursor,
        limit: PAGE_SIZE,
      });
      setOlder((current) => [...page.messages, ...current]);
      setCursor(page.continueCursor);
      setOlderDone(page.isDone);
    } finally {
      loadingOlderRef.current = false;
      setLoadingOlder(false);
    }
  };

  if (!enabled) {
    return {
      hasOlder: false,
      loadOlder,
      loadingOlder: false,
      messages: [] as ThreadMessage[],
    };
  }

  if (latestPage === undefined) {
    return {
      hasOlder: false,
      loadOlder,
      loadingOlder: false,
      messages: undefined,
    };
  }

  return {
    hasOlder: !latestPage.isDone && !olderDone && latest.length > 0,
    loadOlder,
    loadingOlder,
    messages,
  };
}
