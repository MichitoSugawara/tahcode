import { useAuthActions } from "@convex-dev/auth/react";
import { useMutation, useQuery } from "convex/react";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { useStoredState } from "@/lib/storage";
import type { ProviderDriverKind } from "@/lib/providers";
import { isProviderKind } from "@/lib/providers";

export type OrgRole = "owner" | "admin" | "member";

export type Me = { _id: Id<"users">; name?: string; email?: string; handle?: string; image?: string };
export type OrgSummary = { _id: Id<"orgs">; name: string; slug: string; role: OrgRole };
export type Project = {
  _id: Id<"projects">;
  orgId: Id<"orgs">;
  name: string;
  slug: string;
  visibility: "org" | "private";
  cwd?: string;
  repoUrl?: string;
};
export type Chat = {
  _id: Id<"chats">;
  orgId: Id<"orgs">;
  projectId?: Id<"projects">;
  kind: "dm" | "project";
  title: string;
  visibility: "inherit" | "private";
  ownerId?: Id<"users">;
  /** default agent bound to the chat (provider + optional model slug) */
  driverKind?: ProviderDriverKind;
  model?: string;
};
export type Runtime = {
  _id: Id<"runtimes">;
  name: string;
  slug: string;
  hostname?: string;
  cwd?: string;
  status: "online" | "offline";
  lastSeenAt?: number;
  ownerUserId: Id<"users">;
  canUse: boolean;
  providers: { driverKind: ProviderDriverKind; available: boolean; version?: string; binaryPath?: string }[];
  grants: {
    _id: Id<"runtimeGrants">;
    targetType: "user" | "role";
    targetUserId?: Id<"users">;
    targetRole?: OrgRole;
  }[];
};
export type Member = { user: Me; role: OrgRole };

export type DialogState =
  | { kind: "createOrg" }
  | { kind: "createProject" }
  | { kind: "newChat"; projectId?: Id<"projects"> }
  | { kind: "registerRuntime" }
  | { kind: "grant"; runtimeId: Id<"runtimes"> }
  | { kind: "invite" }
  | null;

/** A runtime is "live" when its heartbeat is fresh (server treats >90s as dead). */
export const STALE_AFTER_MS = 90_000;
export function isLive(runtime: Pick<Runtime, "status" | "lastSeenAt">, now = Date.now()): boolean {
  return runtime.status === "online" && runtime.lastSeenAt !== undefined && now - runtime.lastSeenAt < STALE_AFTER_MS;
}

type OrgContextValue = {
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
  setAgent: (kind: ProviderDriverKind, model?: string | null) => void;
  runtimeId: Id<"runtimes"> | null;
  setRuntimeId: (id: Id<"runtimes"> | null) => void;
  tabs: Id<"chats">[];
  openTab: (id: Id<"chats">) => void;
  closeTab: (id: Id<"chats">) => void;
  dialog: DialogState;
  openDialog: (state: NonNullable<DialogState>) => void;
  closeDialog: () => void;
  goHome: () => void;
  goChat: (id: Id<"chats">) => void;
  goSettings: () => void;
  switchOrg: (id: Id<"orgs">) => void;
  signOut: () => void;
};

const OrgContext = createContext<OrgContextValue | null>(null);

export function useOrg(): OrgContextValue {
  const value = useContext(OrgContext);
  if (!value) throw new Error("useOrg must be used inside <OrgProvider>");
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

  const projects = useQuery(api.projects.list, { orgId }) as Project[] | undefined;
  const chats = useQuery(api.chats.list, { orgId }) as Chat[] | undefined;
  const runtimes = useQuery(api.runtimes.list, { orgId }) as Runtime[] | undefined;
  const members = useQuery(api.orgs.members, { orgId }) as Member[] | undefined;

  const ensureDm = useMutation(api.chats.ensureDm);
  const [dmId, setDmId] = useState<Id<"chats"> | null>(null);
  useEffect(() => {
    let cancelled = false;
    setDmId(null);
    ensureDm({ orgId })
      .then((id) => {
        if (!cancelled) setDmId(id);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [orgId, ensureDm]);

  /* one shared clock so "online" badges age out together */
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(t);
  }, []);

  const [storedProvider, setStoredProvider] = useStoredState<string>(`th:${orgId}:provider`, "codex");
  const provider: ProviderDriverKind = isProviderKind(storedProvider) ? storedProvider : "codex";
  const [storedModel, setStoredModel] = useStoredState<string | null>(`th:${orgId}:model`, null);
  const model = typeof storedModel === "string" && storedModel.length > 0 ? storedModel : null;
  const setAgent = useCallback(
    (kind: ProviderDriverKind, nextModel?: string | null) => {
      setStoredProvider(kind);
      setStoredModel(nextModel ?? null);
    },
    [setStoredProvider, setStoredModel],
  );
  const [storedRuntime, setStoredRuntime] = useStoredState<string | null>(`th:${orgId}:runtime`, null);
  const runtimeId = (storedRuntime as Id<"runtimes"> | null) ?? null;

  const [tabs, setTabs] = useStoredState<Id<"chats">[]>(`th:${orgId}:tabs`, []);
  const openTab = useCallback(
    (id: Id<"chats">) => setTabs((current) => (current.includes(id) ? current : [...current, id])),
    [setTabs],
  );
  const closeTab = useCallback((id: Id<"chats">) => setTabs((current) => current.filter((item) => item !== id)), [setTabs]);

  /* drop tabs for chats that vanished or became invisible */
  useEffect(() => {
    if (!chats) return;
    const ids = new Set(chats.map((chat) => String(chat._id)));
    setTabs((current) => {
      const next = current.filter((id) => ids.has(String(id)));
      return next.length === current.length ? current : next;
    });
  }, [chats, setTabs]);

  const [dialog, setDialog] = useState<DialogState>(null);

  const value = useMemo<OrgContextValue>(
    () => ({
      me,
      orgs,
      org,
      role: org.role,
      isAdmin: org.role === "owner" || org.role === "admin",
      isOwner: org.role === "owner",
      projects,
      chats,
      runtimes,
      members,
      dmId,
      now,
      provider,
      model,
      setAgent,
      runtimeId,
      setRuntimeId: (id) => setStoredRuntime(id ? String(id) : null),
      tabs,
      openTab,
      closeTab,
      dialog,
      openDialog: (state) => setDialog(state),
      closeDialog: () => setDialog(null),
      goHome: () => navigate(`/o/${org.slug}`),
      goChat: (id) => {
        openTab(id);
        navigate(`/o/${org.slug}/c/${String(id)}`);
      },
      goSettings: () => navigate(`/o/${org.slug}/settings`),
      switchOrg: (id) => {
        const target = orgs.find((item) => item._id === id);
        if (target) navigate(`/o/${target.slug}`);
      },
      signOut: () => {
        void signOut().then(() => navigate("/login"));
      },
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
      setAgent,
      runtimeId,
      tabs,
      openTab,
      closeTab,
      dialog,
      navigate,
      signOut,
      setStoredRuntime,
    ],
  );

  return <OrgContext.Provider value={value}>{children}</OrgContext.Provider>;
}
