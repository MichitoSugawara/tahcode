import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const BANNED = /OpenConnector|OOMOL|workers\.dev|gateway/i;

function walk(dir: string): string[] {
  const entries = readdirSync(dir);
  const files: string[] = [];
  for (const entry of entries) {
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      files.push(...walk(path));
      continue;
    }
    if (path.endsWith(".ts") || path.endsWith(".tsx")) {
      files.push(path);
    }
  }
  return files;
}

describe("user-facing copy", () => {
  it("keeps OpenConnector and OOMOL out of src UI strings", () => {
    const offenders: string[] = [];
    for (const file of walk("src")) {
      if (BANNED.test(readFileSync(file, "utf-8"))) {
        offenders.push(file);
      }
    }
    expect(offenders).toStrictEqual([]);
  });

  it("opens connectors from the command palette on the dedicated route", () => {
    const palette = readFileSync("src/harness/CommandPalette.tsx", "utf-8");
    const settings = readFileSync("src/pages/SettingsPage.tsx", "utf-8");
    const connectors = readFileSync("src/pages/ConnectorsPage.tsx", "utf-8");
    expect(palette).toContain("org.goConnectors");
    expect(palette).not.toContain('goSettings("connectors")');
    expect(settings).not.toContain("ConnectorsPane");
    expect(settings).not.toContain('id="connectors"');
    expect(connectors).toContain("コネクタを検索");
  });

  it("keeps connector account delete as a red trash control", () => {
    const pane = readFileSync("src/harness/rail/ConnectorsPane.tsx", "utf-8");
    const cardPath = "src/harness/connectors/LinearConnectorCard.tsx";
    const card = existsSync(cardPath) ? readFileSync(cardPath, "utf-8") : "";
    const haystack = `${pane}\n${card}`;
    expect(haystack).toContain("Trash2");
    expect(haystack).toContain("text-red");
    expect(haystack).toContain(
      "aria-label={CONNECTOR_CARD_COPY.removeAccount(label)}"
    );
    expect(haystack).toContain("setPendingRemove");
  });
});
