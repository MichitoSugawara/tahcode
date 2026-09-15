import * as Popover from "@radix-ui/react-popover";
import { Check, Folder, Plus } from "lucide-react";
import { useState } from "react";

import GlideMenu from "@/components/primitives/GlideMenu";
import type { Project } from "@/harness/OrgContext";
import { newChatHeroName, NO_PROJECT_LABEL } from "@/lib/newChat";

import type { Id } from "../../convex/_generated/dataModel";

export function NewChatProjectSwitch({
  project,
  projects,
  onSelect,
  onCreateProject,
}: {
  project: Project | null;
  projects: readonly Project[];
  onSelect: (projectId: Id<"projects"> | null) => void;
  onCreateProject: () => void;
}) {
  const [open, setOpen] = useState(false);
  const selectedId = project?._id ?? null;

  return (
    <>
      <Popover.Root open={open} onOpenChange={setOpen}>
        <Popover.Trigger asChild>
          <button
            type="button"
            aria-label="プロジェクトを選択"
            aria-expanded={open}
            className="text-ink decoration-ink-3 hover:decoration-ink inline underline decoration-dotted decoration-2 underline-offset-[7px] transition-colors duration-150"
          >
            {newChatHeroName(project?.name ?? null)}
          </button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            align="center"
            sideOffset={8}
            className="bg-surface shadow-raised z-[80] w-72 rounded-[12px] p-1 outline-none"
            style={{
              animation: "pop-in 180ms cubic-bezier(0.23,1,0.32,1) both",
            }}
          >
            <GlideMenu
              className="flex max-h-72 flex-col gap-px overflow-y-auto"
              highlightClassName="inset-x-0 rounded-[6px] bg-hover"
            >
              <button
                type="button"
                data-menu-row
                onClick={() => {
                  setOpen(false);
                  onSelect(null);
                }}
                className="relative z-10 flex w-full items-center gap-2 rounded-[6px] px-2 py-1.5 text-left"
              >
                <span className="text-ink-3 flex size-5 shrink-0 items-center justify-center">
                  <Folder size={14} />
                </span>
                <span className="text-ink min-w-0 flex-1 text-[13px] font-medium">
                  {NO_PROJECT_LABEL}
                </span>
                <span
                  className={`text-ink shrink-0 ${selectedId === null ? "" : "invisible"}`}
                >
                  <Check size={13} strokeWidth={2.5} />
                </span>
              </button>
              {projects.map((item) => (
                <button
                  key={String(item._id)}
                  type="button"
                  data-menu-row
                  onClick={() => {
                    setOpen(false);
                    onSelect(item._id);
                  }}
                  className="relative z-10 flex w-full items-center gap-2 rounded-[6px] px-2 py-1.5 text-left"
                >
                  <span className="text-ink-3 flex size-5 shrink-0 items-center justify-center">
                    <Folder size={14} />
                  </span>
                  <span className="text-ink min-w-0 flex-1 truncate text-[13px] font-medium">
                    {item.name}
                  </span>
                  <span
                    className={`text-ink shrink-0 ${selectedId === item._id ? "" : "invisible"}`}
                  >
                    <Check size={13} strokeWidth={2.5} />
                  </span>
                </button>
              ))}
            </GlideMenu>
            <div className="border-line mt-1 border-t p-1">
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  onCreateProject();
                }}
                className="text-ink hover:bg-hover flex w-full items-center gap-2 rounded-[6px] px-2 py-1.5 text-left text-[13px] font-medium"
              >
                <Plus size={14} />
                新しいプロジェクト
              </button>
            </div>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
      {" で何を作りますか？"}
    </>
  );
}
