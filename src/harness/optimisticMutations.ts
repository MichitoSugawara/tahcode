import type { OptimisticLocalStore } from "convex/browser";
import { useMutation } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useCallback } from "react";

import { useOrg } from "@/harness/OrgContext";
import { placeholderId } from "@/lib/optimistic";
import type {
  ProviderDriverKind,
  ProviderOptionSelection,
} from "@/lib/providers";

import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

/* ─────────────────────────────────────────────────────────
 * OPTIMISTIC MUTATIONS — the create flows that navigate. Each
 * returns the placeholder the caller can open right away plus
 * the promise of the real id; `org.goPendingChat` does the swap.
 * List queries are patched through Convex's local store, so the
 * sidebar / tabs / chat page all read the placeholder the same
 * way they read a server row, and a failed mutation rolls it back.
 * ───────────────────────────────────────────────────────── */

type ChatSummary = FunctionReturnType<typeof api.chats.list>[number];
type ProjectSummary = FunctionReturnType<typeof api.projects.list>[number];

function appendChat(store: OptimisticLocalStore, chat: ChatSummary) {
  for (const { args, value } of store.getAllQueries(api.chats.list)) {
    if (value === undefined || args.orgId !== chat.orgId) {
      continue;
    }
    if (args.projectId !== undefined && args.projectId !== chat.projectId) {
      continue;
    }
    if (args.kind !== undefined && args.kind !== chat.kind) {
      continue;
    }
    store.setQuery(api.chats.list, args, [...value, chat]);
  }
}

function appendProject(store: OptimisticLocalStore, project: ProjectSummary) {
  for (const { args, value } of store.getAllQueries(api.projects.list)) {
    if (value === undefined || args.orgId !== project.orgId) {
      continue;
    }
    store.setQuery(api.projects.list, args, [...value, project]);
  }
}

/* mirrors the server's normalisation so the placeholder reads like the row it becomes */
const chatTitle = (title: string) =>
  title.trim().slice(0, 80) || "Untitled chat";
const projectSlug = (name: string) =>
  name
    .toLowerCase()
    .normalize("NFKD")
    .replaceAll(/[^\w\s-]/g, "")
    .replaceAll(/[\s_]+/g, "-")
    .replaceAll(/-+/g, "-")
    .replaceAll(/^-|-$/g, "")
    .slice(0, 40) || "item";

export interface ChatAgentArgs {
  driverKind?: ProviderDriverKind;
  model?: string;
  options?: ProviderOptionSelection[];
}
export type CreateChatArgs = {
  profileId?: Id<"skillProfiles">;
  projectId: Id<"projects">;
  title: string;
  visibility: "inherit" | "private";
} & ChatAgentArgs;

/** Create a project chat; the placeholder shows up in the sidebar immediately. */
export function useCreateProjectChat() {
  const { org } = useOrg();
  const mutate = useMutation(api.chats.createProjectChat);
  return useCallback(
    (
      args: CreateChatArgs,
      placeholder: Id<"chats"> = placeholderId("chats")
    ) => {
      const optimistic = mutate.withOptimisticUpdate((store, input) =>
        appendChat(store, {
          _id: placeholder,
          driverKind: input.driverKind,
          kind: "project",
          model: input.driverKind ? input.model : undefined,
          orgId: org._id,
          ownerId: undefined,
          profileId: input.profileId,
          projectId: input.projectId,
          options: input.driverKind ? input.options : undefined,
          title: chatTitle(input.title),
          visibility: input.visibility,
        })
      );
      return { created: optimistic(args), placeholder };
    },
    [mutate, org._id]
  );
}

export interface CreateProjectArgs {
  name: string;
  visibility: "org" | "private";
  repoUrl?: string;
  cwd?: string;
  folders?: { cwd: string; runtimeId: Id<"runtimes"> }[];
}

/** Create a project together with its first chat. The project and the chat placeholder
 *  appear at once; the chat is created for real once the project id exists. */
export function useCreateProjectWithChat() {
  const { org } = useOrg();
  const mutate = useMutation(api.projects.create);
  const createChat = useCreateProjectChat();
  return useCallback(
    (args: CreateProjectArgs, firstChatTitle: string) => {
      const projectPlaceholder = placeholderId("projects");
      const chatPlaceholder = placeholderId("chats");
      const optimistic = mutate.withOptimisticUpdate((store, input) => {
        appendProject(store, {
          _id: projectPlaceholder,
          cwd: input.cwd ?? input.folders?.[0]?.cwd,
          folders: input.folders ?? [],
          name: input.name.trim().slice(0, 80),
          orgId: input.orgId,
          profileId: undefined,
          repoUrl: input.repoUrl,
          slug: projectSlug(input.name),
          visibility: input.visibility,
        });
        appendChat(store, {
          _id: chatPlaceholder,
          driverKind: undefined,
          kind: "project",
          model: undefined,
          orgId: input.orgId,
          ownerId: undefined,
          profileId: undefined,
          projectId: projectPlaceholder,
          options: undefined,
          title: chatTitle(firstChatTitle),
          visibility: "inherit",
        });
      });
      const projectCreated = optimistic({ orgId: org._id, ...args });
      /* re-insert the same chat placeholder under the real project while the second mutation runs,
       * so the page the user is already looking at never loses its row */
      const chatCreated = projectCreated.then(
        (projectId) =>
          createChat(
            { projectId, title: firstChatTitle, visibility: "inherit" },
            chatPlaceholder
          ).created
      );
      return { chatCreated, chatPlaceholder, projectCreated };
    },
    [mutate, createChat, org._id]
  );
}

/** Bind a chat to a provider + model; the composer's picker and the sidebar row reflect it at once. */
export function useSetChatAgent() {
  return useMutation(api.chats.setAgent).withOptimisticUpdate((store, args) => {
    const patch = {
      driverKind: args.driverKind,
      model: args.model,
      options: args.options,
    };
    for (const { args: listArgs, value } of store.getAllQueries(
      api.chats.list
    )) {
      if (
        value === undefined ||
        !value.some((chat) => chat._id === args.chatId)
      ) {
        continue;
      }
      store.setQuery(
        api.chats.list,
        listArgs,
        value.map((chat) =>
          chat._id === args.chatId ? { ...chat, ...patch } : chat
        )
      );
    }
    const current = store.getQuery(api.chats.get, { chatId: args.chatId });
    if (current) {
      store.setQuery(
        api.chats.get,
        { chatId: args.chatId },
        { ...current, ...patch }
      );
    }
  });
}

/** Bind a skill profile to a chat. */
export function useSetChatProfile() {
  return useMutation(api.chats.setProfile).withOptimisticUpdate(
    (store, args) => {
      const patch = { profileId: args.profileId ?? undefined };
      for (const { args: listArgs, value } of store.getAllQueries(
        api.chats.list
      )) {
        if (
          value === undefined ||
          !value.some((chat) => chat._id === args.chatId)
        ) {
          continue;
        }
        store.setQuery(
          api.chats.list,
          listArgs,
          value.map((chat) =>
            chat._id === args.chatId ? { ...chat, ...patch } : chat
          )
        );
      }
      const current = store.getQuery(api.chats.get, { chatId: args.chatId });
      if (current) {
        store.setQuery(
          api.chats.get,
          { chatId: args.chatId },
          { ...current, ...patch }
        );
      }
    }
  );
}

/** Bind a skill profile as a project's default for new chats. */
export function useSetProjectProfile() {
  return useMutation(api.projects.setProfile).withOptimisticUpdate(
    (store, args) => {
      const patch = { profileId: args.profileId ?? undefined };
      for (const { args: listArgs, value } of store.getAllQueries(
        api.projects.list
      )) {
        if (
          value === undefined ||
          !value.some((project) => project._id === args.projectId)
        ) {
          continue;
        }
        store.setQuery(
          api.projects.list,
          listArgs,
          value.map((project) =>
            project._id === args.projectId ? { ...project, ...patch } : project
          )
        );
      }
      const current = store.getQuery(api.projects.get, {
        projectId: args.projectId,
      });
      if (current) {
        store.setQuery(
          api.projects.get,
          { projectId: args.projectId },
          { ...current, ...patch }
        );
      }
    }
  );
}
