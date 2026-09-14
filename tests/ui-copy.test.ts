import { readdirSync, readFileSync, statSync } from "node:fs";
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

  it("cancels jobs from the composer stop control, not the agent row", () => {
    const reply = readFileSync("src/harness/thread/AgentReply.tsx", "utf-8");
    const prompt = readFileSync(
      "src/components/primitives/PromptBar.tsx",
      "utf-8"
    );
    expect(reply).not.toContain("useCancelJob");
    expect(reply).not.toContain("生成を中断");
    expect(prompt).toContain('aria-label={jobRunning ? "生成を中断" : "送信"}');
  });

  it("keeps connector account delete as a red trash control", () => {
    const pane = readFileSync("src/harness/rail/ConnectorsPane.tsx", "utf-8");
    expect(pane).toContain("Trash2");
    expect(pane).toContain("text-red");
    expect(pane).toContain("aria-label={CONNECTOR_CARD_COPY.remove}");
    expect(pane).toContain("setPendingRemove");
  });

  it("drops plus and search from the chat section header", () => {
    const sidebar = readFileSync(
      "src/components/primitives/SidebarNav.tsx",
      "utf-8"
    );
    const shell = readFileSync("src/harness/Shell.tsx", "utf-8");
    expect({
      headerAdd: sidebar.includes("onAddGroup"),
      headerSearch: sidebar.includes("チャットを検索"),
      label: sidebar.includes("groupsLabel"),
      newChat: shell.includes('label: "新しいチャット"'),
      palette: shell.includes("⌘K") && shell.includes('groupsLabel="チャット"'),
    }).toStrictEqual({
      headerAdd: false,
      headerSearch: false,
      label: true,
      newChat: true,
      palette: true,
    });
  });
});
