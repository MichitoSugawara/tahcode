"use node";

import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";

import {
  isAllowedSkillImportUrl,
  parseSkillMarkdown,
  resolveSkillImportSource,
} from "../shared/skills.ts";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { action } from "./_generated/server";

const FETCH_TIMEOUT_MS = 12_000;

type ImportedSkill = {
  skillId: Id<"librarySkills">;
  slug: string;
};

export const importFromUrl = action({
  args: {
    orgId: v.id("orgs"),
    url: v.string(),
  },
  handler: async (ctx, args): Promise<ImportedSkill> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Not authenticated");
    }
    await ctx.runQuery(internal.skillImportHelpers.assertCanImport, {
      orgId: args.orgId,
      userId,
    });
    const source = resolveSkillImportSource(args.url);
    const markdown = await fetchFirstSkillMarkdown(source.candidates);
    const parsed = parseSkillMarkdown(markdown);
    const name = parsed.name || source.slugHint || "imported-skill";
    const skillId: Id<"librarySkills"> = await ctx.runMutation(
      internal.skills.upsertImported,
      {
        body: markdown,
        createdBy: userId,
        description: parsed.description,
        name,
        orgId: args.orgId,
        slug: source.slugHint || undefined,
        sourceKind: source.kind,
        sourceUrl: source.sourceUrl,
      }
    );
    return { skillId, slug: source.slugHint || name };
  },
  returns: v.object({
    skillId: v.id("librarySkills"),
    slug: v.string(),
  }),
});

async function fetchFirstSkillMarkdown(candidates: string[]): Promise<string> {
  let lastError = "Could not fetch SKILL.md";
  for (const url of candidates) {
    try {
      const markdown = await fetchSkillMarkdown(url);
      if (looksLikeSkillMarkdown(markdown)) {
        return markdown;
      }
      lastError = `Response from ${url} is not a SKILL.md file`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
  }
  throw new Error(lastError);
}

async function fetchSkillMarkdown(url: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: { Accept: "text/plain, text/markdown, */*" },
      redirect: "follow",
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`Fetch failed (${response.status})`);
    }
    const finalUrl = new URL(response.url);
    if (!isAllowedSkillImportUrl(finalUrl)) {
      throw new Error("Import redirect must stay on an allowlisted https host");
    }
    const text = await response.text();
    if (text.length > 80_000) {
      throw new Error("Imported skill is too large");
    }
    return text;
  } finally {
    clearTimeout(timer);
  }
}

function looksLikeSkillMarkdown(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length < 8) {
    return false;
  }
  if (trimmed.startsWith("<!DOCTYPE") || trimmed.startsWith("<html")) {
    return false;
  }
  return (
    trimmed.startsWith("---") ||
    trimmed.includes("name:") ||
    /^#\s+\S+/m.test(trimmed)
  );
}
