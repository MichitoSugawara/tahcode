import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { browseRuntimeFolder } from "../runtime/src/filesystemBrowse.ts";

describe("runtime folder browse", () => {
  it("lists child directories and suggests a GitHub remote", async () => {
    const root = mkdtempSync(join(tmpdir(), "tah-rt-folder-"));
    mkdirSync(join(root, "apps"));
    writeFileSync(join(root, "README.md"), "hi");
    mkdirSync(join(root, ".git"));
    writeFileSync(
      join(root, ".git", "config"),
      `[remote "origin"]\n\turl = https://github.com/acme/web.git\n`
    );
    const result = await browseRuntimeFolder(root);
    expect(result.path).toBe(root);
    expect(result.entries.map((entry) => entry.name)).toContain("apps");
    expect(result.entries.map((entry) => entry.name)).not.toContain(
      "README.md"
    );
    expect(result.gitRemoteUrl).toBe("https://github.com/acme/web");
  });

  it("rejects a file path", async () => {
    const root = mkdtempSync(join(tmpdir(), "tah-rt-file-"));
    const file = join(root, "only.txt");
    writeFileSync(file, "x");
    await expect(browseRuntimeFolder(file)).rejects.toThrow(/directory/i);
  });
});
