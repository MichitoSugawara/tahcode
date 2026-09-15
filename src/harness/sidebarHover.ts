import type { SidebarSectionId } from "@/harness/sidebarModel";

export const SIDEBAR_MORE_TRIGGER = "[data-sidebar-more]";

export function sidebarHoverActionsVisible(input: {
  collapsed?: boolean;
  focusWithin: boolean;
  hovered: boolean;
  menuOpen: boolean;
}): boolean {
  if (input.collapsed) {
    return false;
  }
  return input.hovered || input.focusWithin || input.menuOpen;
}

export function projectPeekPath(
  project: {
    cwd?: string;
    folders?: readonly { cwd: string; runtimeId: string }[];
  },
  runtimeId?: string | null
): string | undefined {
  const folders = project.folders ?? [];
  if (runtimeId) {
    const mapped = folders.find(
      (folder) => String(folder.runtimeId) === String(runtimeId)
    );
    const mappedPath = mapped?.cwd.trim();
    if (mappedPath) {
      return mappedPath;
    }
  }
  const first = folders.find((folder) => folder.cwd.trim().length > 0);
  const path = first?.cwd.trim() || project.cwd?.trim();
  return path && path.length > 0 ? path : undefined;
}

export function projectChatCountLabel(count: number): string {
  return `${count}件のチャット`;
}

type MenuAnchorNode = {
  closest: (selector: string) => unknown;
  getBoundingClientRect: () => { right: number; top: number };
};

function isMenuAnchorNode(value: unknown): value is MenuAnchorNode {
  return (
    typeof value === "object" &&
    value !== null &&
    "closest" in value &&
    typeof (value as MenuAnchorNode).closest === "function" &&
    "getBoundingClientRect" in value &&
    typeof (value as MenuAnchorNode).getBoundingClientRect === "function"
  );
}

export function isSidebarMoreTrigger(target: unknown): boolean {
  return (
    typeof target === "object" &&
    target !== null &&
    "closest" in target &&
    typeof (target as MenuAnchorNode).closest === "function" &&
    Boolean((target as MenuAnchorNode).closest(SIDEBAR_MORE_TRIGGER))
  );
}

export function menuAnchorPosition(event: {
  clientX: number;
  clientY: number;
  currentTarget: unknown;
}): { x: number; y: number } {
  if (
    isMenuAnchorNode(event.currentTarget) &&
    isSidebarMoreTrigger(event.currentTarget)
  ) {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: rect.right + 4, y: rect.top };
  }
  return { x: event.clientX, y: event.clientY };
}

export function isSidebarSectionId(value: string): value is SidebarSectionId {
  return value === "projects" || value === "chats";
}
