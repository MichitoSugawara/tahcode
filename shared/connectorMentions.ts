/**
 * Shared @linear / @github mention handles.
 *
 * UI suggestions (`src/lib/connectorMentions.ts`) and job MCP injection
 * (TAH-54) must assign the same tokens so `@linear` matches the account
 * the composer would insert.
 */

const MENTION_SLUG_RE = /[^a-z0-9._-]+/g;
const EDGE_SLUG_RE = /^[-.]+|[-.]+$/g;
const MAX_MENTION_SLUG = 48;

export type MentionableConnector = {
  connectionId: string;
  displayLabel?: string;
  provider: string;
  scope: "org" | "user";
  status: string;
};

export type ConnectorMentionRef = {
  handle: string;
  provider: string;
};

export function connectorMentionSlug(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(MENTION_SLUG_RE, "-")
    .replace(EDGE_SLUG_RE, "")
    .slice(0, MAX_MENTION_SLUG);
}

/**
 * Stable @ tokens for connected accounts:
 * unnamed / first unlabeled → `@linear` / `@github`
 * labeled → `@linear/<slug>` / `@github/<slug>`
 * collision or empty slug → `@<provider>/<connectionId>`
 */
export function connectorMentionHandle(
  provider: string,
  input: {
    connectionId: string;
    displayLabel?: string;
    preferBare: boolean;
    taken: ReadonlySet<string>;
  }
): string {
  const label = input.displayLabel?.trim();
  if (!label) {
    if (input.preferBare && !input.taken.has(provider)) {
      return provider;
    }
    return `${provider}/${input.connectionId}`;
  }
  const slug = connectorMentionSlug(label);
  const candidate = slug.length > 0 ? `${provider}/${slug}` : undefined;
  if (candidate && !input.taken.has(candidate)) {
    return candidate;
  }
  return `${provider}/${input.connectionId}`;
}

export function sortMentionableConnectors(
  rows: readonly MentionableConnector[]
): MentionableConnector[] {
  return [...rows].sort((left, right) => {
    const leftLabel = left.displayLabel?.trim() ?? "";
    const rightLabel = right.displayLabel?.trim() ?? "";
    if (leftLabel.length === 0 && rightLabel.length > 0) {
      return -1;
    }
    if (leftLabel.length > 0 && rightLabel.length === 0) {
      return 1;
    }
    if (leftLabel !== rightLabel) {
      return leftLabel < rightLabel ? -1 : 1;
    }
    return left.connectionId < right.connectionId ? -1 : 1;
  });
}

/** connectionId → handle without `@` (`linear` or `linear/pottos`). */
export function assignConnectorMentionHandles(
  connections: readonly MentionableConnector[]
): Map<string, string> {
  const byProvider = new Map<string, MentionableConnector[]>();
  for (const row of connections) {
    if (row.status !== "connected") {
      continue;
    }
    const list = byProvider.get(row.provider) ?? [];
    list.push(row);
    byProvider.set(row.provider, list);
  }
  const handles = new Map<string, string>();
  for (const [provider, rows] of byProvider) {
    const taken = new Set<string>();
    let assignedBare = false;
    for (const row of sortMentionableConnectors(rows)) {
      const label = row.displayLabel?.trim();
      const preferBare = !assignedBare && (!label || label.length === 0);
      const handle = connectorMentionHandle(provider, {
        connectionId: row.connectionId,
        displayLabel: label,
        preferBare,
        taken,
      });
      if (handle === provider) {
        assignedBare = true;
      }
      taken.add(handle);
      handles.set(row.connectionId, handle);
    }
  }
  return handles;
}

/**
 * Bare `@linear` (no slug) default:
 * 1. The connected account that would receive the bare handle (first unlabeled)
 * 2. Else the only connected account for that provider
 * 3. Else org-scope first, then connectionId
 */
export function defaultConnectedConnector(
  connections: readonly MentionableConnector[],
  provider: string
): MentionableConnector | undefined {
  const connected = connections.filter(
    (row) => row.provider === provider && row.status === "connected"
  );
  if (connected.length === 0) {
    return undefined;
  }
  if (connected.length === 1) {
    return connected[0];
  }
  const handles = assignConnectorMentionHandles(connected);
  for (const row of connected) {
    if (handles.get(row.connectionId) === provider) {
      return row;
    }
  }
  const ranked = [...connected].sort((left, right) => {
    if (left.scope !== right.scope) {
      return left.scope === "org" ? -1 : 1;
    }
    return left.connectionId < right.connectionId ? -1 : 1;
  });
  return ranked[0];
}

export function matchMentionedConnector(
  mention: ConnectorMentionRef,
  connections: readonly MentionableConnector[]
): MentionableConnector | undefined {
  const connected = connections.filter(
    (row) => row.provider === mention.provider && row.status === "connected"
  );
  if (connected.length === 0) {
    return undefined;
  }
  if (mention.handle === mention.provider) {
    return defaultConnectedConnector(connected, mention.provider);
  }
  const handles = assignConnectorMentionHandles(connected);
  for (const row of connected) {
    if (handles.get(row.connectionId) === mention.handle) {
      return row;
    }
  }
  const slash = mention.handle.indexOf("/");
  const slug = slash === -1 ? "" : mention.handle.slice(slash + 1);
  if (slug.length < 1) {
    return undefined;
  }
  for (const row of connected) {
    if (row.connectionId === slug) {
      return row;
    }
    const label = row.displayLabel?.trim();
    if (label && connectorMentionSlug(label) === slug.toLowerCase()) {
      return row;
    }
  }
  return undefined;
}

export function selectInjectedConnections<T extends MentionableConnector>(
  connections: readonly T[],
  mentions: readonly ConnectorMentionRef[]
): T[] {
  const selected: T[] = [];
  const seen = new Set<string>();
  for (const mention of mentions) {
    const match = matchMentionedConnector(mention, connections);
    if (!match || seen.has(match.connectionId)) {
      continue;
    }
    const row = connections.find(
      (item) => item.connectionId === match.connectionId
    );
    if (!row) {
      continue;
    }
    seen.add(row.connectionId);
    selected.push(row);
  }
  return selected;
}
