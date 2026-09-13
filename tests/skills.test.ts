import { describe, expect, it } from "vitest";

import {
  buildSkillMarkdown,
  isAllowedSkillImportUrl,
  parseSkillMarkdown,
  resolveSkillImportSource,
  skillFilePath,
  skillSlugFromName,
  skillStoreTargets,
} from "../shared/skills.ts";

describe(parseSkillMarkdown, () => {
  it("reads name and description from frontmatter", () => {
    const parsed = parseSkillMarkdown(
      "---\nname: review\ndescription: Review PRs\n---\n\nDo the review.\n"
    );
    expect(parsed.name).toBe("review");
    expect(parsed.description).toBe("Review PRs");
    expect(parsed.body).toBe("Do the review.");
  });

  it("returns the whole document when there is no frontmatter", () => {
    expect(parseSkillMarkdown("# Hello\n\nWorld").name).toBe("");
    expect(parseSkillMarkdown("# Hello\n\nWorld").body).toContain("Hello");
  });
});

describe(skillSlugFromName, () => {
  it("slugifies a display name", () => {
    expect(skillSlugFromName("Code Review")).toBe("code-review");
  });

  it("rejects empty or invalid leftovers", () => {
    expect(skillSlugFromName("!!!")).toBe("");
  });
});

describe(resolveSkillImportSource, () => {
  it("unwraps skills.sh URLs to GitHub raw candidates", () => {
    const source = resolveSkillImportSource(
      "https://skills.sh/vercel-labs/agent-browser/browse"
    );
    expect(source.kind).toBe("skills_sh");
    expect(source.slugHint).toBe("browse");
    expect(source.candidates[0]).toContain(
      "raw.githubusercontent.com/vercel-labs/agent-browser"
    );
  });

  it("accepts owner/repo/skill shorthand", () => {
    const source = resolveSkillImportSource("acme/skills/lint");
    expect(source.kind).toBe("skills_sh");
    expect(source.sourceUrl).toBe("https://skills.sh/acme/skills/lint");
  });

  it("rejects non-allowlisted hosts", () => {
    expect(() =>
      resolveSkillImportSource("https://evil.example/SKILL.md")
    ).toThrow(/limited to/i);
  });

  it("accepts only allowlisted https hosts after parse", () => {
    expect(
      isAllowedSkillImportUrl(
        new URL("https://raw.githubusercontent.com/a/b/SKILL.md")
      )
    ).toBeTruthy();
    expect(
      isAllowedSkillImportUrl(new URL("https://evil.example/SKILL.md"))
    ).toBeFalsy();
    expect(
      isAllowedSkillImportUrl(new URL("http://skills.sh/owner/repo/skill"))
    ).toBeFalsy();
  });
});

describe(skillStoreTargets, () => {
  it("maps Codex and Claude to documented roots", () => {
    const home = "/home/dev";
    const cwd = "/repo";
    expect(
      skillStoreTargets({ cwd, driverKind: "codex", homeDir: home }).map(
        (target) => target.path
      )
    ).toContain(`${home}/.codex/skills`);
    expect(
      skillStoreTargets({ cwd, driverKind: "claudeAgent", homeDir: home }).some(
        (target) => target.path === `${cwd}/.claude/skills`
      )
    ).toBeTruthy();
    expect(
      skillStoreTargets({ driverKind: "grok", homeDir: home })[0]?.supported
    ).toBeFalsy();
  });

  it("builds SKILL.md paths", () => {
    expect(skillFilePath("/tmp/skills", "lint")).toBe(
      "/tmp/skills/lint/SKILL.md"
    );
  });
});

describe(buildSkillMarkdown, () => {
  it("round-trips name and description", () => {
    const markdown = buildSkillMarkdown({
      body: "Steps",
      description: "A helper",
      name: "helper",
    });
    const parsed = parseSkillMarkdown(markdown);
    expect(parsed.name).toBe("helper");
    expect(parsed.description).toBe("A helper");
    expect(parsed.body).toBe("Steps");
  });
});
