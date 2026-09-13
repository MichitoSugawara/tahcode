/**
 * Cursor CLI (`agent --model`) bakes reasoning effort into the model id.
 * Live `agent models` lists `cursor-grok-4.6-medium`, not the bare family
 * `cursor-grok-4.6`. Mentions, suggest, and headless argv share this
 * family ↔ effort mapping so the chip and the flag stay the same id.
 */

export const CURSOR_DEFAULT_EFFORT = "medium";

export const CURSOR_EFFORTS = [
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
  "minimal",
] as const;

export type CursorEffort = (typeof CURSOR_EFFORTS)[number];

/** Efforts offered when the live catalog has not listed variants yet. */
export const CURSOR_SUGGEST_EFFORTS = [
  "low",
  "medium",
  "high",
  "xhigh",
] as const;

export const CURSOR_EFFORT_LABELS: Record<string, string> = {
  high: "High",
  low: "Low",
  max: "Max",
  medium: "Medium",
  minimal: "Minimal",
  xhigh: "Extra High",
};

const EFFORT_SUFFIX_RE = /-(low|medium|high|xhigh|max|minimal)(-fast)?$/i;
const EFFORT_RANK: Record<string, number> = {
  high: 2,
  low: 0,
  max: 4,
  medium: 1,
  minimal: 5,
  xhigh: 3,
};

export type CursorModelParts = {
  family: string;
  effort?: CursorEffort;
  fast: boolean;
};

export type CursorCatalogEntry = {
  slug: string;
  name?: string;
  aliases?: readonly string[];
  default?: boolean;
  legacy?: boolean;
};

export type CursorEffortVariant = {
  slug: string;
  effort?: CursorEffort;
  fast: boolean;
  name?: string;
  default?: boolean;
};

export type CursorModelFamily = {
  id: string;
  name: string;
  aliases: string[];
  variants: CursorEffortVariant[];
  /** Variants were invented from the static fallback, not reported live. */
  synthesized: boolean;
};

export type CursorMentionSuggestKind = "family" | "effort";

export type CursorMentionSuggestItem = {
  desc: string;
  insert: string;
  key: string;
  kind: CursorMentionSuggestKind;
  name: string;
  search: string;
  slug: string;
  trailing?: string;
};

export function isCursorEffort(value: string): value is CursorEffort {
  return (CURSOR_EFFORTS as readonly string[]).includes(value);
}

export function parseCursorModel(slug: string): CursorModelParts {
  const match = EFFORT_SUFFIX_RE.exec(slug);
  if (!match || match.index === undefined) {
    return { family: slug, fast: false };
  }
  const effort = match[1]?.toLowerCase();
  if (!effort || !isCursorEffort(effort)) {
    return { family: slug, fast: false };
  }
  return {
    effort,
    family: slug.slice(0, match.index),
    fast: match[2] !== undefined,
  };
}

export function cursorModelFamily(slug: string): string {
  return parseCursorModel(slug).family;
}

export function hasCursorEffortSuffix(slug: string): boolean {
  return parseCursorModel(slug).effort !== undefined;
}

/**
 * Families whose live CLI catalog is effort-suffixed only. A bare mention
 * such as `cursor-grok-4.6` must become `cursor-grok-4.6-medium` when the
 * machine has not reported a live list yet.
 */
export function cursorFamilyNeedsEffortFallback(family: string): boolean {
  return family === "cursor-grok-4.6" || family.startsWith("cursor-grok-");
}

function liveMatchesFamily(
  liveSlugs: readonly string[],
  family: string
): string[] {
  return liveSlugs.filter(
    (slug) => slug === family || slug.startsWith(`${family}-`)
  );
}

function pickLiveFamilySlug(
  family: string,
  candidates: readonly string[],
  preferredEffort?: string
): string | undefined {
  const want =
    preferredEffort && isCursorEffort(preferredEffort)
      ? preferredEffort
      : CURSOR_DEFAULT_EFFORT;
  const preferred = [`${family}-${want}`, `${family}-${CURSOR_DEFAULT_EFFORT}`];
  for (const id of preferred) {
    if (candidates.includes(id)) {
      return id;
    }
  }
  const nonFast = candidates.find((slug) => !slug.endsWith("-fast"));
  return nonFast ?? candidates[0];
}

/**
 * Resolve a UI / mention slug to an id `agent --model` will accept.
 * Prefer an exact live match, then `{family}-medium`, then the first live
 * prefix; without a live list, known families fall back to `-medium`.
 */
export function resolveCursorCliModel(
  requested: string,
  liveSlugs?: readonly string[] | null,
  preferredEffort?: string | null
): string {
  const trimmed = requested.trim();
  if (!trimmed) {
    return trimmed;
  }
  const parsed = parseCursorModel(trimmed);
  const live = liveSlugs?.filter((slug) => slug.length > 0) ?? [];
  const preferred =
    preferredEffort && isCursorEffort(preferredEffort)
      ? preferredEffort
      : undefined;

  if (live.length > 0) {
    if (live.includes(trimmed)) {
      return trimmed;
    }
    const candidates = liveMatchesFamily(live, parsed.family);
    const picked = pickLiveFamilySlug(
      parsed.family,
      candidates,
      parsed.effort ?? preferred
    );
    if (picked) {
      return picked;
    }
  }

  if (parsed.effort) {
    return trimmed;
  }
  if (cursorFamilyNeedsEffortFallback(parsed.family)) {
    return `${parsed.family}-${preferred ?? CURSOR_DEFAULT_EFFORT}`;
  }
  return trimmed;
}

function unique(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    if (seen.has(value)) {
      continue;
    }
    seen.add(value);
    out.push(value);
  }
  return out;
}

function sortVariants(variants: CursorEffortVariant[]): CursorEffortVariant[] {
  return [...variants].sort((left, right) => {
    const leftRank = left.effort ? (EFFORT_RANK[left.effort] ?? 50) : -1;
    const rightRank = right.effort ? (EFFORT_RANK[right.effort] ?? 50) : -1;
    if (leftRank !== rightRank) {
      return leftRank - rightRank;
    }
    return Number(left.fast) - Number(right.fast);
  });
}

function synthesizedVariants(family: string): CursorEffortVariant[] {
  return CURSOR_SUGGEST_EFFORTS.map((effort) => ({
    effort,
    fast: false,
    slug: `${family}-${effort}`,
  }));
}

export function familyHasEffortChoices(family: CursorModelFamily): boolean {
  return (
    family.synthesized || family.variants.some((variant) => variant.effort)
  );
}

export function groupCursorCatalog(
  models: readonly CursorCatalogEntry[]
): CursorModelFamily[] {
  const byId = new Map<string, CursorModelFamily>();
  const order: string[] = [];
  for (const model of models) {
    const parsed = parseCursorModel(model.slug);
    let family = byId.get(parsed.family);
    if (!family) {
      family = {
        aliases: [],
        id: parsed.family,
        name: model.name ?? parsed.family,
        synthesized: false,
        variants: [],
      };
      byId.set(parsed.family, family);
      order.push(parsed.family);
    }
    if (!parsed.effort && model.name) {
      family.name = model.name;
    } else if (family.name === family.id && model.name) {
      family.name = model.name;
    }
    if (model.aliases) {
      family.aliases = unique([...family.aliases, ...model.aliases]);
    }
    family.variants.push({
      default: model.default,
      effort: parsed.effort,
      fast: parsed.fast,
      name: model.name,
      slug: model.slug,
    });
  }
  for (const family of byId.values()) {
    const hasEffort = family.variants.some((variant) => variant.effort);
    if (!hasEffort && cursorFamilyNeedsEffortFallback(family.id)) {
      family.synthesized = true;
      family.variants = synthesizedVariants(family.id);
    } else {
      family.variants = sortVariants(family.variants);
    }
  }
  return order
    .map((id) => byId.get(id))
    .filter((family): family is CursorModelFamily => family !== undefined);
}

function matchingFamily(
  query: string,
  families: readonly CursorModelFamily[]
): CursorModelFamily | undefined {
  const needle = query.trim().toLowerCase();
  if (!needle) {
    return undefined;
  }
  let best: CursorModelFamily | undefined;
  for (const family of families) {
    const id = family.id.toLowerCase();
    const aliasHit = family.aliases.some((alias) => {
      const key = alias.toLowerCase();
      return needle === key || needle.startsWith(`${key}-`);
    });
    const matches = needle === id || needle.startsWith(`${id}-`) || aliasHit;
    const longer = !best || family.id.length > best.id.length;
    if (matches && longer) {
      best = family;
    }
  }
  return best;
}

function effortLabel(variant: CursorEffortVariant): string {
  const base = variant.effort
    ? (CURSOR_EFFORT_LABELS[variant.effort] ?? variant.effort)
    : variant.slug;
  return variant.fast ? `${base} Fast` : base;
}

function familySearch(family: CursorModelFamily): string {
  return [family.id, family.name, ...family.aliases].join(" ");
}

function familyItem(
  handle: string,
  family: CursorModelFamily
): CursorMentionSuggestItem {
  const hasEfforts = familyHasEffortChoices(family);
  return {
    desc: hasEfforts
      ? `${family.name} · 推論レベルを選択`
      : (family.name ?? family.id),
    insert: hasEfforts ? `@${handle}/${family.id}` : `@${handle}/${family.id} `,
    key: `family-${family.id}`,
    kind: "family",
    name: `@${handle}/${family.id}`,
    search: familySearch(family),
    slug: family.id,
    trailing: hasEfforts ? "推論レベル" : undefined,
  };
}

function effortItem(
  handle: string,
  family: CursorModelFamily,
  variant: CursorEffortVariant
): CursorMentionSuggestItem {
  const label = effortLabel(variant);
  const isDefault = variant.effort === CURSOR_DEFAULT_EFFORT && !variant.fast;
  return {
    desc: `${family.name} · ${label}`,
    insert: `@${handle}/${variant.slug} `,
    key: `effort-${variant.slug}`,
    kind: "effort",
    name: `@${handle}/${variant.slug}`,
    search: [
      variant.slug,
      family.id,
      family.name,
      ...family.aliases,
      label,
    ].join(" "),
    slug: variant.slug,
    trailing: isDefault ? "既定" : variant.fast ? "fast" : undefined,
  };
}

/**
 * `@cursor/` rows: model families first; once the query is a complete
 * family (`cursor-grok-4.6` or `cursor-grok-4.6-…`), effort variants.
 */
export function cursorMentionSuggestItems(
  handle: string,
  modelQuery: string,
  models: readonly CursorCatalogEntry[]
): CursorMentionSuggestItem[] {
  const families = groupCursorCatalog(models);
  const family = matchingFamily(modelQuery, families);
  if (family && familyHasEffortChoices(family)) {
    return family.variants
      .filter((variant) => variant.effort !== undefined)
      .map((variant) => effortItem(handle, family, variant));
  }
  return families.map((item) => familyItem(handle, item));
}
