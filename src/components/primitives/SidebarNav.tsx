import {
  Check,
  ChevronDown,
  ChevronUp,
  LogOut,
  Moon,
  PanelLeft,
  Plus,
  Plug,
  Settings,
  Sun,
  UserPlus,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { CSSProperties, DragEvent, MouseEvent, ReactNode } from "react";
import { createPortal } from "react-dom";

import { Monogram } from "@/components/atoms/EntityChip";
import GlideMenu from "@/components/primitives/GlideMenu";

/* ─────────────────────────────────────────────────────────
 * SIDEBAR NAV — ported from Beautiful UI (beautifului.dev/r/sidebar-nav)
 * Compact workspace switcher, primary rail, Projects→Chats tree,
 * a bottom account menu, and a collapse that preserves icon alignment.
 *
 * Changes from the registry copy: data-driven (workspaces, rail,
 * sections come in as props), lucide-react glyphs instead of the
 * commercial @central-icons set, grouped items with per-group "+".
 * The 52↔224px collapse choreography lives in sidebar-nav.css.
 * ───────────────────────────────────────────────────────── */

export interface SidebarWorkspace {
  id: string;
  name: string;
  monogram: string;
  meta?: string;
  current?: boolean;
}

export interface SidebarRailItem {
  key: string;
  label: string;
  icon: ReactNode;
  count?: string;
  active?: boolean;
  disabled?: boolean;
  hint?: string;
  onClick?: () => void;
}

export interface SidebarItem {
  id: string;
  label: string;
  meta?: string;
  icon?: ReactNode;
}

export interface SidebarGroup {
  id: string;
  label: string;
  icon?: ReactNode;
  items: SidebarItem[];
  emptyHint?: string;
  addLabel?: string;
  onAdd?: () => void;
}

export interface SidebarSection {
  id: string;
  label: string;
  groups: SidebarGroup[];
}

export interface SidebarUser {
  name: string;
  email?: string;
  monogram: string;
  image?: string;
  color?: string;
}

interface SidebarNavProps {
  workspace: SidebarWorkspace;
  workspaces: SidebarWorkspace[];
  onSwitchWorkspace?: (id: string) => void;
  onNewWorkspace?: () => void;
  onWorkspaceSettings?: () => void;
  onConnectors?: () => void;
  onInvite?: () => void;
  onSignOut?: () => void;
  extraMenuItems?: {
    icon: ReactNode;
    label: string;
    onClick: () => void;
  }[];
  theme?: "dark" | "light";
  onToggleTheme?: () => void;
  rail: SidebarRailItem[];
  sections: SidebarSection[];
  activeId?: string | null;
  onPick?: (id: string) => void;
  onGroupContextMenu?: (id: string, event: MouseEvent) => void;
  onItemContextMenu?: (id: string, event: MouseEvent) => void;
  onItemDragStart?: (id: string, event: DragEvent) => void;
  onItemDragEnd?: () => void;
  user?: SidebarUser;
  className?: string;
  fill?: boolean;
  collapsible?: boolean;
}

const SIDEBAR_MOTION = {
  collapsedWidth: 52,
  copyDuration: 180,
  copyOffset: 8,
  duration: 280,
  easing: "cubic-bezier(0.16, 1, 0.3, 1)",
  expandedWidth: 224,
};

function GlideGroup({ children }: { children: ReactNode }) {
  return (
    <GlideMenu
      rowSelector="[data-row]"
      highlightClassName="sidebar-glide-highlight rounded-[7px] bg-hover-2"
      className="group/glide flex flex-col gap-px"
    >
      {children}
    </GlideMenu>
  );
}

function RailButton({
  icon,
  label,
  active = false,
  count,
  disabled,
  hint,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  active?: boolean;
  count?: string;
  disabled?: boolean;
  hint?: string;
  onClick?: () => void;
}) {
  return (
    <button
      data-row
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={hint ?? label}
      className={`sidebar-row relative z-10 mx-2 flex h-8 items-center rounded-[8px] px-2 text-left transition-[width,background-color,color,transform] duration-150 active:scale-[0.98] disabled:opacity-45 disabled:active:scale-100 ${active ? "bg-active text-active-ink group-hover/glide:bg-transparent" : ""}`}
    >
      <span
        className={`flex size-5 shrink-0 items-center justify-center ${active ? "text-active-ink" : "text-ink-2"}`}
      >
        {icon}
      </span>
      <span
        className={`sidebar-copy ml-1.5 min-w-0 flex-1 truncate text-[13.5px] font-medium ${active ? "text-active-ink" : "text-ink-2"}`}
      >
        {label}
      </span>
      {count && (
        <span
          className={`sidebar-copy mr-1 shrink-0 text-[12px] font-medium tabular-nums ${active ? "text-active-ink/80" : "text-ink-3"}`}
        >
          {count}
        </span>
      )}
    </button>
  );
}

function UserAvatar({ user }: { user: SidebarUser }) {
  const [broken, setBroken] = useState(false);
  const image = user.image?.trim();
  if (image && !broken) {
    return (
      <img
        src={image}
        alt=""
        className="size-5 shrink-0 rounded-full object-cover"
        onError={() => {
          setBroken(true);
        }}
      />
    );
  }
  return (
    <Monogram color={user.color} className="size-5 text-[10px]">
      {user.monogram}
    </Monogram>
  );
}

function userEmailLine(user: SidebarUser): string | undefined {
  const email = user.email?.trim();
  if (!email || email === user.name) {
    return undefined;
  }
  return email;
}

function UserMenu({
  position,
  onClose,
  onSettings,
  onConnectors,
  onSignOut,
  theme,
  onToggleTheme,
}: {
  position: { bottom: number; left: number };
  onClose: () => void;
  onSettings?: () => void;
  onConnectors?: () => void;
  onSignOut?: () => void;
  theme?: "dark" | "light";
  onToggleTheme?: () => void;
}) {
  const run = (fn?: () => void) => () => {
    onClose();
    fn?.();
  };
  const items: {
    icon: ReactNode;
    key: string;
    label: string;
    onClick: () => void;
  }[] = [];
  if (onSettings) {
    items.push({
      icon: <Settings size={16} />,
      key: "settings",
      label: "設定",
      onClick: onSettings,
    });
  }
  if (onConnectors) {
    items.push({
      icon: <Plug size={16} />,
      key: "connectors",
      label: "コネクタ",
      onClick: onConnectors,
    });
  }
  if (onToggleTheme) {
    items.push({
      icon: theme === "dark" ? <Sun size={16} /> : <Moon size={16} />,
      key: "theme",
      label: theme === "dark" ? "ライトテーマに切替" : "ダークテーマに切替",
      onClick: onToggleTheme,
    });
  }

  return createPortal(
    <div
      data-user-menu
      className="bg-surface shadow-overlay fixed z-50 w-64 rounded-[14px] p-1.5"
      style={{
        animation: "pop-in 180ms cubic-bezier(0.23,1,0.32,1) both",
        bottom: position.bottom,
        left: position.left,
        transformOrigin: "bottom left",
      }}
    >
      <GlideMenu
        className="flex flex-col gap-px"
        highlightClassName="inset-x-0 rounded-[8px] bg-hover-2"
      >
        {items.map((item) => (
          <button
            key={item.key}
            data-menu-row
            type="button"
            onClick={run(item.onClick)}
            className="relative z-10 flex h-9 w-full items-center gap-1.5 rounded-[8px] px-2 text-left"
          >
            <span className="text-ink-2 flex size-5 shrink-0 items-center justify-center">
              {item.icon}
            </span>
            <span className="text-ink min-w-0 flex-1 truncate text-[13.5px]">
              {item.label}
            </span>
          </button>
        ))}
        {onSignOut && items.length > 0 && <div className="bg-line my-1 h-px" />}
        {onSignOut && (
          <button
            data-menu-row
            type="button"
            onClick={run(onSignOut)}
            className="relative z-10 flex h-9 w-full items-center gap-1.5 rounded-[8px] px-2 text-left"
          >
            <span className="text-ink-2 flex size-5 shrink-0 items-center justify-center">
              <LogOut size={16} />
            </span>
            <span className="text-ink min-w-0 flex-1 truncate text-[13.5px]">
              サインアウト
            </span>
          </button>
        )}
      </GlideMenu>
    </div>,
    document.body
  );
}

function WorkspaceMenu({
  position,
  onClose,
  workspace,
  workspaces,
  onSwitchWorkspace,
  onNewWorkspace,
  onWorkspaceSettings,
  onConnectors,
  onInvite,
  onSignOut,
  extraMenuItems,
  theme,
  onToggleTheme,
}: Pick<
  SidebarNavProps,
  | "workspace"
  | "workspaces"
  | "onSwitchWorkspace"
  | "onNewWorkspace"
  | "onWorkspaceSettings"
  | "onConnectors"
  | "onInvite"
  | "onSignOut"
  | "extraMenuItems"
  | "theme"
  | "onToggleTheme"
> & {
  position: { top: number; left: number };
  onClose: () => void;
}) {
  const run = (fn?: () => void) => () => {
    onClose();
    fn?.();
  };
  const rows = [
    onNewWorkspace && {
      icon: <Plus size={16} />,
      label: "新しい Org を作成",
      onClick: onNewWorkspace,
    },
    onWorkspaceSettings && {
      icon: <Settings size={16} />,
      label: "Org 設定",
      onClick: onWorkspaceSettings,
    },
    onConnectors && {
      icon: <Plug size={16} />,
      label: "コネクタ",
      onClick: onConnectors,
    },
    onInvite && {
      icon: <UserPlus size={16} />,
      label: "メンバーを招待",
      onClick: onInvite,
    },
  ].filter(Boolean) as {
    label: string;
    icon: ReactNode;
    onClick: () => void;
  }[];

  return createPortal(
    <div
      data-workspace-menu
      className="bg-surface shadow-overlay fixed z-50 w-64 rounded-[14px] p-1.5"
      style={{
        animation: "pop-in 180ms cubic-bezier(0.23,1,0.32,1) both",
        left: position.left,
        top: position.top,
        transformOrigin: "top left",
      }}
    >
      <GlideMenu
        className="flex flex-col gap-px"
        highlightClassName="inset-x-0 rounded-[8px] bg-hover-2"
      >
        {workspaces.map((item) => (
          <button
            key={item.id}
            data-menu-row
            type="button"
            onClick={run(() => onSwitchWorkspace?.(item.id))}
            className="relative z-10 flex h-10 w-full items-center gap-1.5 rounded-[8px] px-2 text-left"
          >
            <span className="bg-accent flex size-6 shrink-0 items-center justify-center rounded-[7px] text-[11px] font-semibold text-white">
              {item.monogram}
            </span>
            <span className="text-ink min-w-0 flex-1 truncate text-[13.5px] font-medium">
              {item.name}
              {item.meta && (
                <span className="text-ink-3 ml-1.5 text-[11.5px] font-normal">
                  {item.meta}
                </span>
              )}
            </span>
            {item.id === workspace.id && (
              <span className="text-ink shrink-0">
                <Check size={16} />
              </span>
            )}
          </button>
        ))}
        {(rows.length > 0 || (extraMenuItems && extraMenuItems.length > 0)) && (
          <div className="bg-line my-1 h-px" />
        )}
        {rows.map((item) => (
          <button
            key={item.label}
            data-menu-row
            type="button"
            onClick={run(item.onClick)}
            className="relative z-10 flex h-9 w-full items-center gap-1.5 rounded-[8px] px-2 text-left"
          >
            <span className="text-ink-2 flex size-5 shrink-0 items-center justify-center">
              {item.icon}
            </span>
            <span className="text-ink min-w-0 flex-1 truncate text-[13.5px]">
              {item.label}
            </span>
          </button>
        ))}
        {extraMenuItems?.map((item) => (
          <button
            key={item.label}
            data-menu-row
            type="button"
            onClick={run(item.onClick)}
            className="relative z-10 flex h-9 w-full items-center gap-1.5 rounded-[8px] px-2 text-left"
          >
            <span className="text-ink-2 flex size-5 shrink-0 items-center justify-center">
              {item.icon}
            </span>
            <span className="text-ink min-w-0 flex-1 truncate text-[13.5px]">
              {item.label}
            </span>
          </button>
        ))}
        <div className="bg-line my-1 h-px" />
        {onToggleTheme && (
          <button
            data-menu-row
            type="button"
            onClick={run(onToggleTheme)}
            className="relative z-10 flex h-9 w-full items-center gap-1.5 rounded-[8px] px-2 text-left"
          >
            <span className="text-ink-2 flex size-5 shrink-0 items-center justify-center">
              {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
            </span>
            <span className="text-ink min-w-0 flex-1 truncate text-[13.5px]">
              {theme === "dark" ? "ライトテーマに切替" : "ダークテーマに切替"}
            </span>
          </button>
        )}
        {onSignOut && (
          <button
            data-menu-row
            type="button"
            onClick={run(onSignOut)}
            className="relative z-10 flex h-9 w-full items-center gap-1.5 rounded-[8px] px-2 text-left"
          >
            <span className="text-ink-2 flex size-5 shrink-0 items-center justify-center">
              <LogOut size={16} />
            </span>
            <span className="text-ink min-w-0 flex-1 truncate text-[13.5px]">
              サインアウト
            </span>
          </button>
        )}
      </GlideMenu>
    </div>,
    document.body
  );
}

export default function SidebarNav({
  workspace,
  workspaces,
  onSwitchWorkspace,
  onNewWorkspace,
  onWorkspaceSettings,
  onConnectors,
  onInvite,
  onSignOut,
  extraMenuItems,
  theme,
  onToggleTheme,
  rail,
  sections,
  activeId,
  onPick,
  onGroupContextMenu,
  onItemContextMenu,
  onItemDragStart,
  onItemDragEnd,
  user,
  className = "",
  fill = false,
  collapsible = true,
}: SidebarNavProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(
    () => new Set()
  );
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const [workspacePosition, setWorkspacePosition] = useState({
    left: 0,
    top: 0,
  });
  const [userOpen, setUserOpen] = useState(false);
  const [userPosition, setUserPosition] = useState({
    bottom: 0,
    left: 0,
  });
  const workspaceButtonRef = useRef<HTMLButtonElement>(null);
  const userButtonRef = useRef<HTMLButtonElement>(null);
  const userEmail = user ? userEmailLine(user) : undefined;

  useEffect(() => {
    if (!workspaceOpen) {
      return;
    }
    const close = (event: PointerEvent) => {
      const target = event.target as Element;
      if (
        !target.closest("[data-workspace-trigger]") &&
        !target.closest("[data-workspace-menu]")
      ) {
        setWorkspaceOpen(false);
      }
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [workspaceOpen]);

  useEffect(() => {
    if (!userOpen) {
      return;
    }
    const close = (event: PointerEvent) => {
      const target = event.target as Element;
      if (
        !target.closest("[data-user-trigger]") &&
        !target.closest("[data-user-menu]")
      ) {
        setUserOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setUserOpen(false);
      }
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", onKey);
    };
  }, [userOpen]);

  const collapse = () => {
    setCollapsed(true);
    setWorkspaceOpen(false);
    setUserOpen(false);
  };

  const toggleGroup = (id: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  return (
    <aside
      data-sidebar-collapsed={collapsed}
      aria-label="Workspace navigation"
      className={`relative flex shrink-0 overflow-hidden transition-[width] ${fill ? "h-full" : "h-[600px]"} ${className}`}
      style={
        {
          "--sidebar-copy-duration": `${SIDEBAR_MOTION.copyDuration}ms`,
          "--sidebar-copy-offset": `${SIDEBAR_MOTION.copyOffset}px`,
          "--sidebar-easing": SIDEBAR_MOTION.easing,
          transitionDuration: `${SIDEBAR_MOTION.duration}ms`,
          transitionTimingFunction: SIDEBAR_MOTION.easing,
          width: collapsed
            ? SIDEBAR_MOTION.collapsedWidth
            : SIDEBAR_MOTION.expandedWidth,
        } as CSSProperties
      }
    >
      <div className="flex min-h-0 w-[224px] shrink-0 flex-col">
        {/* workspace switcher + collapse */}
        <div className="relative mb-2.5 h-10 shrink-0">
          <button
            ref={workspaceButtonRef}
            data-workspace-trigger
            type="button"
            aria-expanded={workspaceOpen}
            aria-hidden={collapsed}
            tabIndex={collapsed ? -1 : 0}
            onClick={() => {
              setUserOpen(false);
              if (!workspaceOpen && workspaceButtonRef.current) {
                const rect = workspaceButtonRef.current.getBoundingClientRect();
                setWorkspacePosition({ left: rect.left, top: rect.bottom + 6 });
              }
              setWorkspaceOpen((open) => !open);
            }}
            className={`sidebar-workspace-control hover:bg-hover-2 absolute top-1 left-2 flex h-8 items-center rounded-[8px] px-1.5 text-left transition-[background-color,transform] duration-100 active:scale-[0.99] ${
              collapsible ? "right-[52px]" : "right-2"
            }`}
          >
            <span className="sidebar-logo bg-accent flex size-5 shrink-0 items-center justify-center rounded-[6px] text-[10.5px] font-semibold text-white">
              {workspace.monogram}
            </span>
            <span className="sidebar-copy text-ink ml-1.5 min-w-0 flex-1 truncate text-[14px] font-medium">
              {workspace.name}
            </span>
            <span className="sidebar-copy text-ink-3 ml-1 flex shrink-0">
              <ChevronDown size={15} />
            </span>
          </button>

          {workspaceOpen && (
            <WorkspaceMenu
              position={workspacePosition}
              onClose={() => setWorkspaceOpen(false)}
              workspace={workspace}
              workspaces={workspaces}
              onSwitchWorkspace={onSwitchWorkspace}
              onNewWorkspace={onNewWorkspace}
              onWorkspaceSettings={onWorkspaceSettings}
              onConnectors={onConnectors}
              onInvite={onInvite}
              onSignOut={onSignOut}
              extraMenuItems={extraMenuItems}
              theme={theme}
              onToggleTheme={onToggleTheme}
            />
          )}

          {collapsible && (
            <>
              <button
                type="button"
                aria-label="サイドバーを閉じる"
                aria-hidden={collapsed}
                tabIndex={collapsed ? -1 : 0}
                onClick={collapse}
                className="sidebar-collapse-control text-ink-3 hover:bg-hover-2 hover:text-ink absolute top-1 right-2 flex size-8 items-center justify-center rounded-[8px] transition-[opacity,background-color,color] duration-150"
              >
                <PanelLeft size={17} />
              </button>
              <button
                type="button"
                aria-label="サイドバーを開く"
                aria-hidden={!collapsed}
                tabIndex={collapsed ? 0 : -1}
                onClick={() => setCollapsed(false)}
                className="sidebar-expand-control text-ink-3 hover:bg-hover-2 hover:text-ink absolute top-0.5 left-2 flex size-9 items-center justify-center rounded-[8px] transition-[opacity,background-color,color] duration-150"
              >
                <PanelLeft size={17} />
              </button>
            </>
          )}
        </div>

        {/* primary rail */}
        <GlideGroup>
          {rail.map((item) => (
            <RailButton
              key={item.key}
              icon={item.icon}
              label={item.label}
              count={item.count}
              active={item.active}
              disabled={item.disabled}
              hint={item.hint}
              onClick={item.onClick}
            />
          ))}
        </GlideGroup>

        {/* Projects → Chats */}
        <div className="mt-3 min-h-0 flex-1 overflow-y-auto">
          {sections.map((section) => (
            <section
              key={section.id}
              data-sidebar-section={section.id}
              className="mb-2"
              aria-label={section.label}
            >
              <div className="sidebar-copy text-ink-3 mx-2 mb-1 px-2 text-[11px] font-medium tracking-[0.04em]">
                {section.label}
              </div>
              {section.groups.map((group) => {
                const open = !collapsedGroups.has(group.id);
                return (
                  <div key={group.id} className="mb-1">
                    <div className="relative">
                      <button
                        type="button"
                        aria-expanded={open}
                        aria-controls={`sidebar-group-${group.id}`}
                        onClick={() => toggleGroup(group.id)}
                        onContextMenu={(event) => {
                          event.preventDefault();
                          onGroupContextMenu?.(group.id, event);
                        }}
                        className="sidebar-row hover:bg-hover-2 relative z-10 mx-2 flex h-8 items-center rounded-[8px] px-2 text-left transition-[width,background-color,color,transform] duration-150 active:scale-[0.98]"
                      >
                        <span className="text-ink-3 flex size-5 shrink-0 items-center justify-center">
                          <ChevronDown
                            size={15}
                            className={`transition-transform duration-150 ${open ? "" : "-rotate-90"}`}
                          />
                        </span>
                        {group.icon && (
                          <span className="text-ink-3 flex size-5 shrink-0 items-center justify-center">
                            {group.icon}
                          </span>
                        )}
                        <span
                          className={`sidebar-copy text-ink-2 ml-1.5 min-w-0 flex-1 truncate text-[13.5px] font-medium ${group.onAdd ? "pr-7" : ""}`}
                        >
                          {group.label}
                        </span>
                      </button>
                      {group.onAdd && (
                        <button
                          type="button"
                          aria-label={group.addLabel ?? "追加"}
                          title={group.addLabel ?? "追加"}
                          onClick={group.onAdd}
                          className="text-ink-3 hover:bg-hover-2 hover:text-ink absolute top-1 right-3 z-20 flex size-6 items-center justify-center rounded-[6px] transition-[background-color,color,transform] duration-150 active:scale-[0.94]"
                        >
                          <Plus size={14} />
                        </button>
                      )}
                    </div>
                    {open && (
                      <div id={`sidebar-group-${group.id}`}>
                        <GlideGroup>
                          {group.items.map((item) => {
                            const active = item.id === activeId;
                            return (
                              <button
                                key={item.id}
                                data-row
                                type="button"
                                title={item.label}
                                draggable
                                onClick={() => onPick?.(item.id)}
                                onContextMenu={(event) => {
                                  event.preventDefault();
                                  onItemContextMenu?.(item.id, event);
                                }}
                                onDragStart={(event) => {
                                  onItemDragStart?.(item.id, event);
                                }}
                                onDragEnd={onItemDragEnd}
                                className={`sidebar-row relative z-10 mx-2 flex h-8 items-center rounded-[8px] px-2 text-left transition-[width,background-color,color,transform] duration-150 active:scale-[0.98] ${
                                  active
                                    ? "bg-active text-active-ink group-hover/glide:bg-transparent"
                                    : ""
                                }`}
                              >
                                <span
                                  className={`flex size-5 shrink-0 items-center justify-center ${active ? "text-active-ink" : "text-ink-3"}`}
                                >
                                  {item.icon}
                                </span>
                                <span
                                  className={`sidebar-copy ml-1.5 min-w-0 flex-1 truncate text-[13.5px] font-medium ${active ? "text-active-ink" : "text-ink-2"}`}
                                >
                                  {item.label}
                                </span>
                                {item.meta && (
                                  <span
                                    className={`sidebar-copy ml-1 shrink-0 text-[11px] ${active ? "text-active-ink/80" : "text-ink-3"}`}
                                  >
                                    {item.meta}
                                  </span>
                                )}
                              </button>
                            );
                          })}
                          {group.items.length === 0 && group.emptyHint && (
                            <div className="sidebar-copy text-ink-3 mx-2 px-2 py-1.5 text-[12px] leading-[1.5]">
                              {group.emptyHint}
                            </div>
                          )}
                        </GlideGroup>
                      </div>
                    )}
                  </div>
                );
              })}
            </section>
          ))}
        </div>

        {user && (
          <div className="border-line mt-auto shrink-0 border-t pt-2 pb-2">
            <button
              ref={userButtonRef}
              data-user-trigger
              type="button"
              aria-expanded={userOpen}
              aria-haspopup="menu"
              aria-label={`${user.name} のアカウントメニュー`}
              title={userEmail ? `${user.name} · ${userEmail}` : user.name}
              onClick={() => {
                setWorkspaceOpen(false);
                if (!userOpen && userButtonRef.current) {
                  const rect = userButtonRef.current.getBoundingClientRect();
                  setUserPosition({
                    bottom: window.innerHeight - rect.top + 6,
                    left: rect.left,
                  });
                }
                setUserOpen((open) => !open);
              }}
              className={`sidebar-row hover:bg-hover-2 mx-2 flex h-10 items-center overflow-hidden rounded-[8px] px-2 text-left transition-[width,background-color,color,transform] duration-150 active:scale-[0.98] ${
                userOpen ? "bg-hover-2" : ""
              }`}
            >
              <UserAvatar key={user.image ?? user.name} user={user} />
              <span className="sidebar-copy ml-1.5 min-w-0 flex-1">
                <span className="text-ink block truncate text-[13px] leading-tight font-medium">
                  {user.name}
                </span>
                {userEmail && (
                  <span className="text-ink-3 block truncate text-[11px] leading-tight">
                    {userEmail}
                  </span>
                )}
              </span>
              <span className="sidebar-copy text-ink-3 ml-1 flex shrink-0">
                <ChevronUp size={15} />
              </span>
            </button>
            {userOpen && (
              <UserMenu
                position={userPosition}
                onClose={() => setUserOpen(false)}
                onSettings={onWorkspaceSettings}
                onConnectors={onConnectors}
                onSignOut={onSignOut}
                theme={theme}
                onToggleTheme={onToggleTheme}
              />
            )}
          </div>
        )}
      </div>
    </aside>
  );
}
