import * as DialogPrimitive from "@radix-ui/react-dialog";
import {
  ArrowUpCircle,
  Folder,
  Home,
  Lock,
  Menu,
  MessageSquare,
  PanelRight,
  Plug,
  Plus,
  Search,
  SquarePen,
  UserPlus,
  UserRound,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { DragEvent, ReactNode } from "react";
import { useLocation, useParams } from "react-router-dom";
import { toast } from "sonner";

import SidebarNav from "@/components/primitives/SidebarNav";
import type {
  SidebarRailItem,
  SidebarSection,
} from "@/components/primitives/SidebarNav";
import { CommandPalette, useCommandPalette } from "@/harness/CommandPalette";
import { useOrg } from "@/harness/OrgContext";
import { isRightRailVisible } from "@/harness/rail/flags";
import type { RailTab } from "@/harness/rail/flags";
import { RightRail } from "@/harness/rail/RightRail";
import {
  beginChatDrag,
  endChatDrag,
  isChatDrag,
  peekChatDrag,
  readChatDrag,
  writeChatDrag,
} from "@/harness/sessionDrag";
import {
  buildSidebarSections,
  sidebarGroupAddLabel,
} from "@/harness/sidebarModel";
import type { SidebarModelGroup } from "@/harness/sidebarModel";
import {
  closeTabsToTheRight,
  isCloseTabShortcut,
  isEditableKeyboardTarget,
} from "@/harness/tabActions";
import { ContextMenu } from "@/harness/ui/ContextMenu";
import type { ContextMenuItem } from "@/harness/ui/ContextMenu";
import { isDesktopShell } from "@/lib/desktop";
import {
  colorFor,
  copyText,
  displayName,
  monogram,
  roleLabel,
  truncate,
} from "@/lib/format";
import { orgChatPath, orgConnectorsPath } from "@/lib/orgPaths";
import type { Theme } from "@/lib/theme";

import type { Id } from "../../convex/_generated/dataModel";

function sidebarGroupOnAdd(
  org: ReturnType<typeof useOrg>,
  group: SidebarModelGroup
): (() => void) | undefined {
  if (group.addKind === "createProject") {
    return () => org.openDialog({ kind: "createProject" });
  }
  if (group.addKind === "newChat" && group.projectId) {
    return () =>
      org.openDialog({
        kind: "newChat",
        projectId: group.projectId as Id<"projects">,
      });
  }
  return undefined;
}

/* ─────────────────────────────────────────────────────────
 * SHELL — the harness frame: SidebarNav on the canvas, a
 * rounded main pane with chat tabs, and a docked right rail
 * (Context · Runtime · Team, gated by RIGHT_RAIL_SECTION_ENABLED).
 * Below lg the sidebar becomes a sheet; below xl the rail becomes a
 * sheet.
 * ───────────────────────────────────────────────────────── */

function useSidebarModel() {
  const org = useOrg();
  const { chatId } = useParams();
  const location = useLocation();
  const onHome =
    location.pathname === `/o/${org.org.slug}` ||
    location.pathname === `/o/${org.org.slug}/`;
  const onConnectors =
    location.pathname === orgConnectorsPath(org.org.slug) ||
    location.pathname.startsWith(`${orgConnectorsPath(org.org.slug)}/`);

  const rail: SidebarRailItem[] = [
    {
      icon: <SquarePen size={17} />,
      key: "new",
      label: "新しいチャット",
      hint: "プロジェクトまたは Personal DM にスレッドを作る",
      onClick: () => org.openDialog({ kind: "newChat" }),
    },
    {
      active: onHome,
      icon: <Home size={17} />,
      key: "home",
      label: "ホーム",
      hint: "ダッシュボードと提案",
      onClick: org.goHome,
    },
    {
      count: org.members ? String(org.members.length) : undefined,
      disabled: !org.isAdmin,
      hint: org.isAdmin ? "メールとロールで招待" : "招待は Admin 以上のみ",
      icon: <UserPlus size={17} />,
      key: "invite",
      label: "メンバーを招待",
      onClick: () => org.openDialog({ kind: "invite" }),
    },
    {
      active: onConnectors,
      icon: <Plug size={17} />,
      key: "connectors",
      label: "コネクタ",
      onClick: org.goConnectors,
    },
  ];

  const sections: SidebarSection[] = useMemo(() => {
    const model = buildSidebarSections({
      chats: org.chats,
      isAdmin: org.isAdmin,
      meId: String(org.me._id),
      projects: org.projects,
    });
    return model.map((section) => ({
      id: section.id,
      label: section.label,
      groups: section.groups.map((group) => ({
        addLabel: sidebarGroupAddLabel(group),
        emptyHint: group.emptyHint,
        icon:
          group.kind === "personal" ? undefined : group.privateGroup ? (
            <Lock size={12} />
          ) : (
            <Folder size={12} />
          ),
        id: group.id,
        items: group.items.map((item) => ({
          id: item.id,
          label: item.label,
          meta: item.meta,
          icon:
            item.kind === "dm" ? (
              <UserRound size={15} />
            ) : item.privateItem ? (
              <Lock size={14} />
            ) : (
              <MessageSquare size={14} />
            ),
        })),
        label: group.label,
        onAdd: sidebarGroupOnAdd(org, group),
      })),
    }));
  }, [org]);

  return { chatId: chatId ?? null, org, rail, sections };
}

function Sidebar({
  theme,
  onToggleTheme,
  collapsible,
  onNavigate,
}: {
  theme: Theme;
  onToggleTheme: () => void;
  collapsible: boolean;
  onNavigate?: () => void;
}) {
  const { org, chatId, rail, sections } = useSidebarModel();
  const [sessionMenu, setSessionMenu] = useState<{
    id: string;
    x: number;
    y: number;
  } | null>(null);
  const wrap = (fn?: () => void) => () => {
    fn?.();
    onNavigate?.();
  };
  const meName = displayName(org.me);
  const sessionMenuItems: ContextMenuItem[] = sessionMenu
    ? [
        {
          key: "open",
          label: "開く",
          onSelect: () => {
            org.goChat(sessionMenu.id as Id<"chats">);
            onNavigate?.();
          },
        },
        {
          key: "background",
          label: "バックグラウンドでタブを開く",
          onSelect: () => {
            org.openTab(sessionMenu.id as Id<"chats">);
          },
        },
        {
          key: "copy",
          label: "リンクをコピー",
          onSelect: () => {
            const href = `${window.location.origin}${orgChatPath(org.org.slug, sessionMenu.id)}`;
            void copyText(href).then((ok) => {
              if (ok) {
                toast.success("リンクをコピーしました");
                return;
              }
              toast.error("コピーできませんでした");
            });
          },
        },
      ]
    : [];
  return (
    <>
      <SidebarNav
        fill
        collapsible={collapsible}
        className="lg:pl-0"
        workspace={{
          id: String(org.org._id),
          meta: roleLabel(org.role),
          monogram: monogram(org.org.name),
          name: org.org.name,
        }}
        workspaces={org.orgs.map((item) => ({
          id: String(item._id),
          meta: roleLabel(item.role),
          monogram: monogram(item.name),
          name: item.name,
        }))}
        onSwitchWorkspace={(id) => {
          org.switchOrg(id as Id<"orgs">);
          onNavigate?.();
        }}
        onNewWorkspace={() => org.openDialog({ kind: "createOrg" })}
        onWorkspaceSettings={wrap(org.goSettings)}
        onConnectors={wrap(org.goConnectors)}
        onInvite={
          org.isAdmin ? () => org.openDialog({ kind: "invite" }) : undefined
        }
        extraMenuItems={[
          {
            icon: <Folder size={16} />,
            label: "新しいプロジェクト",
            onClick: () => org.openDialog({ kind: "createProject" }),
          },
          ...(isDesktopShell()
            ? [
                {
                  icon: <ArrowUpCircle size={16} />,
                  label: "デスクトップの更新",
                  onClick: () => org.goSettings("desktop"),
                },
              ]
            : []),
        ]}
        onSignOut={org.signOut}
        theme={theme}
        onToggleTheme={onToggleTheme}
        rail={rail.map((item) => ({ ...item, onClick: wrap(item.onClick) }))}
        sections={sections.map((section) => ({
          ...section,
          groups: section.groups.map((group) => ({
            ...group,
            onAdd: group.onAdd ? wrap(group.onAdd) : undefined,
          })),
        }))}
        activeId={chatId}
        onPick={(id) => {
          org.goChat(id as Id<"chats">);
          onNavigate?.();
        }}
        onItemContextMenu={(id, event) => {
          setSessionMenu({ id, x: event.clientX, y: event.clientY });
        }}
        onItemDragStart={(id, event) => {
          beginChatDrag(id);
          writeChatDrag(event.dataTransfer, id);
        }}
        onItemDragEnd={endChatDrag}
        user={{
          color: colorFor(String(org.me._id)),
          email: org.me.email,
          image: org.me.image,
          monogram: monogram(meName),
          name: meName,
        }}
      />
      {sessionMenu && (
        <ContextMenu
          items={sessionMenuItems}
          x={sessionMenu.x}
          y={sessionMenu.y}
          onClose={() => setSessionMenu(null)}
        />
      )}
    </>
  );
}

function useChatDropTarget(onDropChat: (id: string) => void) {
  const [over, setOver] = useState(false);
  const onDragOver = (event: DragEvent) => {
    if (!isChatDrag(event.dataTransfer) && !peekChatDrag()) {
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setOver(true);
  };
  const onDragLeave = (event: DragEvent) => {
    const next = event.relatedTarget;
    if (next instanceof Node && event.currentTarget.contains(next)) {
      return;
    }
    setOver(false);
  };
  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setOver(false);
    const id = readChatDrag(event.dataTransfer);
    endChatDrag();
    if (id) {
      onDropChat(id);
    }
  };
  return { onDragLeave, onDragOver, onDrop, over };
}

export function TabBar({
  leading,
  trailing,
}: {
  leading?: ReactNode;
  trailing?: ReactNode;
}) {
  const org = useOrg();
  const { chatId } = useParams();
  const location = useLocation();
  const [tabMenu, setTabMenu] = useState<{
    id: Id<"chats">;
    x: number;
    y: number;
  } | null>(null);
  const drop = useChatDropTarget((id) => {
    org.goChat(id as Id<"chats">);
  });
  const onHome =
    location.pathname === `/o/${org.org.slug}` ||
    location.pathname === `/o/${org.org.slug}/`;
  const tabs = org.tabs
    .map((id) => org.chats?.find((chat) => chat._id === id))
    .filter((chat): chat is NonNullable<typeof chat> => !!chat);
  const activeChatId = (chatId as Id<"chats"> | undefined) ?? null;

  const closeChatTab = (id: Id<"chats">) => {
    const wasActive = chatId === String(id);
    org.closeTab(id);
    if (wasActive) {
      org.goHome();
    }
  };

  useEffect(() => {
    if (!isDesktopShell()) {
      return;
    }
    const onKey = (event: KeyboardEvent) => {
      if (
        !isCloseTabShortcut(event) ||
        isEditableKeyboardTarget(event.target)
      ) {
        return;
      }
      if (!chatId) {
        return;
      }
      event.preventDefault();
      org.closeTab(chatId as Id<"chats">);
      org.goHome();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [chatId, org]);

  const tabMenuItems: ContextMenuItem[] = tabMenu
    ? [
        {
          key: "close",
          label: "閉じる",
          onSelect: () => {
            closeChatTab(tabMenu.id);
          },
        },
        {
          disabled: tabs.length < 2,
          key: "close-others",
          label: "他を閉じる",
          onSelect: () => {
            org.closeOtherTabs(tabMenu.id);
          },
        },
        {
          disabled:
            tabs.findIndex((chat) => chat._id === tabMenu.id) ===
            tabs.length - 1,
          key: "close-right",
          label: "右側を閉じる",
          onSelect: () => {
            const next = closeTabsToTheRight(org.tabs, tabMenu.id);
            org.closeTabsToTheRight(tabMenu.id);
            if (activeChatId && !next.includes(activeChatId)) {
              org.goHome();
            }
          },
        },
      ]
    : [];

  return (
    <div className="border-line flex h-11 shrink-0 items-center border-b">
      <div
        data-shell-tab-scroller
        role="toolbar"
        tabIndex={-1}
        aria-label="開いているチャット"
        onDragLeave={drop.onDragLeave}
        onDragOver={drop.onDragOver}
        onDrop={drop.onDrop}
        className={`flex min-w-0 flex-1 [scrollbar-width:none] items-center gap-1 overflow-x-auto px-2 [&::-webkit-scrollbar]:hidden ${
          drop.over ? "bg-hover-2" : ""
        }`}
      >
        {leading}
        <button
          type="button"
          aria-pressed={onHome}
          onClick={org.goHome}
          className={`flex h-7 shrink-0 items-center gap-1.5 rounded-[7px] px-2.5 text-[12.5px] font-medium transition-colors duration-100 ${
            onHome
              ? "bg-hover-2 text-ink"
              : "text-ink-2 hover:bg-hover hover:text-ink"
          }`}
        >
          <Home size={13} />
          ホーム
        </button>
        {tabs.map((chat) => {
          const active = chatId === String(chat._id);
          const project = chat.projectId
            ? org.projects?.find((item) => item._id === chat.projectId)
            : undefined;
          const title = chat.kind === "dm" ? "Personal DM" : chat.title;
          return (
            <div
              key={String(chat._id)}
              className={`group/tab flex h-7 w-40 shrink-0 items-center gap-0.5 rounded-[7px] pr-0.5 pl-2.5 text-[12.5px] font-medium transition-colors duration-100 ${
                active
                  ? "bg-hover-2 text-ink"
                  : "text-ink-2 hover:bg-hover hover:text-ink"
              }`}
            >
              <button
                type="button"
                aria-pressed={active}
                onClick={() => org.goChat(chat._id)}
                onAuxClick={(event) => {
                  if (event.button !== 1) {
                    return;
                  }
                  event.preventDefault();
                  closeChatTab(chat._id);
                }}
                onMouseDown={(event) => {
                  if (event.button === 1) {
                    event.preventDefault();
                  }
                }}
                onContextMenu={(event) => {
                  event.preventDefault();
                  setTabMenu({
                    id: chat._id,
                    x: event.clientX,
                    y: event.clientY,
                  });
                }}
                title={project ? `${project.name} / ${title}` : title}
                className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
              >
                <span className="text-ink-3 shrink-0">
                  {chat.kind === "dm" ? (
                    <UserRound size={12} />
                  ) : (
                    <MessageSquare size={12} />
                  )}
                </span>
                <span className="block truncate">{truncate(title, 22)}</span>
              </button>
              <button
                type="button"
                aria-label="タブを閉じる"
                onClick={() => {
                  closeChatTab(chat._id);
                }}
                className="text-ink-3 hover:bg-hover-2 hover:text-ink -my-1 flex size-6 shrink-0 items-center justify-center rounded-[5px] transition-[background-color,color] duration-100"
              >
                <X size={11} strokeWidth={2.4} />
              </button>
            </div>
          );
        })}
        <button
          type="button"
          aria-label="新しいチャット"
          onClick={() => org.openDialog({ kind: "newChat" })}
          className="text-ink-3 hover:bg-hover hover:text-ink ml-0.5 flex size-7 shrink-0 items-center justify-center rounded-[7px] transition-colors duration-100"
        >
          <Plus size={15} strokeWidth={2} />
        </button>
      </div>
      <div
        data-shell-header-tools
        className="border-line flex shrink-0 items-center gap-1 border-l px-2"
      >
        {trailing}
      </div>
      {tabMenu && (
        <ContextMenu
          items={tabMenuItems}
          x={tabMenu.x}
          y={tabMenu.y}
          onClose={() => setTabMenu(null)}
        />
      )}
    </div>
  );
}

export function Shell({
  theme,
  onToggleTheme,
  children,
  rail,
  railDefaultTab,
}: {
  theme: Theme;
  onToggleTheme: () => void;
  children: ReactNode;
  /** show the docked right rail (chat + home); settings and connectors run full-width */
  rail: boolean;
  railDefaultTab?: RailTab;
}) {
  const org = useOrg();
  const [navOpen, setNavOpen] = useState(false);
  const [railOpen, setRailOpen] = useState(false);
  const [railDocked, setRailDocked] = useState(true);
  const palette = useCommandPalette();
  const location = useLocation();
  const showRail = rail && isRightRailVisible();
  const chatDrop = useChatDropTarget((id) => {
    org.goChat(id as Id<"chats">);
  });
  useEffect(() => {
    setNavOpen(false);
    setRailOpen(false);
  }, [location.pathname]);

  return (
    <main className="bg-canvas text-ink flex h-[100dvh] gap-0 p-2.5 lg:pl-0">
      <div className="hidden lg:flex">
        <Sidebar theme={theme} onToggleTheme={onToggleTheme} collapsible />
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-2.5">
        <div className="flex min-h-0 flex-1 gap-2.5">
          <section className="border-line bg-page flex min-w-0 flex-1 flex-col overflow-hidden rounded-[14px] border">
            <TabBar
              leading={
                <button
                  type="button"
                  aria-label="ナビゲーションを開く"
                  onClick={() => setNavOpen(true)}
                  className="text-ink-3 hover:bg-hover hover:text-ink mr-1 flex size-7 shrink-0 items-center justify-center rounded-[7px] transition-colors duration-100 lg:hidden"
                >
                  <Menu size={16} />
                </button>
              }
              trailing={
                <>
                  <button
                    type="button"
                    aria-label="コマンドパレット（⌘K）"
                    title="⌘K / Ctrl+K"
                    onClick={() => palette.setOpen(true)}
                    className="text-ink-3 hover:bg-hover hover:text-ink flex h-7 shrink-0 items-center gap-1.5 rounded-[7px] px-2 text-[12px] transition-colors duration-100"
                  >
                    <Search size={13} />
                    <span className="hidden sm:inline">検索</span>
                    <kbd className="bg-inset shadow-hairline hidden rounded-[4px] px-1 font-mono text-[10px] md:inline">
                      ⌘K
                    </kbd>
                  </button>
                  {showRail && (
                    <>
                      <button
                        type="button"
                        aria-label="パネルを開く"
                        onClick={() => setRailOpen(true)}
                        className="text-ink-3 hover:bg-hover hover:text-ink flex size-7 shrink-0 items-center justify-center rounded-[7px] transition-colors duration-100 xl:hidden"
                      >
                        <PanelRight size={16} />
                      </button>
                      <button
                        type="button"
                        aria-label={
                          railDocked ? "右パネルを閉じる" : "右パネルを開く"
                        }
                        aria-pressed={railDocked}
                        onClick={() => setRailDocked((open) => !open)}
                        className="text-ink-3 hover:bg-hover hover:text-ink hidden size-7 shrink-0 items-center justify-center rounded-[7px] transition-colors duration-100 xl:flex"
                      >
                        <PanelRight size={16} />
                      </button>
                    </>
                  )}
                </>
              }
            />
            <div
              data-shell-chat-drop
              role="toolbar"
              tabIndex={-1}
              aria-label="チャットをドロップして開く"
              onDragLeave={chatDrop.onDragLeave}
              onDragOver={chatDrop.onDragOver}
              onDrop={chatDrop.onDrop}
              className={`flex min-h-0 flex-1 flex-col ${
                chatDrop.over ? "bg-hover-2" : ""
              }`}
            >
              {children}
            </div>
          </section>

          {showRail && railDocked && (
            <aside
              className="border-line bg-page hidden w-[360px] shrink-0 flex-col overflow-hidden rounded-[14px] border xl:flex"
              style={{ animation: "fade-in 300ms ease both" }}
            >
              <RightRail defaultTab={railDefaultTab} />
            </aside>
          )}
        </div>
      </div>

      <CommandPalette open={palette.open} onOpenChange={palette.setOpen} />

      {/* sidebar sheet (below lg) */}
      <DialogPrimitive.Root open={navOpen} onOpenChange={setNavOpen}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay
            className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-[2px]"
            style={{ animation: "fade-in 200ms ease-out both" }}
          />
          <DialogPrimitive.Content
            data-sidebar-drawer
            aria-describedby={undefined}
            className="bg-canvas fixed inset-y-0 left-0 z-[61] flex w-[248px] flex-col p-2.5 outline-none"
            style={{
              animation: "sheet-in 260ms cubic-bezier(0.16,1,0.3,1) both",
            }}
          >
            <DialogPrimitive.Title className="sr-only">
              ナビゲーション
            </DialogPrimitive.Title>
            <Sidebar
              theme={theme}
              onToggleTheme={onToggleTheme}
              collapsible={false}
              onNavigate={() => setNavOpen(false)}
            />
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>

      {/* rail sheet (below xl) */}
      {showRail && (
        <DialogPrimitive.Root open={railOpen} onOpenChange={setRailOpen}>
          <DialogPrimitive.Portal>
            <DialogPrimitive.Overlay
              className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-[2px]"
              style={{ animation: "fade-in 200ms ease-out both" }}
            />
            <DialogPrimitive.Content
              aria-describedby={undefined}
              className="border-line bg-page fixed inset-y-2.5 right-2.5 z-[61] flex w-[min(360px,calc(100vw-20px))] flex-col overflow-hidden rounded-[14px] border outline-none"
              style={{
                animation:
                  "sheet-in-right 260ms cubic-bezier(0.16,1,0.3,1) both",
              }}
            >
              <DialogPrimitive.Title className="sr-only">
                パネル
              </DialogPrimitive.Title>
              <RightRail
                defaultTab={railDefaultTab}
                onClose={() => setRailOpen(false)}
              />
            </DialogPrimitive.Content>
          </DialogPrimitive.Portal>
        </DialogPrimitive.Root>
      )}
    </main>
  );
}
