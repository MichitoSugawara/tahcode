/**
 * Cursor CLI (`agent --model`) bakes reasoning effort into the model id.
 * Live `agent models` lists `cursor-grok-4.6-medium`, not the bare family
 * `cursor-grok-4.6`. Pickers and @-suggest show families; the effort SELECT
 * (or an explicit `@cursor/family-high` mention) is composed into a CLI id
 * at job dispatch.
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
  /** CLI ids behind a collapsed family row. */
  variantSlugs?: readonly string[];
  supportedReasoningLevels?: readonly string[];
};

export type CursorEffortVariant = {
  slug: string;
  effort?: CursorEffort;
  fast: boolean;
  name?: string;
  default?: boolean;
  legacy?: boolean;
};

export type CursorFamilyRow = {
  slug: string;
  name: string;
  aliases?: string[];
  default?: boolean;
  legacy?: boolean;
  supportedReasoningLevels?: string[];
  defaultReasoningLevel?: string;
  variantSlugs?: string[];
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

export function cursorEffortChoiceId(
  parts: CursorModelParts
): string | undefined {
  if (!parts.effort) {
    return undefined;
  }
  return parts.fast ? `${parts.effort}-fast` : parts.effort;
}

/** `reasoning` option from the composer SELECT, when present. */
export function cursorEffortFromOptions(
  options?: readonly { id: string; value: string | boolean }[] | null
): string | undefined {
  const picked = options?.find((item) => item.id === "reasoning");
  return typeof picked?.value === "string" && picked.value.length > 0
    ? picked.value
    : undefined;
}

function pickLiveFamilySlug(
  family: string,
  candidates: readonly string[],
  preferredEffort?: string
): string | undefined {
  const want =
    preferredEffort && preferredEffort.length > 0
      ? preferredEffort
      : CURSOR_DEFAULT_EFFORT;
  const preferred = unique([
    `${family}-${want}`,
    `${family}-${CURSOR_DEFAULT_EFFORT}`,
  ]);
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
 * `preferredEffort` (SELECT) wins over a suffix on the slug, then
 * `{family}-medium`, then the first live prefix. Without a live list,
 * known families fall back to `-medium`.
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
    preferredEffort && preferredEffort.length > 0 ? preferredEffort : undefined;
  const effort = preferred ?? cursorEffortChoiceId(parsed);

  if (live.length > 0) {
    const wantSlug = effort ? `${parsed.family}-${effort}` : trimmed;
    if (live.includes(wantSlug)) {
      return wantSlug;
    }
    if (!effort && live.includes(trimmed)) {
      return trimmed;
    }
    const candidates = liveMatchesFamily(live, parsed.family);
    const picked = pickLiveFamilySlug(parsed.family, candidates, effort);
    if (picked) {
      return picked;
    }
  }

  const canCompose =
    parsed.effort !== undefined ||
    cursorFamilyNeedsEffortFallback(parsed.family);
  if (effort && canCompose) {
    return `${parsed.family}-${effort}`;
  }
  if (parsed.effort) {
    return trimmed;
  }
  if (cursorFamilyNeedsEffortFallback(parsed.family)) {
    return `${parsed.family}-${CURSOR_DEFAULT_EFFORT}`;
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
      legacy: model.legacy,
      name: model.name,
      slug: model.slug,
    });
    if (model.variantSlugs) {
      for (const slug of model.variantSlugs) {
        const nested = parseCursorModel(slug);
        family.variants.push({
          effort: nested.effort,
          fast: nested.fast,
          slug,
        });
      }
    }
  }
  for (const family of byId.values()) {
    const seen = new Set<string>();
    family.variants = family.variants.filter((variant) => {
      if (seen.has(variant.slug)) {
        return false;
      }
      seen.add(variant.slug);
      return true;
    });
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
  return {
    desc: family.name ?? family.id,
    insert: `@${handle}/${family.id} `,
    key: `family-${family.id}`,
    kind: "family",
    name: `@${handle}/${family.id}`,
    search: familySearch(family),
    slug: family.id,
  };
}

function queryGoesPastFamily(
  query: string,
  family: CursorModelFamily
): boolean {
  const needle = query.trim().toLowerCase();
  const id = family.id.toLowerCase();
  if (needle.startsWith(`${id}-`)) {
    return true;
  }
  return family.aliases.some((alias) =>
    needle.startsWith(`${alias.toLowerCase()}-`)
  );
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
 * `@cursor/` rows are families. Effort variants appear only after the
 * query goes past the family (`cursor-grok-4.6-` / `grok-`); the composer
 * SELECT is the primary effort control.
 */
export function cursorMentionSuggestItems(
  handle: string,
  modelQuery: string,
  models: readonly CursorCatalogEntry[]
): CursorMentionSuggestItem[] {
  const families = groupCursorCatalog(models);
  const family = matchingFamily(modelQuery, families);
  if (
    family &&
    familyHasEffortChoices(family) &&
    queryGoesPastFamily(modelQuery, family)
  ) {
    return family.variants
      .filter((variant) => variant.effort !== undefined)
      .map((variant) => effortItem(handle, family, variant));
  }
  return families.map((item) => familyItem(handle, item));
}

const EFFORT_NAME_TAIL_RE =
  /\s*(?:\(|·|-)?\s*(?:Low|Medium|High|Extra High|Max|Minimal)(?:\s+Fast)?\)?\s*$/i;

function stripEffortDisplayName(name: string): string {
  if (hasCursorEffortSuffix(name)) {
    return cursorModelFamily(name);
  }
  return name.replace(EFFORT_NAME_TAIL_RE, "").trim();
}

function displayNameForFamily(family: CursorModelFamily): string {
  const stripped = stripEffortDisplayName(family.name);
  if (stripped.length > 0 && !hasCursorEffortSuffix(stripped)) {
    return stripped;
  }
  return family.id;
}

function variantEffortId(variant: CursorEffortVariant): string | undefined {
  if (!variant.effort) {
    return undefined;
  }
  return variant.fast ? `${variant.effort}-fast` : variant.effort;
}

/**
 * One picker row per family. Live `cursor-grok-4.6-low|medium|high` becomes
 * a single `cursor-grok-4.6` with `supportedReasoningLevels`.
 */
export function collapseCursorCatalog(
  models: readonly CursorCatalogEntry[]
): CursorFamilyRow[] {
  return groupCursorCatalog(models).map((family) => {
    const effortVariants = family.variants.filter((variant) => variant.effort);
    const efforts = unique(
      effortVariants
        .map((variant) => variantEffortId(variant))
        .filter((id): id is string => Boolean(id))
    );
    const row: CursorFamilyRow = {
      name: displayNameForFamily(family),
      slug: family.id,
    };
    if (family.aliases.length > 0) {
      row.aliases = family.aliases;
    }
    if (family.variants.some((variant) => variant.default)) {
      row.default = true;
    }
    if (family.variants.some((variant) => variant.legacy)) {
      row.legacy = true;
    }
    if (efforts.length > 0) {
      row.defaultReasoningLevel = efforts.includes(CURSOR_DEFAULT_EFFORT)
        ? CURSOR_DEFAULT_EFFORT
        : efforts[0];
      row.supportedReasoningLevels = efforts;
      row.variantSlugs = unique(effortVariants.map((variant) => variant.slug));
    }
    return row;
  });
}
