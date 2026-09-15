import { useAuthActions } from "@convex-dev/auth/react";
import { STALE_RUNTIME_MS, isLiveRuntime } from "@shared/runtimeHealth.ts";
import { useMutation, useQuery } from "convex/react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";

import {
  closeOtherTabs as keepOnlyTab,
  closeTabsToTheRight as trimTabsRight,
} from "@/harness/tabActions";
import { isPlaceholderId, trackPlaceholder } from "@/lib/optimistic";
import {
  orgChatPath,
  orgConnectorsPath,
  orgHomePath,
  orgNewChatPath,
  orgSettingsPath,
} from "@/lib/orgPaths";
import type {
  InstallMethod,
  LiveModel,
  ProviderDriverKind,
  ProviderOptionSelection,
} from "@/lib/providers";
import {
  isProviderKind,
  retainValidOptions,
  sanitizeOptionSelections,
} from "@/lib/providers";
import { useStoredState } from "@/lib/storage";

import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

export type OrgRole = "owner" | "admin" | "member";

export interface Me {
  _id: Id<"users">;
  name?: string;
  email?: string;
  handle?: string;
  image?: string;
}
export interface OrgSummary {
  _id: Id<"orgs">;
  name: string;
  slug: string;
  role: OrgRole;
}
export interface Project {
  _id: Id<"projects">;
  orgId: Id<"orgs">;
  name: string;
  slug: string;
  visibility: "org" | "private";
  cwd?: string;
  repoUrl?: string;
  profileId?: Id<"skillProfiles">;
}
export interface Chat {
  _id: Id<"chats">;
  orgId: Id<"orgs">;
  projectId?: Id<"projects">;
  kind: "dm" | "project";
  title: string;
  visibility: "inherit" | "private";
  ownerId?: Id<"users">;
  /** default agent bound to the chat (provider + optional model slug + effort options) */
  driverKind?: ProviderDriverKind;
  model?: string;
  options?: ProviderOptionSelection[];
  profileId?: Id<"skillProfiles">;
}
export interface RuntimeProvider {
  available: boolean;
  binaryPath?: string;
  driverKind: ProviderDriverKind;
  installMethod?: InstallMethod;
  /** live catalog from the CLI's `models` command; undefined = never checked, [] = checked, none (see modelsError) */
  models?: LiveModel[];
  modelsCheckedAt?: number;
  modelsError?: string;
  /** display form of the allowlisted update the bridge would run; undefined = manual only */
  updateCommand?: string;
  version?: string;
}
export interface Runtime {
  _id: Id<"runtimes">;
  /** tahcode CLI version + capabilities ("maintenance", "liveModels", "agentTools") the bridge reported; empty for old bridges */
  bridgeVersion?: string;
  canUse: boolean;
  capabilities: string[];
  cwd?: string;
  grants: {
    _id: Id<"runtimeGrants">;
    targetType: "user" | "role";
    targetUserId?: Id<"users">;
    targetRole?: OrgRole;
  }[];
  hostname?: string;
  lastSeenAt?: number;
  /** owner setting: org Owner/Admin may trigger CLI updates here */
  maintenanceByAdmins: boolean;
  name: string;
  ownerUserId: Id<"users">;
  providers: RuntimeProvider[];
  slug: string;
  status: "online" | "offline";
}
export interface Member {
  user: Me;
  role: OrgRole;
}

export type DialogState =
  | { kind: "createOrg" }
  | { kind: "createProject" }
  | { kind: "registerRuntime" }
  | { kind: "grant"; runtimeId: Id<"runtimes"> }
  | {
      kind: "runtimeProviders";
      runtimeId: Id<"runtimes">;
      focus?: ProviderDriverKind;
    }
  | { kind: "invite" }
  | null;

/** A runtime is "live" when its heartbeat is fresh (server treats >90s as dead). */
export const STALE_AFTER_MS = STALE_RUNTIME_MS;
export const isLive = isLiveRuntime;

interface OrgContextValue {
  me: Me;
  orgs: OrgSummary[];
  org: OrgSummary;
  role: OrgRole;
  isAdmin: boolean;
  isOwner: boolean;
  projects: Project[] | undefined;
  chats: Chat[] | undefined;
  runtimes: Runtime[] | undefined;
  members: Member[] | undefined;
  dmId: Id<"chats"> | null;
  now: number;
  /** last-used agent in this org — the default for chats that have no binding yet */
  provider: ProviderDriverKind;
  model: string | null;
  options: ProviderOptionSelection[] | undefined;
  setAgent: (
    kind: ProviderDriverKind,
    model?: string | null,
    options?: ProviderOptionSelection[] | null
  ) => void;
  runtimeId: Id<"runtimes"> | null;
  setRuntimeId: (id: Id<"runtimes"> | null) => void;
  tabs: Id<"chats">[];
  openTab: (id: Id<"chats">) => void;
  closeTab: (id: Id<"chats">) => void;
  closeOtherTabs: (keep: Id<"chats">) => void;
  closeTabsToTheRight: (from: Id<"chats">) => void;
  dialog: DialogState;
  openDialog: (state: NonNullable<DialogState>) => void;
  closeDialog: () => void;
  goHome: () => void;
  goNewChat: (projectId?: Id<"projects">) => void;
  goChat: (id: Id<"chats">) => void;
  /** Open a chat whose create is still in flight: shows `placeholder` now, swaps the URL and tab
   *  to the real id when `created` resolves, and returns to the previous screen if it fails. */
  goPendingChat: (
    placeholder: Id<"chats">,
    created: Promise<Id<"chats">>
  ) => void;
  goSettings: (hash?: string) => void;
  goConnectors: () => void;
  switchOrg: (id: Id<"orgs">) => void;
  signOut: () => void;
}

const OrgContext = createContext<OrgContextValue | null>(null);

export function useOrg(): OrgContextValue {
  const value = useContext(OrgContext);
  if (!value) {
    throw new Error("useOrg must be used inside <OrgProvider>");
  }
  return value;
}

export function OrgProvider({
  me,
  orgs,
  org,
  children,
}: {
  me: Me;
  orgs: OrgSummary[];
  org: OrgSummary;
  children: ReactNode;
}) {
  const navigate = useNavigate();
  const { signOut } = useAuthActions();
  const orgId = org._id;

  const projects = useQuery(api.projects.list, { orgId }) as
    | Project[]
    | undefined;
  const chats = useQuery(api.chats.list, { orgId }) as Chat[] | undefined;
  const runtimes = useQuery(api.runtimes.list, { orgId }) as
    | Runtime[]
    | undefined;
  const members = useQuery(api.orgs.members, { orgId }) as Member[] | undefined;

  const ensureDm = useMutation(api.chats.ensureDm);
  const [dmId, setDmId] = useState<Id<"chats"> | null>(null);
  useEffect(() => {
    let cancelled = false;
    setDmId(null);
    ensureDm({ orgId })
      .then((id) => {
        if (!cancelled) {
          setDmId(id);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [orgId, ensureDm]);

  /* keep the Personal DM thread subscribed while the org is open: the home composer sends there
   * and jumps in, so the thread must already be local (same args as ChatPage) for the jump to be instant */
  useQuery(api.messages.list, dmId ? { chatId: dmId, limit: 80 } : "skip");

  /* one shared clock so "online" badges age out together */
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(t);
  }, []);

  const [storedProvider, setStoredProvider] = useStoredState<string>(
    `th:${orgId}:provider`,
    "codex"
  );
  const provider: ProviderDriverKind = isProviderKind(storedProvider)
    ? storedProvider
    : "codex";
  const [storedModel, setStoredModel] = useStoredState<string | null>(
    `th:${orgId}:model`,
    null
  );
  const model =
    typeof storedModel === "string" && storedModel.length > 0
      ? storedModel
      : null;
  const [storedOptions, setStoredOptions] = useStoredState<
    ProviderOptionSelection[] | null
  >(`th:${orgId}:options`, null);
  const options = sanitizeOptionSelections(storedOptions);
  const setAgent = useCallback(
    (
      kind: ProviderDriverKind,
      nextModel?: string | null,
      nextOptions?: ProviderOptionSelection[] | null
    ) => {
      setStoredProvider(kind);
      setStoredModel(nextModel ?? null);
      const kept =
        nextOptions === undefined
          ? retainValidOptions(kind, nextModel ?? null, storedOptions)
          : sanitizeOptionSelections(nextOptions);
      setStoredOptions(kept ?? null);
    },
    [setStoredProvider, setStoredModel, setStoredOptions, storedOptions]
  );
  const [storedRuntime, setStoredRuntime] = useStoredState<string | null>(
    `th:${orgId}:runtime`,
    null
  );
  const runtimeId = (storedRuntime as Id<"runtimes"> | null) ?? null;

  const [tabs, setTabs] = useStoredState<Id<"chats">[]>(`th:${orgId}:tabs`, []);
  const openTab = useCallback(
    (id: Id<"chats">) =>
      setTabs((current) => (current.includes(id) ? current : [...current, id])),
    [setTabs]
  );
  const closeTab = useCallback(
    (id: Id<"chats">) =>
      setTabs((current) => current.filter((item) => item !== id)),
    [setTabs]
  );
  const closeOtherTabs = useCallback(
    (keep: Id<"chats">) => setTabs((current) => keepOnlyTab(current, keep)),
    [setTabs]
  );
  const closeTabsToTheRight = useCallback(
    (from: Id<"chats">) => setTabs((current) => trimTabsRight(current, from)),
    [setTabs]
  );
  const swapTab = useCallback(
    (from: Id<"chats">, to: Id<"chats">) =>
      setTabs((current) => {
        const swapped = current.map((item) => (item === from ? to : item));
        const next = swapped.filter(
          (item, index) => item !== to || swapped.indexOf(item) === index
        );
        return next.includes(to) ? next : [...next, to];
      }),
    [setTabs]
  );

  const goPendingChat = useCallback(
    (placeholder: Id<"chats">, created: Promise<Id<"chats">>) => {
      /* BrowserRouter: window.location is the router's location, read at call time so the memo below stays stable.
       * Never fall back onto another placeholder page — by the time we return it may have been swapped away. */
      const here = `${window.location.pathname}${window.location.search}`;
      const from = isPlaceholderId(window.location.pathname.split("/c/")[1])
        ? orgHomePath(org.slug)
        : here;
      const chatPath = (id: Id<"chats">) => orgChatPath(org.slug, String(id));
      const stillHere = () =>
        window.location.pathname === chatPath(placeholder);
      openTab(placeholder);
      navigate(chatPath(placeholder));
      trackPlaceholder(placeholder, created).then(
        (id) => {
          swapTab(placeholder, id);
          if (stillHere()) {
            navigate(chatPath(id), { replace: true });
          }
        },
        () => {
          closeTab(placeholder);
          if (stillHere()) {
            navigate(from, { replace: true });
          }
        }
      );
    },
    [org.slug, openTab, closeTab, swapTab, navigate]
  );

  /* drop tabs for chats that vanished or became invisible */
  useEffect(() => {
    if (!chats) {
      return;
    }
    const ids = new Set(chats.map((chat) => String(chat._id)));
    setTabs((current) => {
      const next = current.filter((id) => ids.has(String(id)));
      return next.length === current.length ? current : next;
    });
  }, [chats, setTabs]);

  const [dialog, setDialog] = useState<DialogState>(null);

  const value = useMemo<OrgContextValue>(
    () => ({
      chats,
      closeDialog: () => setDialog(null),
      closeOtherTabs,
      closeTab,
      closeTabsToTheRight,
      dialog,
      dmId,
      goChat: (id) => {
        openTab(id);
        navigate(orgChatPath(org.slug, String(id)));
      },
      goHome: () => navigate(orgHomePath(org.slug)),
      goNewChat: (projectId) => {
        navigate(orgNewChatPath(org.slug, projectId));
      },
      goPendingChat,
      goConnectors: () => {
        navigate(orgConnectorsPath(org.slug));
      },
      goSettings: (hash) => {
        navigate(orgSettingsPath(org.slug, hash));
      },
      isAdmin: org.role === "owner" || org.role === "admin",
      isOwner: org.role === "owner",
      me,
      members,
      model,
      now,
      options,
      openDialog: (state) => setDialog(state),
      openTab,
      org,
      orgs,
      projects,
      provider,
      role: org.role,
      runtimeId,
      runtimes,
      setAgent,
      setRuntimeId: (id) => setStoredRuntime(id ? String(id) : null),
      signOut: () => {
        void signOut().then(() => navigate("/login"));
      },
      switchOrg: (id) => {
        const target = orgs.find((item) => item._id === id);
        if (target) {
          navigate(`/o/${target.slug}`);
        }
      },
      tabs,
    }),
    [
      me,
      orgs,
      org,
      projects,
      chats,
      runtimes,
      members,
      dmId,
      now,
      provider,
      model,
      options,
      setAgent,
      runtimeId,
      tabs,
      openTab,
      closeTab,
      closeOtherTabs,
      closeTabsToTheRight,
      goPendingChat,
      dialog,
      navigate,
      signOut,
      setStoredRuntime,
    ]
  );

  return <OrgContext.Provider value={value}>{children}</OrgContext.Provider>;
}
