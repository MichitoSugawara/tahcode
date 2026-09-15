/**
 * Legacy Context / Runtime / Team sections.
 *
 * Kept off the chat right rail (PR #33). Settings still mounts
 * RuntimePane + TeamPane directly. The chat rail is the workbench
 * in `src/harness/workbench/` — do not flip these back on.
 */
export const RIGHT_RAIL_TABS = ["Context", "Runtime", "Team"] as const;

export type RailTab = (typeof RIGHT_RAIL_TABS)[number];

export const RIGHT_RAIL_SECTION_ENABLED: Record<RailTab, boolean> = {
  Context: false,
  Runtime: false,
  Team: false,
};

export function visibleRightRailTabs(): RailTab[] {
  return RIGHT_RAIL_TABS.filter((tab) => RIGHT_RAIL_SECTION_ENABLED[tab]);
}

export function resolveRailTab(preferred: RailTab | undefined): RailTab | null {
  const visible = visibleRightRailTabs();
  const first = visible[0];
  if (!first) {
    return null;
  }
  if (preferred && visible.includes(preferred)) {
    return preferred;
  }
  return first;
}
