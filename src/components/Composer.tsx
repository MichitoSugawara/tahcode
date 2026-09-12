import { useMemo, useRef, useState } from "react";
import { AGENT_HANDLES, activeMentionQuery, hasAgentMention } from "../lib/mentions.ts";

type Props = {
  chatKind: "dm" | "project" | undefined;
  disabled?: boolean;
  sending?: boolean;
  provider: string;
  onProviderChange: (provider: string) => void;
  onSend: (body: string) => void;
  onUpload: (file: File) => void;
  uploading?: boolean;
};

const PROVIDER_OPTIONS = [
  { value: "codex", label: "Codex" },
  { value: "claudeAgent", label: "Claude" },
  { value: "cursor", label: "Cursor" },
  { value: "grok", label: "Grok" },
  { value: "opencode", label: "OpenCode" },
  { value: "antigravity", label: "Antigravity" },
];

const HANDLE_BY_PROVIDER: Record<string, string> = {
  codex: "codex",
  claudeAgent: "claude",
  cursor: "cursor",
  grok: "grok",
  opencode: "opencode",
  antigravity: "antigravity",
};

export default function Composer({
  chatKind,
  disabled,
  sending,
  provider,
  onProviderChange,
  onSend,
  onUpload,
  uploading,
}: Props) {
  const [value, setValue] = useState("");
  const [cursor, setCursor] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

  const mentionQuery = useMemo(
    () => activeMentionQuery(value, cursor),
    [value, cursor],
  );
  const suggestions = useMemo(() => {
    if (mentionQuery === null) return [];
    const query = mentionQuery.toLowerCase();
    return AGENT_HANDLES.filter((item) => item.handle.startsWith(query)).slice(0, 7);
  }, [mentionQuery]);

  const needsMention = chatKind === "project" && !hasAgentMention(value);

  const submit = () => {
    const trimmed = value.trim();
    if (!trimmed || disabled || sending) return;
    let body = trimmed;
    if (chatKind === "project" && !hasAgentMention(body)) {
      const handle = HANDLE_BY_PROVIDER[provider] ?? "codex";
      body = `@${handle} ${body}`;
    }
    onSend(body);
    setValue("");
  };

  const applySuggestion = (handle: string) => {
    const before = value.slice(0, cursor);
    const after = value.slice(cursor);
    const replaced = before.replace(/@([a-zA-Z0-9_./-]*)$/, `@${handle} `);
    const next = `${replaced}${after}`;
    setValue(next);
    setCursor(replaced.length);
  };

  return (
    <div className="relative">
      {suggestions.length > 0 && (
        <div className="bui-surface absolute inset-x-0 bottom-full z-10 mb-2 overflow-hidden rounded-xl">
          {suggestions.map((item) => (
            <button
              key={item.handle}
              onClick={() => applySuggestion(item.handle)}
              className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-violet-50 dark:hover:bg-stone-800"
            >
              <span className="font-mono">@{item.handle}</span>
              <span className="text-xs text-stone-500">{item.label}</span>
            </button>
          ))}
        </div>
      )}
      <div className="bui-composer bui-surface rounded-2xl p-2">
        <textarea
          value={value}
          disabled={disabled}
          rows={3}
          placeholder={
            chatKind === "dm"
              ? "DM は常時応答します…"
              : "プロジェクトでは @agent / @codex などでメンション…"
          }
          onChange={(event) => {
            setValue(event.target.value);
            setCursor(event.target.selectionStart ?? event.target.value.length);
          }}
          onSelect={(event) =>
            setCursor(event.currentTarget.selectionStart ?? value.length)
          }
          onKeyDown={(event) => {
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
              event.preventDefault();
              submit();
            }
          }}
          className="w-full resize-none bg-transparent px-2 py-1 text-sm leading-6 outline-none placeholder:text-stone-400"
        />
        <div className="flex items-center gap-2 px-1 pb-1">
          <select
            value={provider}
            onChange={(event) => onProviderChange(event.target.value)}
            className="rounded-lg border border-stone-200 bg-transparent px-2 py-1 text-xs outline-none"
            title="既定プロバイダ"
          >
            {PROVIDER_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <button
            onClick={() => fileRef.current?.click()}
            disabled={disabled || uploading}
            className="rounded-lg border border-stone-200 px-2 py-1 text-xs text-stone-500 hover:bg-stone-50 disabled:opacity-50"
            title="ファイルを添付（Cloudflare R2）"
          >
            {uploading ? "送信中…" : "添付"}
          </button>
          <input
            ref={fileRef}
            type="file"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) onUpload(file);
              event.target.value = "";
            }}
          />
          {needsMention && (
            <span className="hidden text-[11px] text-amber-600 sm:inline">
              送信時に @{HANDLE_BY_PROVIDER[provider] ?? "codex"} を自動付与
            </span>
          )}
          <span className="flex-1" />
          <span className="hidden text-[11px] text-stone-400 md:inline">⌘/Ctrl+Enter で送信</span>
          <button
            onClick={submit}
            disabled={disabled || sending || value.trim().length === 0}
            className="bui-send flex size-9 items-center justify-center rounded-full text-lg font-bold"
            aria-label="送信"
          >
            ↑
          </button>
        </div>
      </div>
    </div>
  );
}
