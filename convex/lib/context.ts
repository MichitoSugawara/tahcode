import type { Doc } from "../_generated/dataModel";
import type { ParsedMention } from "./mentions";

export interface AgentContext {
  chat: { id: string; kind: string; title: string };
  project: {
    id: string;
    name: string;
    slug: string;
    branch?: string;
    cwd?: string;
    repoUrl?: string;
  } | null;
  mentions: ParsedMention[];
  history: { author: string; body: string; driverKind?: string }[];
  skills: { description: string; name: string; slug: string }[];
}

export function buildAgentContext(input: {
  branch?: string;
  chat: Doc<"chats">;
  cwd?: string;
  project: Doc<"projects"> | null;
  mentions: ParsedMention[];
  history: Doc<"messages">[];
  skills?: { description: string; name: string; slug: string }[];
}): AgentContext {
  return {
    chat: {
      id: String(input.chat._id),
      kind: input.chat.kind,
      title: input.chat.title,
    },
    history: input.history.slice(-30).map((message) => ({
      author: message.authorType,
      body: message.body.slice(0, 4000),
      driverKind: message.driverKind,
    })),
    mentions: input.mentions,
    skills: input.skills ?? [],
    project: input.project
      ? {
          id: String(input.project._id),
          name: input.project.name,
          slug: input.project.slug,
          branch: input.branch,
          cwd: input.cwd ?? input.project.cwd,
          repoUrl: input.project.repoUrl,
        }
      : null,
  };
}
