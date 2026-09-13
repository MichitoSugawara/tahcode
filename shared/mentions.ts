import { cursorEffortChoiceId, parseCursorModel } from "./cursorModels.ts";
import type { ProviderOptionSelection } from "./modelOptions.ts";
import { upsertOptionSelection } from "./modelOptions.ts";
import {
  isValidModelSlug,
  providerKindFromHandle,
  resolveModelSlug,
} from "./providers.ts";
import type { ProviderDriverKind } from "./providers.ts";

export type MentionKind = "user" | "runtime" | "provider" | "agent";

export interface ParsedMention {
  kind: MentionKind;
  handle: string;
  raw: string;
  providerKind?: ProviderDriverKind;
  /** `@provider/model` — the model slug after the first slash, alias-resolved. */
  model?: string;
}

/** Provider + optional model a message should run with. */
export interface AgentTarget {
  driverKind: ProviderDriverKind;
  /** `undefined` = the CLI's own default model (no model flag). */
  model?: string;
  /** t3code ModelSelection.options — dropped when a mention names another provider. */
  options?: ProviderOptionSelection[];
}

const MENTION_RE = /@([a-zA-Z0-9_./-]+)/g;

export function parseMentions(text: string): ParsedMention[] {
  const found: ParsedMention[] = [];
  const seen = new Set<string>();
  for (const match of text.matchAll(MENTION_RE)) {
    // Sentence punctuation right after a handle ("@claude." / "@cursor/") is
    // not part of it.
    const handle = match[1]?.replace(/[./]+$/, "");
    if (!handle) {
      continue;
    }
    const key = handle.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    found.push(classifyMention(handle));
  }
  return found;
}

/**
 * Agent handles come in two shapes:
 *   `@cursor`                 — provider, CLI default model
 *   `@cursor/muse-spark-1.3`  — provider + model (everything after the first `/`,
 *                               so OpenCode's `anthropic/claude-sonnet-5` survives)
 * `@agent` / `@harness` mean "whatever this chat runs by default"; `@rt-<slug>`
 * targets a machine. Anything else is a person.
 */
export function classifyMention(
  handle: string,
  raw = `@${handle}`
): ParsedMention {
  const slash = handle.indexOf("/");
  const head = (slash === -1 ? handle : handle.slice(0, slash)).toLowerCase();
  const tail = slash === -1 ? "" : handle.slice(slash + 1);
  if (head === "agent" || head === "harness") {
    return { handle: head, kind: "agent", raw };
  }
  const providerKind = providerKindFromHandle(head);
  if (providerKind) {
    const model =
      tail && isValidModelSlug(tail)
        ? resolveModelSlug(providerKind, tail)
        : undefined;
    return { handle: head, kind: "provider", model, providerKind, raw };
  }
  const key = handle.toLowerCase();
  if (key.startsWith("rt-") || key.startsWith("runtime-")) {
    return { handle: key.replace(/^(rt|runtime)-/, ""), kind: "runtime", raw };
  }
  return { handle: key, kind: "user", raw };
}

export type ChatKind = "dm" | "project";

/**
 * Phase 1 reaction rule (Multica-like, no Focus):
 * - Personal DMs: agents always respond
 * - Every other chat: only when @mentioned (agent / provider / runtime)
 */
export function shouldDispatchAgent(input: {
  chatKind: ChatKind;
  mentions: readonly ParsedMention[];
}): boolean {
  if (input.chatKind === "dm") {
    return true;
  }
  return input.mentions.some(
    (mention) =>
      mention.kind === "agent" ||
      mention.kind === "provider" ||
      mention.kind === "runtime"
  );
}

export function preferredProvider(
  mentions: readonly ParsedMention[],
  fallback: ProviderDriverKind
): ProviderDriverKind {
  const mentioned = mentions.find((mention) => mention.providerKind);
  return mentioned?.providerKind ?? fallback;
}

/**
 * Resolve what a message runs on. The first provider mention wins; its model
 * comes from the mention itself (`@cursor/muse-spark-1.3`), else from the
 * fallback when it names the same provider (a chat bound to `cursor/auto`
 * keeps that model for a bare `@cursor`), else the CLI default. Without a
 * provider mention the fallback (chat binding / composer pick) is used as is.
 */
function withFallbackOptions(
  target: AgentTarget,
  fallback: AgentTarget,
  sameProvider: boolean
): AgentTarget {
  if (!sameProvider || !fallback.options || fallback.options.length === 0) {
    return target;
  }
  return { ...target, options: fallback.options };
}

/**
 * Rewrite `@cursor/<alias>` (e.g. `@cursor/grok`) to the family id
 * (`@cursor/cursor-grok-4.6`). Effort stays on the SELECT, so a bare
 * family mention is not rewritten to `-medium`.
 */
export function expandResolvedMentions(text: string): string {
  return text.replaceAll(
    /(^|[^A-Za-z0-9_@.+-])@(cursor)\/([A-Za-z0-9_.\-/]+)/gi,
    (full, boundary: string, handle: string, slug: string) => {
      const resolved = resolveModelSlug("cursor", slug);
      if (!resolved || resolved === slug) {
        return full;
      }
      return `${boundary}@${handle}/${resolved}`;
    }
  );
}

function applyCursorMentionEffort(target: AgentTarget): AgentTarget {
  if (target.driverKind !== "cursor" || !target.model) {
    return target;
  }
  const parsed = parseCursorModel(target.model);
  const effort = cursorEffortChoiceId(parsed);
  if (!effort) {
    return target;
  }
  const options = upsertOptionSelection(target.options, "reasoning", effort);
  const next: AgentTarget = {
    driverKind: "cursor",
    model: parsed.family,
  };
  if (options) {
    next.options = options;
  }
  return next;
}

export function preferredTarget(
  mentions: readonly ParsedMention[],
  fallback: AgentTarget
): AgentTarget {
  const mentioned = mentions.find((mention) => mention.providerKind);
  if (!mentioned?.providerKind) {
    return withFallbackOptions(
      { driverKind: fallback.driverKind, model: fallback.model },
      fallback,
      true
    );
  }
  if (mentioned.model) {
    return applyCursorMentionEffort(
      withFallbackOptions(
        { driverKind: mentioned.providerKind, model: mentioned.model },
        fallback,
        mentioned.providerKind === fallback.driverKind
      )
    );
  }
  if (mentioned.providerKind === fallback.driverKind) {
    return withFallbackOptions(
      { driverKind: fallback.driverKind, model: fallback.model },
      fallback,
      true
    );
  }
  return { driverKind: mentioned.providerKind, model: undefined };
}
