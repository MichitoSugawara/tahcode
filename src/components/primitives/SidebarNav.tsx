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
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
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

export type SidebarWorkspace = {
  id: string;
  name: string;
  monogram: string;
  meta?: string;
  current?: boolean;
};

export type SidebarRailItem = {
  key: string;
  label: string;
  icon: ReactNode;
  count?: string;
  active?: boolean;
  disabled?: boolean;
  hint?: string;
  onClick?: () => void;
};

export type SidebarItem = {
  id: string;
  label: string;
  meta?: string;
  icon?: ReactNode;
};

export type SidebarGroup = {
  id: string;
  label: string;
  icon?: ReactNode;
  items: SidebarItem[];
  emptyHint?: string;
  addLabel?: string;
  onAdd?: () => void;
};

type SidebarNavProps = {
  /** product wordmark rendered above the workspace switcher */
  brand?: { mark: ReactNode; name: string; badge?: string };
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
};

const SIDEBAR_MOTION = {
  expandedWidth: 224,
  collapsedWidth: 52,
  duration: 280,
  copyDuration: 180,
  copyOffset: 8,
  easing: "cubic-bezier(0.16, 1, 0.3, 1)",
};

/* ─────────────────────────────────────────────────────────
 * CHAT SEARCH STORYBOARD
 *
 *   0ms   search is triggered; group label begins fading
 *   0ms   field grows right → left from the search control
 * 180ms   field fills the row; cursor is focused and ready
 * ───────────────────────────────────────────────────────── */
const CHAT_SEARCH_MOTION = {
  duration: 180,
  closedWidth: 28,
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
      className={`sidebar-row relative z-10 mx-2 flex h-8 items-center rounded-[8px] px-2 text-left
        transition-[width,background-color,color,transform] duration-150 active:scale-[0.98]
        disabled:opacity-45 disabled:active:scale-100
        ${active ? "bg-active text-active-ink group-hover/glide:bg-transparent" : ""}`}
    >
      <span className={`flex size-5 shrink-0 items-center justify-center ${active ? "text-active-ink" : "text-ink-2"}`}>
        {icon}
      </span>
      <span className={`sidebar-copy ml-1.5 min-w-0 flex-1 truncate text-[13.5px] font-medium ${active ? "text-active-ink" : "text-ink-2"}`}>
        {label}
      </span>
      {count && (
        <span className={`sidebar-copy mr-1 shrink-0 text-[12px] font-medium tabular-nums ${active ? "text-active-ink/80" : "text-ink-3"}`}>
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
    onNewWorkspace && { label: "新しい Org を作成", icon: <Plus size={16} />, onClick: onNewWorkspace },
    onWorkspaceSettings && { label: "Org 設定", icon: <Settings size={16} />, onClick: onWorkspaceSettings },
    onInvite && { label: "メンバーを招待", icon: <UserPlus size={16} />, onClick: onInvite },
  ].filter(Boolean) as { label: string; icon: ReactNode; onClick: () => void }[];

  return createPortal(
    <div
      data-workspace-menu
      className="fixed z-50 w-64 rounded-[14px] bg-surface p-1.5 shadow-overlay"
      style={{
        top: position.top,
        left: position.left,
        animation: "pop-in 180ms cubic-bezier(0.23,1,0.32,1) both",
        transformOrigin: "top left",
      }}
    >
      <GlideMenu className="flex flex-col gap-px" highlightClassName="inset-x-0 rounded-[8px] bg-hover-2">
        {workspaces.map((item) => (
          <button
            key={item.id}
            data-menu-row
            type="button"
            onClick={run(() => onSwitchWorkspace?.(item.id))}
            className="relative z-10 flex h-10 w-full items-center gap-1.5 rounded-[8px] px-2 text-left"
          >
            <span className="flex size-6 shrink-0 items-center justify-center rounded-[7px] bg-accent text-[11px] font-semibold text-white">
              {item.monogram}
            </span>
            <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium text-ink">
              {item.name}
              {item.meta && <span className="ml-1.5 text-[11.5px] font-normal text-ink-3">{item.meta}</span>}
            </span>
            {item.id === workspace.id && (
              <span className="shrink-0 text-ink">
                <Check size={16} />
              </span>
            )}
          </button>
        ))}
        {rows.length > 0 && <div className="my-1 h-px bg-line" />}
        {rows.map((item) => (
          <button
            key={item.label}
            data-menu-row
            type="button"
            onClick={run(item.onClick)}
            className="relative z-10 flex h-9 w-full items-center gap-1.5 rounded-[8px] px-2 text-left"
          >
            <span className="flex size-5 shrink-0 items-center justify-center text-ink-2">{item.icon}</span>
            <span className="min-w-0 flex-1 truncate text-[13.5px] text-ink">{item.label}</span>
          </button>
        ))}
        <div className="my-1 h-px bg-line" />
        {onToggleTheme && (
          <button
            data-menu-row
            type="button"
            onClick={run(onToggleTheme)}
            className="relative z-10 flex h-9 w-full items-center gap-1.5 rounded-[8px] px-2 text-left"
          >
            <span className="flex size-5 shrink-0 items-center justify-center text-ink-2">
              {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
            </span>
            <span className="min-w-0 flex-1 truncate text-[13.5px] text-ink">
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
            <span className="flex size-5 shrink-0 items-center justify-center text-ink-2">
              <LogOut size={16} />
            </span>
            <span className="min-w-0 flex-1 truncate text-[13.5px] text-ink">サインアウト</span>
          </button>
        )}
      </GlideMenu>
    </div>,
    document.body,
  );
}

export default function SidebarNav({
  brand,
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
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const [workspacePosition, setWorkspacePosition] = useState({ top: 0, left: 0 });
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const workspaceButtonRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const needle = query.trim().toLowerCase();
  const visibleGroups = groups
    .map((group) => ({
      ...group,
      items: needle ? group.items.filter((item) => item.label.toLowerCase().includes(needle)) : group.items,
    }))
    .filter((group) => !needle || group.items.length > 0);
  const nothingFound = needle.length > 0 && visibleGroups.length === 0;

  useEffect(() => {
    if (!workspaceOpen) return;
    const close = (event: PointerEvent) => {
      const target = event.target as Element;
      if (!target.closest("[data-workspace-trigger]") && !target.closest("[data-workspace-menu]")) {
        setWorkspaceOpen(false);
      }
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [workspaceOpen]);

  useEffect(() => {
    if (searchOpen) searchRef.current?.focus();
  }, [searchOpen]);

  const collapse = () => {
    setCollapsed(true);
    setWorkspaceOpen(false);
    setSearchOpen(false);
    setQuery("");
  };

  return (
    <aside
      data-sidebar-collapsed={collapsed}
      aria-label="Workspace navigation"
      className={`relative flex shrink-0 overflow-hidden transition-[width] ${fill ? "h-full" : "h-[600px]"} ${className}`}
      style={
        {
          width: collapsed ? SIDEBAR_MOTION.collapsedWidth : SIDEBAR_MOTION.expandedWidth,
          transitionDuration: `${SIDEBAR_MOTION.duration}ms`,
          transitionTimingFunction: SIDEBAR_MOTION.easing,
          "--sidebar-copy-duration": `${SIDEBAR_MOTION.copyDuration}ms`,
          "--sidebar-copy-offset": `${SIDEBAR_MOTION.copyOffset}px`,
          "--sidebar-easing": SIDEBAR_MOTION.easing,
        } as CSSProperties
      }
    >
      <div className="flex min-h-0 w-[224px] shrink-0 flex-col">
        {brand && (
          <div className="relative mb-1 flex h-7 shrink-0 items-center pl-4">
            <span className="flex size-5 shrink-0 items-center justify-center">{brand.mark}</span>
            <span className="sidebar-copy ml-2 text-[13px] font-semibold tracking-[-0.02em] text-ink">{brand.name}</span>
            {brand.badge && <span className="sidebar-copy ml-1.5 rounded-full bg-accent-tint px-1.5 py-px text-[10px] font-medium text-accent-ink">{brand.badge}</span>}
          </div>
        )}
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
                setWorkspacePosition({ top: rect.bottom + 6, left: rect.left });
              }
              setWorkspaceOpen((open) => !open);
            }}
            className="sidebar-workspace-control absolute left-2 top-1 flex h-8 w-[164px] items-center rounded-[8px] px-1.5 text-left transition-[background-color,transform] duration-100 hover:bg-hover-2 active:scale-[0.99]"
          >
            <span className="sidebar-logo flex size-5 shrink-0 items-center justify-center rounded-[6px] bg-accent text-[10.5px] font-semibold text-white">
              {workspace.monogram}
            </span>
            <span className="sidebar-copy ml-1.5 min-w-0 flex-1 truncate text-[14px] font-medium text-ink">
              {workspace.name}
            </span>
            <span className="sidebar-copy ml-1 flex shrink-0 text-ink-3">
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
                className="sidebar-collapse-control absolute right-2 top-1 flex size-8 items-center justify-center rounded-[8px] text-ink-3 transition-[opacity,background-color,color] duration-150 hover:bg-hover-2 hover:text-ink"
              >
                <PanelLeft size={17} />
              </button>
              <button
                type="button"
                aria-label="サイドバーを開く"
                aria-hidden={!collapsed}
                tabIndex={collapsed ? 0 : -1}
                onClick={() => setCollapsed(false)}
                className="sidebar-expand-control absolute left-2 top-0.5 flex size-9 items-center justify-center rounded-[8px] text-ink-3 transition-[opacity,background-color,color] duration-150 hover:bg-hover-2 hover:text-ink"
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
              className={`absolute inset-0 flex items-center gap-1.5 px-2 text-[12.5px] font-medium text-ink-3 transition-[opacity,transform] ${searchOpen ? "pointer-events-none -translate-x-1 opacity-0" : "translate-x-0 opacity-100"}`}
              style={{ transitionDuration: `${CHAT_SEARCH_MOTION.duration}ms`, transitionTimingFunction: CHAT_SEARCH_MOTION.easing }}
            >
              <ChevronDown size={15} />
              <span>{groupsLabel}</span>
            </div>

            {onAddGroup && (
              <button
                type="button"
                aria-label={addGroupLabel}
                title={addGroupLabel}
                onClick={onAddGroup}
                className={`absolute right-8 top-0 z-10 flex size-8 items-center justify-center rounded-[8px] text-ink-3 transition-[opacity,background-color,color,transform] hover:bg-hover-2 hover:text-ink active:scale-[0.96] ${searchOpen ? "pointer-events-none opacity-0" : "opacity-100"}`}
                style={{ transitionDuration: `${CHAT_SEARCH_MOTION.duration}ms` }}
              >
                <Plus size={15} />
              </button>
            )}
            <button
              type="button"
              aria-label="チャットを検索"
              aria-expanded={searchOpen}
              onClick={() => setSearchOpen(true)}
              className={`absolute right-0 top-0 z-10 flex size-8 items-center justify-center rounded-[8px] text-ink-3 transition-[opacity,background-color,color,transform] hover:bg-hover-2 hover:text-ink active:scale-[0.96] ${searchOpen ? "pointer-events-none opacity-0" : "opacity-100"}`}
              style={{ transitionDuration: `${CHAT_SEARCH_MOTION.duration}ms` }}
            >
              <Search size={15} />
            </button>

            <div
              className={`absolute right-0 top-0 z-20 flex h-8 items-center overflow-hidden rounded-[8px] bg-field text-ink-3 shadow-hairline transition-[width,opacity] focus-within:text-ink-2 ${searchOpen ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"}`}
              style={{
                width: searchOpen ? "100%" : CHAT_SEARCH_MOTION.closedWidth,
                transitionDuration: `${CHAT_SEARCH_MOTION.duration}ms`,
                transitionTimingFunction: CHAT_SEARCH_MOTION.easing,
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
                className="ml-1.5 min-w-0 flex-1 bg-transparent text-[13px] font-medium text-ink outline-none placeholder:text-ink-3"
              />
              <button
                type="button"
                aria-label="検索を閉じる"
                onClick={() => {
                  setSearchOpen(false);
                  setQuery("");
                }}
                className="flex size-8 shrink-0 items-center justify-center rounded-[8px] text-ink-3 transition-[background-color,color,transform] duration-150 hover:bg-hover-2 hover:text-ink active:scale-[0.96]"
              >
                <X size={15} />
              </button>
            </div>
          </div>

          {visibleGroups.map((group) => (
            <div key={group.id} className="mb-2">
              <div className="sidebar-copy mx-2 flex h-7 items-center gap-1.5 px-2">
                {group.icon && <span className="flex shrink-0 text-ink-3">{group.icon}</span>}
                <span className="min-w-0 flex-1 truncate text-[11.5px] font-semibold uppercase tracking-[0.08em] text-ink-3">
                  {group.label}
                </span>
                {group.onAdd && (
                  <button
                    type="button"
                    aria-label={group.addLabel ?? "追加"}
                    title={group.addLabel ?? "追加"}
                    onClick={group.onAdd}
                    className="-mr-1.5 flex size-6 items-center justify-center rounded-[6px] text-ink-3 transition-[background-color,color,transform] duration-150 hover:bg-hover-2 hover:text-ink active:scale-[0.94]"
                  >
                    <Plus size={14} />
                  </button>
                )}
              </div>
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
                        active ? "bg-active text-active-ink group-hover/glide:bg-transparent" : ""
                      }`}
                    >
                      <span className={`flex size-5 shrink-0 items-center justify-center ${active ? "text-active-ink" : "text-ink-3"}`}>
                        {item.icon}
                      </span>
                      <span className={`sidebar-copy ml-1.5 min-w-0 flex-1 truncate text-[13.5px] font-medium ${active ? "text-active-ink" : "text-ink-2"}`}>
                        {item.label}
                      </span>
                      {item.meta && (
                        <span className={`sidebar-copy ml-1 shrink-0 text-[11px] ${active ? "text-active-ink/80" : "text-ink-3"}`}>
                          {item.meta}
                        </span>
                      )}
                    </button>
                  );
                })}
                {group.items.length === 0 && group.emptyHint && (
                  <div className="sidebar-copy mx-2 px-2 py-1.5 text-[12px] leading-[1.5] text-ink-3">{group.emptyHint}</div>
                )}
              </GlideGroup>
            </div>
          ))}
          {nothingFound && (
            <div className="sidebar-copy mx-2 px-2 py-2 text-[12.5px] text-ink-3">「{query}」に一致するチャットはありません</div>
          )}
        </div>

        {footerLabel && (
          <div className="sidebar-copy mx-2 mt-3 w-[208px] border-t border-line pt-3">
            <button
              type="button"
              onClick={onFooterClick}
              className={`flex h-8 w-full items-center justify-center gap-1.5 rounded-control text-[12.5px] font-medium transition-[background-color,transform] duration-150 active:scale-[0.98] ${
                footerTone === "accent"
                  ? "bg-btn text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.14)] hover:bg-btn-hover"
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
