/**
 * Tiny ranked fuzzy matcher for composer @ / menus.
 * Prefix and substring beat subsequence; adjacent typos still rank.
 */

const EXACT = 10_000;
const PREFIX = 8_000;
const WORD_START = 6_000;
const CONTAINS = 4_000;
const SUBSEQUENCE = 200;
const TYPO = 350;

function damerauLevenshtein(left: string, right: string): number {
  const leftLen = left.length;
  const rightLen = right.length;
  const rows: number[][] = Array.from({ length: leftLen + 1 }, () =>
    Array.from({ length: rightLen + 1 }, () => 0)
  );
  for (let i = 0; i <= leftLen; i += 1) {
    const row = rows[i];
    if (row) {
      row[0] = i;
    }
  }
  for (let j = 0; j <= rightLen; j += 1) {
    const row = rows[0];
    if (row) {
      row[j] = j;
    }
  }
  for (let i = 1; i <= leftLen; i += 1) {
    const row = rows[i];
    const prev = rows[i - 1];
    const before = rows[i - 2];
    if (!row || !prev) {
      continue;
    }
    const leftChar = left[i - 1];
    for (let j = 1; j <= rightLen; j += 1) {
      const rightChar = right[j - 1];
      const cost = leftChar === rightChar ? 0 : 1;
      const del = (prev[j] ?? 0) + 1;
      const ins = (row[j - 1] ?? 0) + 1;
      const sub = (prev[j - 1] ?? 0) + cost;
      let best = Math.min(del, ins, sub);
      if (
        i > 1 &&
        j > 1 &&
        before &&
        leftChar === right[j - 2] &&
        left[i - 2] === rightChar
      ) {
        best = Math.min(best, (before[j - 2] ?? 0) + 1);
      }
      row[j] = best;
    }
  }
  return rows[leftLen]?.[rightLen] ?? Math.max(leftLen, rightLen);
}

function typoAllowance(needle: string): number {
  if (needle.length < 3) {
    return 0;
  }
  return needle.length <= 4 ? 1 : 2;
}

function subsequenceScore(haystack: string, needle: string): number {
  let from = 0;
  let score = SUBSEQUENCE;
  let consecutive = 0;
  let first = -1;
  for (const char of needle) {
    const found = haystack.indexOf(char, from);
    if (found === -1) {
      return 0;
    }
    if (first === -1) {
      first = found;
    }
    if (found === from) {
      consecutive += 1;
      score += 12 + consecutive * 8;
    } else {
      consecutive = 0;
      score += 4;
    }
    from = found + 1;
  }
  score -= first;
  score -= haystack.length - needle.length;
  return Math.max(1, score);
}

function typoScore(haystack: string, needle: string): number {
  const allowance = typoAllowance(needle);
  if (allowance === 0) {
    return 0;
  }
  if (Math.abs(haystack.length - needle.length) > allowance) {
    return 0;
  }
  const distance = damerauLevenshtein(haystack, needle);
  if (distance === 0 || distance > allowance) {
    return 0;
  }
  return Math.max(
    1,
    TYPO - distance * 60 - Math.abs(haystack.length - needle.length)
  );
}

/** Higher is a closer match. 0 means no match. */
export function fuzzyScore(haystack: string, needle: string): number {
  if (!needle) {
    return 1;
  }
  if (!haystack) {
    return 0;
  }
  if (haystack === needle) {
    return EXACT;
  }
  if (haystack.startsWith(needle)) {
    return PREFIX - (haystack.length - needle.length);
  }
  const index = haystack.indexOf(needle);
  if (index !== -1) {
    const before = haystack[index - 1];
    const wordStart =
      index === 0 || before === undefined || /[\s@/_.:-]/.test(before);
    const rank = wordStart ? WORD_START : CONTAINS;
    return rank - index - (haystack.length - needle.length);
  }
  const sub = subsequenceScore(haystack, needle);
  const typo = typoScore(haystack, needle);
  return Math.max(sub, typo);
}

const TOKEN_SPLIT = /[\s@/_.:-]+/;

function tokenFieldScore(field: string, needle: string): number {
  const haystack = field.toLowerCase();
  if (!haystack) {
    return 0;
  }
  const stripped = haystack.replace(/^[@/]+/, "");
  let best = Math.max(
    fuzzyScore(haystack, needle),
    fuzzyScore(stripped, needle)
  );
  for (const token of stripped.split(TOKEN_SPLIT)) {
    if (token.length === 0) {
      continue;
    }
    best = Math.max(best, fuzzyScore(token, needle));
  }
  return best;
}

/**
 * `@cursor/grok` vs `@cursor/cursor-grok-4.6`: match each slash-separated
 * query part against a later path segment (handle, then model slug).
 */
function pathFieldScore(field: string, needle: string): number {
  if (!needle.includes("/")) {
    return 0;
  }
  const needleParts = needle.split("/").filter((part) => part.length > 0);
  const hayParts = field
    .toLowerCase()
    .replace(/^[@/]+/, "")
    .split("/")
    .filter((part) => part.length > 0);
  if (needleParts.length === 0 || hayParts.length === 0) {
    return 0;
  }
  let hayIndex = 0;
  let total = 0;
  for (const part of needleParts) {
    let found = 0;
    while (hayIndex < hayParts.length) {
      const current = hayParts[hayIndex] ?? "";
      const rest = hayParts.slice(hayIndex).join("/");
      hayIndex += 1;
      const partScore = Math.max(
        tokenFieldScore(current, part),
        tokenFieldScore(rest, part)
      );
      if (partScore > 0) {
        found = partScore;
        break;
      }
    }
    if (found === 0) {
      return 0;
    }
    total += found;
  }
  return total;
}

/** Best score across the raw field, tokens, and `@provider/model` path parts. */
export function fuzzyFieldScore(field: string, needle: string): number {
  const normalized = needle.toLowerCase();
  if (!normalized) {
    return field ? 1 : 0;
  }
  return Math.max(
    tokenFieldScore(field, normalized),
    pathFieldScore(field, normalized)
  );
}
