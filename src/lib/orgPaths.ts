/** Org-scoped routes that occupy the full main pane (no right rail). */

export function orgSettingsPath(slug: string, hash?: string): string {
  const suffix =
    typeof hash === "string" && hash.length > 0
      ? hash.startsWith("#")
        ? hash
        : `#${hash}`
      : "";
  return `/o/${slug}/settings${suffix}`;
}

export function orgConnectorsPath(slug: string): string {
  return `/o/${slug}/connectors`;
}

export function isOrgFullWidthPath(pathname: string, slug: string): boolean {
  return (
    pathname === `/o/${slug}/settings` ||
    pathname.startsWith(`/o/${slug}/settings/`) ||
    pathname === `/o/${slug}/connectors` ||
    pathname.startsWith(`/o/${slug}/connectors/`)
  );
}

/** Bookmarks that still point at the old Settings scrapbook section. */
export function isLegacyConnectorsHash(hash: string): boolean {
  return hash === "#connectors" || hash === "connectors";
}
