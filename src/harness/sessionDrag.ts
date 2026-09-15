export const CHAT_DRAG_MIME = "application/x-tahcode-chat";

let activeChatDragId: string | null = null;

export function beginChatDrag(chatId: string): void {
  activeChatDragId = chatId;
}

export function endChatDrag(): void {
  activeChatDragId = null;
}

export function peekChatDrag(): string | null {
  return activeChatDragId;
}

export interface ChatDragTransfer {
  effectAllowed: string;
  getData: (format: string) => string;
  setData: (format: string, data: string) => void;
  types: readonly string[];
}

export function writeChatDrag(
  dataTransfer: ChatDragTransfer,
  chatId: string
): void {
  dataTransfer.effectAllowed = "copy";
  dataTransfer.setData(CHAT_DRAG_MIME, chatId);
  dataTransfer.setData("text/plain", chatId);
}

export function isChatDrag(dataTransfer: ChatDragTransfer): boolean {
  if (peekChatDrag()) {
    return true;
  }
  return dataTransfer.types.includes(CHAT_DRAG_MIME);
}

export function readChatDrag(dataTransfer: ChatDragTransfer): string | null {
  const fromMime = dataTransfer.getData(CHAT_DRAG_MIME).trim();
  if (fromMime) {
    return fromMime;
  }
  const peeked = peekChatDrag();
  if (peeked) {
    return peeked;
  }
  /* Some engines hide custom MIME until drop, or fire dragend before drop.
   * text/plain is the Codex / VS Code-style fallback, but only when this
   * document started a chat drag (custom type still listed). */
  if (!dataTransfer.types.includes(CHAT_DRAG_MIME)) {
    return null;
  }
  return dataTransfer.getData("text/plain").trim() || null;
}
