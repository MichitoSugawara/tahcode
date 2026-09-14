import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  CONNECTOR_MENTION_HINT,
  CONNECTOR_MENTION_TRAILING,
  connectorMentionHandle,
  connectorMentionSlug,
  connectorMentionSuggestItems,
} from "../src/lib/connectorMentions.ts";
import { filterSuggestItems } from "../src/lib/suggestMenu.ts";

describe(connectorMentionSlug, () => {
  it("slugifies labels for @linear/<slug>", () => {
    expect(connectorMentionSlug("pottos")).toBe("pottos");
    expect(connectorMentionSlug("Michito Gawara")).toBe("michito-gawara");
    expect(connectorMentionSlug("太郎")).toBe("");
  });
});

describe(connectorMentionHandle, () => {
  it("uses @linear for the first unnamed account and ids on collision", () => {
    const taken = new Set<string>();
    const first = connectorMentionHandle("linear", {
      connectionId: "id-a",
      preferBare: true,
      taken,
    });
    taken.add(first);
    const second = connectorMentionHandle("linear", {
      connectionId: "id-b",
      preferBare: true,
      taken,
    });
    expect({ first, second }).toStrictEqual({
      first: "linear",
      second: "linear/id-b",
    });
  });

  it("uses a label slug unless that handle is taken", () => {
    expect(
      connectorMentionHandle("linear", {
        connectionId: "id-a",
        displayLabel: "pottos",
        preferBare: false,
        taken: new Set(),
      })
    ).toBe("linear/pottos");
    expect(
      connectorMentionHandle("linear", {
        connectionId: "id-b",
        displayLabel: "pottos",
        preferBare: false,
        taken: new Set(["linear/pottos"]),
      })
    ).toBe("linear/id-b");
  });
});

describe(connectorMentionSuggestItems, () => {
  it("lists connected Linear accounts as Grok-style titles", () => {
    const items = connectorMentionSuggestItems([
      { _id: "id-unnamed", status: "connected" },
      { _id: "id-pottos", displayLabel: "pottos", status: "connected" },
      { _id: "id-pending", displayLabel: "soon", status: "needsAuth" },
    ]);
    expect(items).toStrictEqual([
      {
        desc: CONNECTOR_MENTION_HINT,
        insert: "@linear ",
        key: "connector-linear-id-unnamed",
        name: "Linear",
        search: expect.stringContaining("linear"),
        trailing: CONNECTOR_MENTION_TRAILING,
      },
      {
        desc: CONNECTOR_MENTION_HINT,
        insert: "@linear/pottos ",
        key: "connector-linear-id-pottos",
        name: "Linear (pottos)",
        search: expect.stringContaining("pottos"),
        trailing: CONNECTOR_MENTION_TRAILING,
      },
    ]);
    expect(filterSuggestItems(items, "lin")[0]?.name).toBe("Linear");
    expect(filterSuggestItems(items, "pott")[0]?.name).toBe("Linear (pottos)");
  });
});

describe("composer @linear wiring", () => {
  it("asks Convex for connected Linear accounts and builds suggest rows", () => {
    const composer = readFileSync("src/harness/Composer.tsx", "utf-8");
    expect(composer).toContain("connectorMentionSuggestItems");
    expect(composer).toContain("connectorConnections.listByOrg");
    expect(composer).toContain("CONNECTOR");
  });
});
