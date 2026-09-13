import * as DialogPrimitive from "@radix-ui/react-dialog";
import {
  Cpu,
  Folder,
  Home,
  Lock,
  MessageSquare,
  MessageSquarePlus,
  Settings,
  ShieldCheck,
  UserPlus,
  UserRound,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import SearchList from "@/components/primitives/SearchList";
import type { SearchItem } from "@/components/primitives/SearchList";
import { useOrg } from "@/harness/OrgContext";

/* ─────────────────────────────────────────────────────────
 * COMMAND PALETTE — ⌘K / Ctrl+K. Beautiful UI's Search primitive
 * over everything you can open or start in this org: chats,
 * projects, and the create/register/invite actions.
 * ───────────────────────────────────────────────────────── */

export function useCommandPalette() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((current) => !current);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return { open, setOpen };
}

export function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const org = useOrg();
  const close = () => onOpenChange(false);

  const items = useMemo<SearchItem[]>(() => {
    const run = (fn: () => void) => () => {
      close();
      fn();
    };
    const chats: SearchItem[] = (org.chats ?? []).map((chat) => {
      const project = chat.projectId
        ? org.projects?.find((item) => item._id === chat.projectId)
        : undefined;
      return {
        hint:
          chat.kind === "dm" ? "常時応答" : (project?.name ?? "プロジェクト"),
        icon:
          chat.kind === "dm" ? (
            <UserRound size={14} />
          ) : chat.visibility === "private" ? (
            <Lock size={14} />
          ) : (
            <MessageSquare size={14} />
          ),
        key: `chat-${String(chat._id)}`,
        keywords: `chat チャット ${project?.name ?? ""}`,
        label: chat.kind === "dm" ? "Personal DM" : chat.title,
        onSelect: run(() => org.goChat(chat._id)),
      };
    });
    const projects: SearchItem[] = (org.projects ?? []).map((project) => ({
      hint: project.visibility === "private" ? "private" : "org",
      icon: <Folder size={14} />,
      key: `project-${String(project._id)}`,
      keywords: "project プロジェクト new chat",
      label: `${project.name} に新しいチャット`,
      onSelect: run(() =>
        org.openDialog({ kind: "newChat", projectId: project._id })
      ),
    }));
    const actions: SearchItem[] = [
      {
        icon: <Home size={14} />,
        key: "home",
        keywords: "home",
        label: "ホーム",
        onSelect: run(org.goHome),
      },
      {
        hint: "/new",
        icon: <MessageSquarePlus size={14} />,
        key: "new-chat",
        label: "新しいチャット",
        onSelect: run(() => org.openDialog({ kind: "newChat" })),
      },
      {
        hint: "/project",
        icon: <Folder size={14} />,
        key: "new-project",
        label: "新しいプロジェクト",
        onSelect: run(() => org.openDialog({ kind: "createProject" })),
      },
      {
        hint: "npm i -g tahcode",
        icon: <Cpu size={14} />,
        key: "runtime",
        label: "このマシンをランタイムとして登録",
        onSelect: run(() => org.openDialog({ kind: "registerRuntime" })),
      },
      ...(org.isAdmin
        ? [
            {
              hint: "Admin 以上",
              icon: <UserPlus size={14} />,
              key: "invite",
              label: "メンバーを招待",
              onSelect: run(() => org.openDialog({ kind: "invite" })),
            },
          ]
        : []),
      ...((org.runtimes ?? []).length > 0
        ? [
            {
              hint: "default deny",
              icon: <ShieldCheck size={14} />,
              key: "grants",
              label: "ランタイムの利用許可を管理",
              onSelect: run(() => org.goSettings()),
            },
          ]
        : []),
      {
        icon: <Settings size={14} />,
        key: "settings",
        keywords: "settings 設定 members runtimes",
        label: "Org 設定",
        onSelect: run(org.goSettings),
      },
    ];
    return [...chats, ...projects, ...actions];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [org.chats, org.projects, org.runtimes, org.isAdmin]);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className="fixed inset-0 z-[70] bg-black/30 backdrop-blur-[2px] dark:bg-black/55"
          style={{ animation: "fade-in 160ms ease-out both" }}
        />
        <div className="fixed inset-x-0 top-[12vh] z-[71] flex justify-center px-4">
          <DialogPrimitive.Content
            aria-describedby={undefined}
            className="w-full max-w-[560px] outline-none"
            style={{
              animation: "pop-in 200ms cubic-bezier(0.23,1,0.32,1) both",
            }}
          >
            <DialogPrimitive.Title className="sr-only">
              コマンドパレット
            </DialogPrimitive.Title>
            <SearchList
              items={items}
              onEscape={close}
              maxResults={9}
              labels={{
                ariaLabel: "コマンドパレット",
                emptyHint:
                  "チャット名、プロジェクト名、または「新しい」「招待」「ランタイム」など",
                emptyTitle: "見つかりません",
                placeholder: "チャット・プロジェクト・操作を検索…",
              }}
            />
          </DialogPrimitive.Content>
        </div>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
