import { connectorMentionHandle } from "@shared/connectorMentions.ts";

import {
  CONNECTOR_CARD_COPY,
  connectorAccountTitle,
} from "@/lib/connectorCard";

export {
  connectorMentionHandle,
  connectorMentionSlug,
} from "@shared/connectorMentions.ts";

export const CONNECTOR_MENTION_HINT = "接続済み";
export const CONNECTOR_MENTION_TRAILING = CONNECTOR_CARD_COPY.surface;

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
  const ordered = [...connected].sort((left, right) => {
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
    return left._id < right._id ? -1 : 1;
  });
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
