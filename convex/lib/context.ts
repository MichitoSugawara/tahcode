import type { Doc } from "../_generated/dataModel";
import type { ParsedMention } from "./mentions";

export type AgentContext = {
  chat: { id: string; kind: string; title: string };
  project: {
    id: string;
    name: string;
    slug: string;
    cwd?: string;
    repoUrl?: string;
  } | null;
  mentions: ParsedMention[];
  history: { author: string; body: string; driverKind?: string }[];
};

export function buildAgentContext(input: {
  chat: Doc<"chats">;
  project: Doc<"projects"> | null;
  mentions: ParsedMention[];
  history: Doc<"messages">[];
}): AgentContext {
  return {
    chat: {
      id: String(input.chat._id),
      kind: input.chat.kind,
      title: input.chat.title,
    },
    project: input.project
      ? {
          id: String(input.project._id),
          name: input.project.name,
          slug: input.project.slug,
          cwd: input.project.cwd,
          repoUrl: input.project.repoUrl,
        }
      : null,
    mentions: input.mentions,
    history: input.history.slice(-30).map((message) => ({
      author: message.authorType,
      body: message.body.slice(0, 4000),
      driverKind: message.driverKind,
    })),
  };
}
