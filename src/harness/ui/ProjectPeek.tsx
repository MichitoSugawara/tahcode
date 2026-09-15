import { Circle, Folder } from "lucide-react";

import { projectChatCountLabel } from "@/harness/sidebarHover";

export function ProjectPeekHeader({
  chatCount,
  name,
  path,
}: {
  chatCount: number;
  name: string;
  path?: string;
}) {
  return (
    <div data-project-peek className="px-2 pt-1 pb-0.5">
      <div className="flex items-center gap-1.5">
        <span className="text-ink-3 flex size-5 shrink-0 items-center justify-center">
          <Folder size={14} />
        </span>
        <span className="text-ink min-w-0 flex-1 truncate text-[13.5px] font-medium">
          {name}
        </span>
      </div>
      <div className="text-ink-3 mt-1 flex items-center gap-1.5 text-[12px]">
        <span className="flex size-5 shrink-0 items-center justify-center">
          <Circle size={8} />
        </span>
        {projectChatCountLabel(chatCount)}
      </div>
      {path && (
        <div className="text-ink-3 mt-1 flex items-center gap-1.5 text-[12px]">
          <span className="flex size-5 shrink-0 items-center justify-center">
            <Folder size={12} />
          </span>
          <span className="min-w-0 truncate font-mono">{path}</span>
        </div>
      )}
      <div className="bg-line my-1.5 h-px" />
    </div>
  );
}
