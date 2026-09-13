import { Paperclip } from "lucide-react";
import type { ReactNode } from "react";

import { Monogram } from "@/components/atoms/EntityChip";
import { MentionText } from "@/components/atoms/MentionText";
import { FileLink } from "@/harness/thread/FileLink";
import { clockTime, colorFor, monogram } from "@/lib/format";

/* the harness user bubble: right-aligned, soft field, hairline ring;
 * in shared chats the author sits above it so a room reads as a room */

const LINK = /📎?\s*\[([^\]]+)\]\(((?:https?:\/\/|\/api\/files\/)[^)\s]+)\)/g;

function renderInline(text: string): ReactNode[] {
  const parts: ReactNode[] = [];
  let last = 0;
  let key = 0;
  for (const match of text.matchAll(LINK)) {
    const index = match.index ?? 0;
    if (index > last) {
      parts.push(
        <MentionText key={`m${key++}`} text={text.slice(last, index)} />
      );
    }
    parts.push(
      <FileLink
        key={`l${key++}`}
        href={match[2]}
        className="rounded-chip bg-surface text-ink shadow-btn hover:bg-hover mx-0.5 inline-flex h-5.5 translate-y-[-1px] items-center gap-1 px-1.5 align-middle font-mono text-[11.5px] transition-colors duration-100"
      >
        <Paperclip size={11} className="text-ink-3" />
        <span className="max-w-48 truncate">{match[1]}</span>
      </FileLink>
    );
    last = index + match[0].length;
  }
  if (last < text.length) {
    parts.push(<MentionText key={`m${key++}`} text={text.slice(last)} />);
  }
  return parts;
}

export function UserBubble({
  text,
  authorId,
  authorName,
  time,
  mine,
  showAuthor,
}: {
  text: string;
  authorId?: string;
  authorName: string;
  time: number;
  mine: boolean;
  showAuthor: boolean;
}) {
  return (
    <div
      className={`flex ${mine ? "justify-end pl-10 sm:pl-24" : "justify-start pr-10 sm:pr-24"}`}
      style={{ animation: "fade-up 300ms cubic-bezier(0.23,1,0.32,1) both" }}
    >
      <div className="flex max-w-full flex-col gap-1">
        {showAuthor && (
          <div
            className={`text-ink-3 flex items-center gap-1.5 px-0.5 text-[11.5px] ${mine ? "justify-end" : ""}`}
          >
            {!mine && (
              <Monogram color={colorFor(authorId ?? authorName)}>
                {monogram(authorName)}
              </Monogram>
            )}
            <span className="text-ink-2 font-medium">
              {mine ? "あなた" : authorName}
            </span>
            <span>{clockTime(time)}</span>
          </div>
        )}
        <div
          className={`text-ink shadow-hairline rounded-xl px-3.5 py-2 text-[13px] leading-relaxed whitespace-pre-wrap ${mine ? "bg-field" : "bg-surface"}`}
        >
          {renderInline(text)}
        </div>
      </div>
    </div>
  );
}
