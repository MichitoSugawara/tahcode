// Map GitHub pull requests to Convex / Cloudflare preview identifiers.
// Open PRs own `pr-N` plus the branch slug. Closed/merged leftovers are
// the only names hygiene may delete.
import { spawnSync } from "node:child_process";

import { slugPreviewName } from "./convex-preview-names.mjs";

export const GH_CLOSED_PR_LIMIT = 50;
export const GH_MERGED_PR_LIMIT = 30;

export function parseGhPrListJson(text) {
  const parsed = (() => {
    try {
      return JSON.parse(String(text ?? ""));
    } catch {
      return null;
    }
  })();
  if (!Array.isArray(parsed)) {
    return [];
  }
  return parsed
    .map((row) => {
      const number = Number(row?.number);
      if (!Number.isInteger(number) || number <= 0) {
        return null;
      }
      return {
        headRefName: typeof row.headRefName === "string" ? row.headRefName : "",
        number,
      };
    })
    .filter((row) => row !== null);
}

export function previewNamesFromPullRequests(prs) {
  const seen = new Set();
  const names = [];
  for (const pr of prs ?? []) {
    const candidates = [`pr-${pr.number}`, slugPreviewName(pr.headRefName)];
    for (const raw of candidates) {
      const name = slugPreviewName(raw);
      if (!name || seen.has(name)) {
        continue;
      }
      seen.add(name);
      names.push(name);
    }
  }
  return names;
}

export function mergeNameLists(...lists) {
  const seen = new Set();
  const out = [];
  for (const list of lists) {
    for (const raw of list ?? []) {
      const name = slugPreviewName(raw);
      if (!name || seen.has(name)) {
        continue;
      }
      seen.add(name);
      out.push(name);
    }
  }
  return out;
}

export function classifyGithubPreviewNames(input) {
  const exclude = previewNamesFromPullRequests(input.open);
  const excludeSet = new Set(exclude);
  const prune = [];
  const seen = new Set();
  for (const name of [
    ...previewNamesFromPullRequests(input.closed),
    ...previewNamesFromPullRequests(input.merged),
  ]) {
    if (excludeSet.has(name) || seen.has(name)) {
      continue;
    }
    seen.add(name);
    prune.push(name);
  }
  return { exclude, prune };
}

export function listGithubPullRequests(input) {
  const spawnImpl = input.spawnImpl ?? spawnSync;
  const args = [
    "pr",
    "list",
    "--state",
    input.state,
    "--json",
    "number,headRefName",
  ];
  if (input.limit) {
    args.push("--limit", String(input.limit));
  }
  const result = spawnImpl("gh", args, { encoding: "utf-8" });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  if ((result.status ?? 1) !== 0) {
    return { kind: "error", output, prs: [] };
  }
  return { kind: "ok", output, prs: parseGhPrListJson(result.stdout) };
}

export function discoverGithubPreviewNames(input = {}) {
  const spawnImpl = input.spawnImpl ?? spawnSync;
  const open = listGithubPullRequests({
    spawnImpl,
    state: "open",
  });
  const closed = listGithubPullRequests({
    limit: input.closedLimit ?? GH_CLOSED_PR_LIMIT,
    spawnImpl,
    state: "closed",
  });
  const merged = listGithubPullRequests({
    limit: input.mergedLimit ?? GH_MERGED_PR_LIMIT,
    spawnImpl,
    state: "merged",
  });
  const classified = classifyGithubPreviewNames({
    closed: closed.prs,
    merged: merged.prs,
    open: open.prs,
  });
  return {
    ...classified,
    closedOk: closed.kind === "ok",
    mergedOk: merged.kind === "ok",
    openOk: open.kind === "ok",
  };
}
