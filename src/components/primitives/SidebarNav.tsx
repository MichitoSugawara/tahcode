import {
  Check,
  ChevronDown,
  LogOut,
  Moon,
  PanelLeft,
  Plus,
  Search,
  Settings,
  Sun,
  UserPlus,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { createPortal } from "react-dom";

import GlideMenu from "@/components/primitives/GlideMenu";

/* ─────────────────────────────────────────────────────────
 * SIDEBAR NAV — ported from Beautiful UI (beautifului.dev/r/sidebar-nav)
 * Compact workspace switcher, primary rail, searchable grouped
 * chat tree, and a collapse that preserves icon alignment.
 *
 * Changes from the registry copy: data-driven (workspaces, rail,
 * groups come in as props), lucide-react glyphs instead of the
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

interface SidebarNavProps {
  workspace: SidebarWorkspace;
  workspaces: SidebarWorkspace[];
  onSwitchWorkspace?: (id: string) => void;
  onNewWorkspace?: () => void;
  onWorkspaceSettings?: () => void;
  onInvite?: () => void;
  onSignOut?: () => void;
  theme?: "dark" | "light";
  onToggleTheme?: () => void;
  rail: SidebarRailItem[];
  groups: SidebarGroup[];
  groupsLabel?: string;
  /** "+" beside the group label row (e.g. new project) */
  onAddGroup?: () => void;
  addGroupLabel?: string;
  activeId?: string | null;
  onPick?: (id: string) => void;
  footerLabel?: string;
  footerIcon?: ReactNode;
  footerTone?: "neutral" | "accent";
  onFooterClick?: () => void;
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

/* ─────────────────────────────────────────────────────────
 * CHAT SEARCH STORYBOARD
 *
 *   0ms   search is triggered; group label begins fading
 *   0ms   field grows right → left from the search control
 * 180ms   field fills the row; cursor is focused and ready
 * ───────────────────────────────────────────────────────── */
const CHAT_SEARCH_MOTION = {
  closedWidth: 28,
  duration: 180,
  easing: "cubic-bezier(0.16, 1, 0.3, 1)",
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

function WorkspaceMenu({
  position,
  onClose,
  workspace,
  workspaces,
  onSwitchWorkspace,
  onNewWorkspace,
  onWorkspaceSettings,
  onInvite,
  onSignOut,
  theme,
  onToggleTheme,
}: Pick<
  SidebarNavProps,
  | "workspace"
  | "workspaces"
  | "onSwitchWorkspace"
  | "onNewWorkspace"
  | "onWorkspaceSettings"
  | "onInvite"
  | "onSignOut"
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
        {rows.length > 0 && <div className="bg-line my-1 h-px" />}
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
  onInvite,
  onSignOut,
  theme,
  onToggleTheme,
  rail,
  groups,
  groupsLabel = "Chats",
  onAddGroup,
  addGroupLabel = "追加",
  activeId,
  onPick,
  footerLabel,
  footerIcon,
  footerTone = "neutral",
  onFooterClick,
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
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const workspaceButtonRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const needle = query.trim().toLowerCase();
  const visibleGroups = groups
    .map((group) => ({
      ...group,
      items: needle
        ? group.items.filter((item) =>
            item.label.toLowerCase().includes(needle)
          )
        : group.items,
    }))
    .filter((group) => !needle || group.items.length > 0);
  const nothingFound = needle.length > 0 && visibleGroups.length === 0;

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
    if (searchOpen) {
      searchRef.current?.focus();
    }
  }, [searchOpen]);

  const collapse = () => {
    setCollapsed(true);
    setWorkspaceOpen(false);
    setSearchOpen(false);
    setQuery("");
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
              onInvite={onInvite}
              onSignOut={onSignOut}
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

        {/* grouped tree + search */}
        <div className="mt-3 min-h-0 flex-1 overflow-y-auto">
          <div className="sidebar-copy relative mx-2 mb-1 h-8">
            <div
              aria-hidden={searchOpen}
              className={`text-ink-2 absolute inset-0 flex items-center px-2 text-[13.5px] font-medium transition-[opacity,transform] ${searchOpen ? "pointer-events-none -translate-x-1 opacity-0" : "translate-x-0 opacity-100"}`}
              style={{
                transitionDuration: `${CHAT_SEARCH_MOTION.duration}ms`,
                transitionTimingFunction: CHAT_SEARCH_MOTION.easing,
              }}
            >
              <span className="text-ink-3 flex size-5 shrink-0 items-center justify-center">
                <ChevronDown size={15} />
              </span>
              <span className="ml-1.5">{groupsLabel}</span>
            </div>

            {onAddGroup && (
              <button
                type="button"
                aria-label={addGroupLabel}
                title={addGroupLabel}
                onClick={onAddGroup}
                className={`text-ink-3 hover:bg-hover-2 hover:text-ink absolute top-0 right-8 z-10 flex size-8 items-center justify-center rounded-[8px] transition-[opacity,background-color,color,transform] active:scale-[0.96] ${searchOpen ? "pointer-events-none opacity-0" : "opacity-100"}`}
                style={{
                  transitionDuration: `${CHAT_SEARCH_MOTION.duration}ms`,
                }}
              >
                <Plus size={15} />
              </button>
            )}
            <button
              type="button"
              aria-label="チャットを検索"
              aria-expanded={searchOpen}
              onClick={() => setSearchOpen(true)}
              className={`text-ink-3 hover:bg-hover-2 hover:text-ink absolute top-0 right-0 z-10 flex size-8 items-center justify-center rounded-[8px] transition-[opacity,background-color,color,transform] active:scale-[0.96] ${searchOpen ? "pointer-events-none opacity-0" : "opacity-100"}`}
              style={{ transitionDuration: `${CHAT_SEARCH_MOTION.duration}ms` }}
            >
              <Search size={15} />
            </button>

            <div
              className={`bg-field text-ink-3 shadow-hairline focus-within:text-ink-2 absolute top-0 right-0 z-20 flex h-8 items-center overflow-hidden rounded-[8px] transition-[width,opacity] ${searchOpen ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"}`}
              style={{
                transitionDuration: `${CHAT_SEARCH_MOTION.duration}ms`,
                transitionTimingFunction: CHAT_SEARCH_MOTION.easing,
                width: searchOpen ? "100%" : CHAT_SEARCH_MOTION.closedWidth,
              }}
            >
              <span className="ml-2 flex shrink-0 items-center justify-center">
                <Search size={14} />
              </span>
              <input
                ref={searchRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    setSearchOpen(false);
                    setQuery("");
                  }
                }}
                placeholder="チャットを検索"
                aria-label="チャット履歴を検索"
                className="text-ink placeholder:text-ink-3 ml-1.5 min-w-0 flex-1 bg-transparent text-[13px] font-medium outline-none"
              />
              <button
                type="button"
                aria-label="検索を閉じる"
                onClick={() => {
                  setSearchOpen(false);
                  setQuery("");
                }}
                className="text-ink-3 hover:bg-hover-2 hover:text-ink flex size-8 shrink-0 items-center justify-center rounded-[8px] transition-[background-color,color,transform] duration-150 active:scale-[0.96]"
              >
                <X size={15} />
              </button>
            </div>
          </div>

          {visibleGroups.map((group) => {
            const open = needle.length > 0 || !collapsedGroups.has(group.id);
            return (
              <div key={group.id} className="mb-2">
                <div className="relative">
                  <button
                    type="button"
                    aria-expanded={open}
                    aria-controls={`sidebar-group-${group.id}`}
                    onClick={() => toggleGroup(group.id)}
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
                            onClick={() => onPick?.(item.id)}
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
          {nothingFound && (
            <div className="sidebar-copy text-ink-3 mx-2 px-2 py-2 text-[12.5px]">
              「{query}」に一致するチャットはありません
            </div>
          )}
        </div>

        {footerLabel && (
          <div className="sidebar-copy border-line mx-2 mt-3 w-[208px] border-t pt-3">
            <button
              type="button"
              onClick={onFooterClick}
              className={`rounded-control flex h-8 w-full items-center justify-center gap-1.5 text-[12.5px] font-medium transition-[background-color,transform] duration-150 active:scale-[0.98] ${
                footerTone === "accent"
                  ? "bg-btn hover:bg-btn-hover text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.14)]"
                  : "bg-hover-2 text-ink hover:bg-line-strong"
              }`}
            >
              {footerIcon}
              {footerLabel}
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
