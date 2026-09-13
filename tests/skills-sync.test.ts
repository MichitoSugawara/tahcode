import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { syncProfileSkills } from "../runtime/src/skillsSync.ts";

describe(syncProfileSkills, () => {
  it("writes SKILL.md into the provider skill store", async () => {
    const root = await mkdtemp(join(tmpdir(), "tahcode-skills-"));
    const result = await syncProfileSkills({
      cwd: join(root, "repo"),
      driverKind: "cursor",
      homeDir: root,
      skills: [
        {
          body: "---\nname: lint\ndescription: Lint\n---\n\nRun lint.\n",
          description: "Lint",
          name: "lint",
          slug: "lint",
        },
      ],
    });
    expect(result.discovered).toStrictEqual(["lint"]);
    const written = result.written[0];
    expect(written).toBeTruthy();
    await expect(readFile(written ?? "", "utf-8")).resolves.toContain(
      "Run lint."
    );
  });

  it("skips Grok instead of inventing a store", async () => {
    const result = await syncProfileSkills({
      driverKind: "grok",
      homeDir: "/tmp",
      skills: [
        {
          body: "x",
          description: "",
          name: "x",
          slug: "x",
        },
      ],
    });
    expect(result.written).toStrictEqual([]);
    expect(result.skippedReason).toMatch(/no documented skill store/i);
  });
});
