import * as DialogPrimitive from "@radix-ui/react-dialog";
import {
  Cpu,
  Folder,
  Home,
  Lock,
  Menu,
  MessageSquare,
  PanelRight,
  Plus,
  Search,
  SquarePen,
  UserPlus,
  UserRound,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useLocation, useParams } from "react-router-dom";

import SidebarNav from "@/components/primitives/SidebarNav";
import type {
  SidebarGroup,
  SidebarRailItem,
} from "@/components/primitives/SidebarNav";
import { CommandPalette, useCommandPalette } from "@/harness/CommandPalette";
import { isLive, useOrg } from "@/harness/OrgContext";
import { isRightRailVisible } from "@/harness/rail/flags";
import type { RailTab } from "@/harness/rail/flags";
import { RightRail } from "@/harness/rail/RightRail";
import { isDesktopShell, registerRuntimeCtaLabel } from "@/lib/desktop";
import { monogram, roleLabel, truncate } from "@/lib/format";
import type { Theme } from "@/lib/theme";

import type { Id } from "../../convex/_generated/dataModel";

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
  const onSettings = location.pathname.startsWith(
    `/o/${org.org.slug}/settings`
  );

  const liveCount = (org.runtimes ?? []).filter((runtime) =>
    isLive(runtime, org.now)
  ).length;
  const runtimeCount = org.runtimes?.length ?? 0;

  const rail: SidebarRailItem[] = [
    {
      icon: <SquarePen size={17} />,
      key: "new",
      label: "新しいチャット",
      onClick: () => org.openDialog({ kind: "newChat" }),
    },
    {
      active: onHome,
      icon: <Home size={17} />,
      key: "home",
      label: "ホーム",
      onClick: org.goHome,
    },
    {
      count: org.members ? String(org.members.length) : undefined,
      disabled: !org.isAdmin,
      hint: org.isAdmin ? "招待リンクを発行" : "招待は Admin 以上のみ",
      icon: <UserPlus size={17} />,
      key: "invite",
      label: "メンバーを招待",
      onClick: () => org.openDialog({ kind: "invite" }),
    },
    {
      active: onSettings,
      count: runtimeCount > 0 ? `${liveCount}/${runtimeCount}` : undefined,
      icon: <Cpu size={17} />,
      key: "runtimes",
      label: "ランタイム",
      onClick: org.goSettings,
    },
  ];

  const groups: SidebarGroup[] = useMemo(() => {
    const dm = (org.chats ?? []).find(
      (chat) =>
        chat.kind === "dm" && String(chat.ownerId) === String(org.me._id)
    );
    const personal: SidebarGroup = {
      emptyHint: "DM を準備しています…",
      id: "personal",
      items: dm
        ? [
            {
              id: String(dm._id),
              label: "Personal DM",
              meta: "常時応答",
              icon: <UserRound size={15} />,
            },
          ]
        : [],
      label: "パーソナル",
    };
    const projectGroups: SidebarGroup[] = (org.projects ?? []).map(
      (project) => ({
        addLabel: `${project.name} に新しいチャット`,
        emptyHint: "チャットはまだありません。＋ で作成",
        icon:
          project.visibility === "private" ? (
            <Lock size={12} />
          ) : (
            <Folder size={12} />
          ),
        id: String(project._id),
        items: (org.chats ?? [])
          .filter(
            (chat) =>
              chat.kind === "project" &&
              String(chat.projectId) === String(project._id)
          )
          .map((chat) => ({
            id: String(chat._id),
            label: chat.title,
            icon:
              chat.visibility === "private" ? (
                <Lock size={14} />
              ) : (
                <MessageSquare size={14} />
              ),
          })),
        label: project.name,
        onAdd: () =>
          org.openDialog({ kind: "newChat", projectId: project._id }),
      })
    );
    if (projectGroups.length === 0) {
      projectGroups.push({
        addLabel: "新しいプロジェクト",
        emptyHint: org.isAdmin
          ? "まだプロジェクトがありません。＋ で最初のプロジェクトを作成"
          : "参加しているプロジェクトのみ表示されます。Owner / Admin に追加を依頼するか、自分で作成できます",
        icon: <Folder size={12} />,
        id: "no-projects",
        items: [],
        label: "プロジェクト",
        onAdd: () => org.openDialog({ kind: "createProject" }),
      });
    }
    return [personal, ...projectGroups];
  }, [org]);

  return { chatId: chatId ?? null, groups, liveCount, org, rail, runtimeCount };
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
  const { org, chatId, rail, groups, liveCount, runtimeCount } =
    useSidebarModel();
  const wrap = (fn?: () => void) => () => {
    fn?.();
    onNavigate?.();
  };
  return (
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
      onInvite={
        org.isAdmin ? () => org.openDialog({ kind: "invite" }) : undefined
      }
      onSignOut={org.signOut}
      theme={theme}
      onToggleTheme={onToggleTheme}
      rail={rail.map((item) => ({ ...item, onClick: wrap(item.onClick) }))}
      groups={groups.map((group) => ({
        ...group,
        onAdd: group.onAdd ? wrap(group.onAdd) : undefined,
      }))}
      groupsLabel="チャット"
      onAddGroup={() => org.openDialog({ kind: "createProject" })}
      addGroupLabel="新しいプロジェクト"
      activeId={chatId}
      onPick={(id) => {
        org.goChat(id as Id<"chats">);
        onNavigate?.();
      }}
      footerLabel={
        runtimeCount === 0
          ? isDesktopShell()
            ? registerRuntimeCtaLabel()
            : "ランタイムを登録"
          : liveCount === 0
            ? "ランタイムがオフライン"
            : `ランタイム ${liveCount} 台オンライン`
      }
      footerIcon={<Cpu size={14} />}
      footerTone={runtimeCount === 0 ? "accent" : "neutral"}
      onFooterClick={wrap(
        runtimeCount === 0
          ? () => org.openDialog({ kind: "registerRuntime" })
          : org.goSettings
      )}
    />
  );
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
  const onHome =
    location.pathname === `/o/${org.org.slug}` ||
    location.pathname === `/o/${org.org.slug}/`;
  const tabs = org.tabs
    .map((id) => org.chats?.find((chat) => chat._id === id))
    .filter((chat): chat is NonNullable<typeof chat> => !!chat);
  return (
    <div className="border-line flex h-11 shrink-0 [scrollbar-width:none] items-center gap-1 overflow-x-auto border-b px-2 [&::-webkit-scrollbar]:hidden">
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
            /* fixed width so every close button sits in the same spot */
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
                org.closeTab(chat._id);
                if (active) {
                  org.goHome();
                }
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
      <span className="flex-1" />
      {trailing}
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
  /** show the docked right rail (chat + home); settings runs full-width */
  rail: boolean;
  railDefaultTab?: RailTab;
}) {
  const [navOpen, setNavOpen] = useState(false);
  const [railOpen, setRailOpen] = useState(false);
  const palette = useCommandPalette();
  const location = useLocation();
  const showRail = rail && isRightRailVisible();
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
                    <button
                      type="button"
                      aria-label="パネルを開く"
                      onClick={() => setRailOpen(true)}
                      className="text-ink-3 hover:bg-hover hover:text-ink flex size-7 shrink-0 items-center justify-center rounded-[7px] transition-colors duration-100 xl:hidden"
                    >
                      <PanelRight size={16} />
                    </button>
                  )}
                </>
              }
            />
            {children}
          </section>

          {showRail && (
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
