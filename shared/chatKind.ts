export type ChatKind = "dm" | "project" | "thread";

/** Personal DM and no-project New chat sessions: owner-only, no project ACL. */
export function isOwnerScopedChat(kind: ChatKind): boolean {
  return kind === "dm" || kind === "thread";
}

/** DMs and no-project threads always run the bound agent (no @mention required). */
export function chatAlwaysDispatchesAgent(kind: ChatKind): boolean {
  return isOwnerScopedChat(kind);
}

export function chatDisplayTitle(chat: {
  kind: ChatKind;
  title: string;
}): string {
  return chat.kind === "dm" ? "Personal DM" : chat.title;
}
