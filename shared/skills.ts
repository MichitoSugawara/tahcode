import type { ProviderDriverKind } from "./providers.ts";

export const SKILL_SOURCE_KINDS = ["manual", "url", "skills_sh"] as const;
export type SkillSourceKind = (typeof SKILL_SOURCE_KINDS)[number];

export const MAX_LIBRARY_SKILLS = 100;
export const MAX_PROFILES = 50;
export const MAX_PROFILE_SKILLS = 32;
export const MAX_SKILL_NAME = 80;
export const MAX_SKILL_DESCRIPTION = 400;
export const MAX_SKILL_SLUG = 64;
export const MAX_SKILL_BODY = 64_000;
export const MAX_SKILL_SOURCE_URL = 500;

const SKILL_SLUG_RE = /^[a-z0-9][a-z0-9-]{0,62}$/;
const ALLOWED_IMPORT_HOSTS = new Set([
  "skills.sh",
  "www.skills.sh",
  "github.com",
  "www.github.com",
  "raw.githubusercontent.com",
  "gist.githubusercontent.com",
]);

export type ParsedSkillMarkdown = {
  body: string;
  description: string;
  name: string;
};

export type SkillImportSource = {
  candidates: string[];
  kind: Exclude<SkillSourceKind, "manual">;
  slugHint: string;
  sourceUrl: string;
};

export type SkillStoreTarget = {
  driverKind: ProviderDriverKind;
  path: string;
  supported: boolean;
};

export function isAllowedSkillImportUrl(url: URL): boolean {
  return (
    url.protocol === "https:" &&
    ALLOWED_IMPORT_HOSTS.has(url.hostname.toLowerCase())
  );
}

export function isValidSkillSlug(value: string): boolean {
  return SKILL_SLUG_RE.test(value);
}

export function skillSlugFromName(value: string): string {
  const slug = value
    .toLowerCase()
    .normalize("NFKD")
    .replaceAll(/[^\w\s-]/g, "")
    .replaceAll(/[\s_]+/g, "-")
    .replaceAll(/-+/g, "-")
    .replaceAll(/^-|-$/g, "")
    .slice(0, MAX_SKILL_SLUG);
  return isValidSkillSlug(slug) ? slug : "";
}

export function parseSkillMarkdown(markdown: string): ParsedSkillMarkdown {
  const trimmed = markdown.replaceAll("\r\n", "\n").trim();
  const fence = trimmed.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!fence) {
    return {
      body: trimmed,
      description: "",
      name: "",
    };
  }
  const frontmatter = fence[1] ?? "";
  const body = (fence[2] ?? "").trim();
  return {
    body,
    description: readFrontmatterField(frontmatter, "description"),
    name: readFrontmatterField(frontmatter, "name"),
  };
}

export function buildSkillMarkdown(input: {
  body: string;
  description: string;
  name: string;
}): string {
  const name = input.name.trim();
  const description = input.description.trim().replaceAll("\n", " ");
  const body = input.body.replaceAll("\r\n", "\n").trim();
  return `---\nname: ${name}\ndescription: ${description}\n---\n\n${body}\n`;
}

export function resolveSkillImportSource(raw: string): SkillImportSource {
  const trimmed = raw.trim();
  if (trimmed.length < 1) {
    throw new Error("Import URL is required");
  }
  if (/^npx\s+skills\s+add\s+/i.test(trimmed)) {
    const tokens = trimmed.split(/\s+/);
    const addAt = tokens.findIndex((token) => token.toLowerCase() === "add");
    const locator = tokens[addAt + 1] ?? "";
    const skillFlag = tokens.indexOf("--skill");
    const skillHint = skillFlag === -1 ? "" : (tokens[skillFlag + 1] ?? "");
    return resolveSkillImportSource(
      skillHint ? `${locator.replace(/\/$/, "")}/${skillHint}` : locator
    );
  }
  if (!/^https?:\/\//i.test(trimmed)) {
    if (/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(trimmed)) {
      const [owner, repo, skill] = trimmed.split("/");
      return resolveSkillImportSource(
        `https://skills.sh/${owner}/${repo}/${skill}`
      );
    }
    throw new Error(
      "Use a skills.sh URL, GitHub / raw SKILL.md URL, or owner/repo/skill"
    );
  }
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error("Import URL is invalid");
  }
  if (!isAllowedSkillImportUrl(parsed)) {
    throw new Error(
      "Import is limited to https skills.sh, GitHub, and raw.githubusercontent.com"
    );
  }
  const host = parsed.hostname.toLowerCase();
  if (host === "skills.sh" || host === "www.skills.sh") {
    const parts = parsed.pathname.split("/").filter(Boolean);
    if (parts.length < 2) {
      throw new Error("skills.sh URL must be /owner/repo or /owner/repo/skill");
    }
    const [owner, repo, skill] = parts;
    const slugHint = skillSlugFromName(skill ?? repo ?? "skill");
    return {
      candidates: githubSkillCandidates(owner ?? "", repo ?? "", skill),
      kind: "skills_sh",
      slugHint,
      sourceUrl: `https://skills.sh/${parts.slice(0, 3).join("/")}`,
    };
  }
  if (host === "github.com" || host === "www.github.com") {
    const rawUrl = githubBlobToRaw(parsed);
    const slugHint = slugFromSkillPath(rawUrl.pathname);
    return {
      candidates: [rawUrl.toString()],
      kind: "url",
      slugHint,
      sourceUrl: trimmed,
    };
  }
  return {
    candidates: [parsed.toString()],
    kind: "url",
    slugHint: slugFromSkillPath(parsed.pathname),
    sourceUrl: trimmed,
  };
}

export function skillStoreTargets(input: {
  cwd?: string;
  driverKind: ProviderDriverKind;
  homeDir: string;
}): SkillStoreTarget[] {
  const { cwd, driverKind, homeDir } = input;
  switch (driverKind) {
    case "codex":
      return supportedTargets(driverKind, [
        `${homeDir}/.codex/skills`,
        cwd ? `${cwd}/.agents/skills` : undefined,
        cwd ? `${cwd}/.codex/skills` : undefined,
      ]);
    case "claudeAgent":
      return supportedTargets(driverKind, [
        `${homeDir}/.claude/skills`,
        cwd ? `${cwd}/.claude/skills` : undefined,
      ]);
    case "cursor":
      return supportedTargets(driverKind, [
        `${homeDir}/.cursor/skills`,
        cwd ? `${cwd}/.cursor/skills` : undefined,
        cwd ? `${cwd}/.agents/skills` : undefined,
      ]);
    case "opencode":
      return supportedTargets(driverKind, [
        `${homeDir}/.config/opencode/skills`,
        cwd ? `${cwd}/.opencode/skills` : undefined,
      ]);
    case "grok":
    case "antigravity":
      return [{ driverKind, path: "", supported: false }];
    default: {
      const _exhaustive: never = driverKind;
      return _exhaustive;
    }
  }
}

export function skillFilePath(root: string, slug: string): string {
  return `${root.replace(/\/$/, "")}/${slug}/SKILL.md`;
}

function supportedTargets(
  driverKind: ProviderDriverKind,
  roots: (string | undefined)[]
): SkillStoreTarget[] {
  const seen = new Set<string>();
  const out: SkillStoreTarget[] = [];
  for (const root of roots) {
    if (!root || seen.has(root)) {
      continue;
    }
    seen.add(root);
    out.push({ driverKind, path: root, supported: true });
  }
  return out;
}

function readFrontmatterField(frontmatter: string, key: string): string {
  const line = frontmatter
    .split("\n")
    .find((entry) => entry.startsWith(`${key}:`));
  if (!line) {
    return "";
  }
  let value = line.slice(key.length + 1).trim();
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }
  return value.trim();
}

function githubSkillCandidates(
  owner: string,
  repo: string,
  skill?: string
): string[] {
  const refs = ["HEAD", "main", "master"];
  const paths = skill
    ? [`${skill}/SKILL.md`, `skills/${skill}/SKILL.md`, `${skill}/skill.md`]
    : ["SKILL.md", "skills/SKILL.md"];
  const urls: string[] = [];
  for (const ref of refs) {
    for (const relative of paths) {
      urls.push(
        `https://raw.githubusercontent.com/${owner}/${repo}/${ref}/${relative}`
      );
    }
  }
  return urls;
}

function githubBlobToRaw(url: URL): URL {
  const parts = url.pathname.split("/").filter(Boolean);
  const blobAt = parts.indexOf("blob");
  const treeAt = parts.indexOf("tree");
  const splitAt = blobAt === -1 ? treeAt : blobAt;
  if (parts.length >= 2 && splitAt >= 2 && parts[splitAt + 1]) {
    const owner = parts[0];
    const repo = parts[1];
    const ref = parts[splitAt + 1];
    const rest = parts.slice(splitAt + 2);
    const suffix = rest.length > 0 ? rest.join("/") : "SKILL.md";
    const filePath = suffix.endsWith("SKILL.md")
      ? suffix
      : `${suffix}/SKILL.md`;
    return new URL(
      `https://raw.githubusercontent.com/${owner}/${repo}/${ref}/${filePath}`
    );
  }
  throw new Error("GitHub URL must point at a repo, tree, or SKILL.md blob");
}

function slugFromSkillPath(pathname: string): string {
  const parts = pathname.split("/").filter(Boolean);
  const skillMd = parts.findIndex((part) => part.toLowerCase() === "skill.md");
  if (skillMd > 0) {
    return skillSlugFromName(parts[skillMd - 1] ?? "");
  }
  return skillSlugFromName(parts.at(-1) ?? "");
}
