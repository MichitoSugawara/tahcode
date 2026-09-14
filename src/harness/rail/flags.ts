/**
 * Chat right-rail sections (Context / Runtime / Team).
 *
 * Temporarily off — the panes stay in the tree (settings still uses
 * Runtime + Team) so we can flip these back without a rewrite.
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

export function isRightRailVisible(): boolean {
  return visibleRightRailTabs().length > 0;
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
