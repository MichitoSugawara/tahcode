import { readJson } from "@/lib/storage";

export const SIDE_CHAT_STORAGE_PREFIX = "th:workbench:sidechat:";
export const SIDE_CHAT_SEED_ID = "seed";

export function sideChatStorageKey(chatId: string | undefined): string {
  return `${SIDE_CHAT_STORAGE_PREFIX}${chatId ?? "home"}`;
}

export function extractLocalSideChatUserTexts(raw: unknown): string[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const texts: string[] = [];
  for (const item of raw) {
    if (typeof item !== "object" || item === null) {
      continue;
    }
    const record = item as Record<string, unknown>;
    if (record.id === SIDE_CHAT_SEED_ID) {
      continue;
    }
    if (record.role !== "user") {
      continue;
    }
    if (typeof record.text !== "string") {
      continue;
    }
    const text = record.text.trim();
    if (text.length === 0) {
      continue;
    }
    texts.push(text);
  }
  return texts;
}

export function peekLocalSideChatUserTexts(chatId: string): string[] {
  return extractLocalSideChatUserTexts(
    readJson<unknown>(sideChatStorageKey(chatId), [])
  );
}

export function clearLocalSideChat(chatId: string): void {
  try {
    localStorage.removeItem(sideChatStorageKey(chatId));
  } catch {
    /* private mode */
  }
}
