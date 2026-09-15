export const NO_PROJECT_LABEL = "プロジェクトなし";
export const NEW_CHAT_TITLE = "新しいチャット";
export const NEW_CHAT_PLACEHOLDER = "変更を頼む、続きを送る、画像を添付";

const SEARCH_PREFIX = /^\?/;

export function readNewChatProjectParam(search: string): string | null {
  const raw = new URLSearchParams(search.replace(SEARCH_PREFIX, "")).get(
    "project"
  );
  return raw && raw.length > 0 ? raw : null;
}

/** Default is no project. Unknown or missing ids stay unselected. */
export function resolveNewChatProjectId(
  requested: string | null,
  projectIds: ReadonlySet<string>
): string | null {
  if (!requested || !projectIds.has(requested)) {
    return null;
  }
  return requested;
}

export function newChatHeroName(projectName: string | null): string {
  return projectName ?? NO_PROJECT_LABEL;
}

export function titleFromFirstMessage(text: string): string {
  const line = text.trim().split(/\r?\n/, 1)[0]?.trim() ?? "";
  return line.slice(0, 80) || NEW_CHAT_TITLE;
}

/** No project → a fresh thread. A selected project → that project's chat. Never the singleton DM. */
export function resolveNewChatSendKind(
  projectId: string | null
): "thread" | "project" {
  return projectId ? "project" : "thread";
}
