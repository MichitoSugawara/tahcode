import { memo, type ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import CodeBlock from "@/components/primitives/CodeBlock";

function textOf(children: ReactNode): string {
  if (typeof children === "string") return children;
  if (Array.isArray(children)) return children.map(textOf).join("");
  if (children && typeof children === "object" && "props" in children) {
    return textOf((children as { props: { children?: ReactNode } }).props.children);
  }
  return "";
}

const components: Components = {
  pre: ({ children }) => <>{children}</>,
  code: ({ className, children }) => {
    const raw = textOf(children);
    const lang = /language-([\w-]+)/.exec(className ?? "")?.[1];
    const block = !!lang || raw.includes("\n");
    if (!block) {
      return <code className="rounded-[4px] bg-inset px-1 py-0.5 font-mono text-[12px] text-ink-2 shadow-hairline">{children}</code>;
    }
    const lines = raw.replace(/\n$/, "").split("\n");
    return (
      <div className="my-2">
        <CodeBlock fill variant="Code" filename={lang ?? "text"} lines={lines} code={lines.join("\n")} labels={{ copy: "コピー", copied: "コピーしました" }} />
      </div>
    );
  },
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noreferrer">
      {children}
    </a>
  ),
};

/** Agent reply body: GFM markdown, fenced code as Beautiful UI CodeBlock. */
export const Markdown = memo(function Markdown({ children }: { children: string }) {
  return (
    <div className="md">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {children}
      </ReactMarkdown>
    </div>
  );
});
