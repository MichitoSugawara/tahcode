import { Folder } from "lucide-react";

import { checkoutPathLabel } from "@/lib/newChat";

/** Display-only strip. Folder picking is TAH-67; no fake branch control. */
export function NewChatCheckoutBar({
  cwd,
  hasProject,
}: {
  cwd?: string;
  hasProject: boolean;
}) {
  return (
    <div className="text-ink-3 mt-2 flex items-center justify-between gap-3 px-1 py-1 text-[12px]">
      <span className="inline-flex min-w-0 items-center gap-1.5">
        <Folder size={13} strokeWidth={2.1} />
        <span>作業ディレクトリ</span>
      </span>
      <span className="min-w-0 truncate font-mono text-[11.5px]">
        {checkoutPathLabel(cwd, hasProject)}
      </span>
    </div>
  );
}
