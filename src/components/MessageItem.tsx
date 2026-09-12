import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export type Message = {
  _id: string;
  _creationTime: number;
  authorType: "user" | "agent" | "system";
  body: string;
  mentions: string[];
  status?: "streaming" | "done" | "error";
  driverKind?: string;
  authorName?: string;
  authorHandle?: string;
};

function providerLabel(driverKind?: string): string | null {
  switch (driverKind) {
    case "codex":
      return "Codex";
    case "claudeAgent":
      return "Claude";
    case "cursor":
      return "Cursor";
    case "grok":
      return "Grok";
    case "opencode":
      return "OpenCode";
    case "antigravity":
      return "Antigravity";
    default:
      return null;
  }
}

function splitThinking(body: string): { thinking: string[]; text: string } {
  const lines = body.split("\n");
  const thinking: string[] = [];
  const rest: string[] = [];
  for (const line of lines) {
    if (/^(Running|Heartbeat|tool:|thinking:)/i.test(line.trim()) && rest.join("").length < 200) {
      thinking.push(line);
    } else {
      rest.push(line);
    }
  }
  return { thinking, text: rest.join("\n") };
}

export default function MessageItem({ message }: { message: Message }) {
  const [open, setOpen] = useState(false);
  if (message.authorType === "user") {
    return (
      <div className="bui-fade-up flex justify-end">
        <div className="max-w-[80%] rounded-2xl rounded-br-md bg-violet-600 px-4 py-2.5 text-sm leading-6 text-white">
          <div className="mb-1 text-[11px] font-medium opacity-80">
            {message.authorName ?? message.authorHandle ?? "you"}
          </div>
          <div className="whitespace-pre-wrap">{message.body}</div>
        </div>
      </div>
    );
  }

  const provider = providerLabel(message.driverKind);
  const { thinking, text } = splitThinking(message.body);
  const toolLines = message.body
    .split("\n")
    .filter((line) => /tool\(|exec|edit|write|read/i.test(line.slice(0, 120)))
    .slice(0, 4);

  return (
    <div className="bui-fade-up flex justify-start">
      <div className="bui-surface max-w-[88%] rounded-2xl rounded-bl-md px-4 py-3">
        <div className="mb-1 flex items-center gap-2 text-[11px] text-stone-500">
          <span className="inline-flex items-center gap-1.5 font-medium text-stone-700 dark:text-stone-200">
            <span className="inline-block size-4 rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500" />
            {provider ? `${provider} agent` : "agent"}
          </span>
          {message.status === "streaming" && (
            <span className="bui-streaming-dot inline-block size-1.5 rounded-full bg-violet-600" />
          )}
          {message.status === "error" && (
            <span className="rounded-full bg-red-100 px-2 py-0.5 font-medium text-red-700">
              error
            </span>
          )}
        </div>
        {toolLines.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {toolLines.map((line, index) => (
              <span
                key={index}
                className="rounded-full border border-stone-200 px-2 py-0.5 font-mono text-[11px] text-stone-500"
              >
                {line.slice(0, 48)}
              </span>
            ))}
          </div>
        )}
        {thinking.length > 0 && (
          <button
            onClick={() => setOpen(!open)}
            className="mb-1 text-xs text-stone-500 underline underline-offset-4"
          >
            {open ? "思考トレースを閉じる" : `思考トレースを開く (${thinking.length})`}
          </button>
        )}
        {open && thinking.length > 0 && (
          <pre className="mb-2 max-h-40 overflow-auto rounded-lg bg-stone-100 p-2 font-mono text-[11px] leading-5 text-stone-600 dark:bg-stone-900 dark:text-stone-300">
            {thinking.join("\n")}
          </pre>
        )}
        <div className="prose prose-sm max-w-none break-words dark:prose-invert">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {text || (message.status === "streaming" ? "考え中…" : "")}
          </ReactMarkdown>
        </div>
      </div>
    </div>
  );
}
