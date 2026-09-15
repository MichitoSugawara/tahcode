import { canRenameChat } from "@shared/access.ts";
import type { ChatKind } from "@shared/chatKind.ts";

import { SIDEBAR_MORE_TRIGGER } from "@/harness/sidebarHover";
import type { SidebarSectionId } from "@/harness/sidebarModel";
import { shouldDismissComposerMenu } from "@/lib/composerMenu";

export const CONTEXT_MENU_ROOT = "[data-context-menu]";
export const CONTEXT_MENU_KEEP_OPEN = [
  CONTEXT_MENU_ROOT,
  SIDEBAR_MORE_TRIGGER,
] as const;

export interface ContextMenuSpec {
  danger?: boolean;
  disabled?: boolean;
  disabledReason?: string;
  key: string;
  label: string;
}

export function shouldDismissContextMenu(target: unknown): boolean {
  return shouldDismissComposerMenu(target, CONTEXT_MENU_KEEP_OPEN);
}

export function firstEnabledMenuIndex(
  items: readonly { disabled?: boolean }[]
): number {
  const index = items.findIndex((item) => !item.disabled);
  return index === -1 ? 0 : index;
}

export function nextEnabledMenuIndex(
  items: readonly { disabled?: boolean }[],
  current: number,
  delta: 1 | -1
): number {
  const enabled = items.flatMap((item, index) =>
    item.disabled ? [] : [index]
  );
  if (enabled.length === 0) {
    return current;
  }
  const pos = enabled.indexOf(current);
  const from = pos === -1 && delta === 1 ? -1 : Math.max(pos, 0);
  const nextPos = (from + delta + enabled.length) % enabled.length;
  return enabled[nextPos] ?? current;
}

export function buildProjectMenuItems(): ContextMenuSpec[] {
  return [
    { key: "settings", label: "プロジェクトを編集" },
    { key: "rename", label: "名前を変更" },
    { danger: true, key: "delete", label: "削除" },
  ];
}

export function buildSectionMenuItems(
  sectionId: SidebarSectionId
): ContextMenuSpec[] {
  if (sectionId === "projects") {
    return [{ key: "create", label: "新しいプロジェクト" }];
  }
  return [{ key: "create", label: "新しいチャット" }];
}

export function buildSessionMenuItems(kind: ChatKind): ContextMenuSpec[] {
  const rename = canRenameChat(kind);
  const canDelete = kind !== "dm";
  return [
    { key: "open", label: "開く" },
    { key: "background", label: "バックグラウンドでタブを開く" },
    { key: "copy", label: "リンクをコピー" },
    {
      disabled: !rename,
      disabledReason: rename ? undefined : "Personal DM の名前は変更できません",
      key: "rename",
      label: "名前を変更",
    },
    {
      danger: true,
      disabled: !canDelete,
      disabledReason: canDelete ? undefined : "Personal DM は削除できません",
      key: "delete",
      label: "削除",
    },
  ];
}

export function buildTabMenuItems(input: {
  canCloseOthers: boolean;
  canCloseRight: boolean;
  kind: ChatKind;
}): ContextMenuSpec[] {
  const rename = canRenameChat(input.kind);
  return [
    { key: "close", label: "閉じる" },
    {
      disabled: !input.canCloseOthers,
      key: "close-others",
      label: "他を閉じる",
    },
    {
      disabled: !input.canCloseRight,
      key: "close-right",
      label: "右側を閉じる",
    },
    {
      disabled: !rename,
      disabledReason: rename ? undefined : "Personal DM の名前は変更できません",
      key: "rename",
      label: "名前を変更",
    },
  ];
}
