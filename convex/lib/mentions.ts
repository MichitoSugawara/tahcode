/**
 * Mention grammar for Convex functions — re-exported from `shared/` so the
 * server applies exactly the parsing the composer and tests use.
 */
export {
  classifyMention,
  parseMentions,
  preferredProvider,
  preferredTarget,
  shouldDispatchAgent,
} from "../../shared/mentions.ts";
export type { AgentTarget, ChatKind, MentionKind, ParsedMention } from "../../shared/mentions.ts";
