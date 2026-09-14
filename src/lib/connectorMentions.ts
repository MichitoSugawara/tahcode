import { connectorAccountTitle } from "@/lib/connectorCard";

export const CONNECTOR_MENTION_HINT = "接続済み";
export const CONNECTOR_MENTION_TRAILING = "コネクタ";

const MENTION_SLUG_RE = /[^a-z0-9._-]+/g;
const EDGE_SLUG_RE = /^[-.]+|[-.]+$/g;
const MAX_MENTION_SLUG = 48;

export type ConnectorMentionAccount = {
  _id: string;
  displayLabel?: string;
  status: string;
};

export type ConnectorMentionSuggestItem = {
  desc: string;
  insert: string;
  key: string;
  name: string;
  search: string;
  trailing: string;
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
 * Stable @ tokens for connected Linear accounts:
 * unnamed / first unlabeled → `@linear`
 * labeled → `@linear/<slug>`
 * collision or empty slug → `@linear/<connectionId>`
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

export function connectorMentionSuggestItems(
  rows: readonly ConnectorMentionAccount[],
  options?: { displayName?: string; provider?: string }
): ConnectorMentionSuggestItem[] {
  const displayName = options?.displayName ?? "Linear";
  const provider = options?.provider ?? "linear";
  const connected = rows.filter((row) => row.status === "connected");
  const taken = new Set<string>();
  let assignedBare = false;
  const items: ConnectorMentionSuggestItem[] = [];
  const ordered = [...connected].sort((left, right) =>
    left._id < right._id ? -1 : 1
  );
  for (const row of ordered) {
    const label = row.displayLabel?.trim();
    const preferBare = !assignedBare && (!label || label.length === 0);
    const handle = connectorMentionHandle(provider, {
      connectionId: row._id,
      displayLabel: label,
      preferBare,
      taken,
    });
    if (handle === provider) {
      assignedBare = true;
    }
    taken.add(handle);
    const name = connectorAccountTitle(displayName, label);
    items.push({
      desc: CONNECTOR_MENTION_HINT,
      insert: `@${handle} `,
      key: `connector-${provider}-${row._id}`,
      name,
      search: [name, `@${handle}`, label, provider, CONNECTOR_MENTION_TRAILING]
        .filter((part): part is string => Boolean(part && part.length > 0))
        .join(" "),
      trailing: CONNECTOR_MENTION_TRAILING,
    });
  }
  return items;
}
