import { useMutation, useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { Navigate, Outlet, useLocation, useNavigate, useParams } from "react-router-dom";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import LoadingState from "@/components/primitives/LoadingState";
import { OrgProvider, type Me, type OrgSummary } from "@/harness/OrgContext";
import { Shell } from "@/harness/Shell";
import { DialogHost } from "@/harness/dialogs/DialogHost";
import type { Theme } from "@/lib/theme";

/* Resolves the org from the URL slug, mounts the shared context, and
 * decides which frame the child route gets (rail or full width). */
export default function OrgLayout({ theme, onToggleTheme }: { theme: Theme; onToggleTheme: () => void }) {
  const { orgSlug, chatId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const me = useQuery(api.users.me) as Me | null | undefined;
  const orgs = useQuery(api.orgs.listMine) as OrgSummary[] | undefined;
  const ensureHandle = useMutation(api.users.ensureHandle);
  const [pendingOrg, setPendingOrg] = useState<Id<"orgs"> | null>(null);

  useEffect(() => {
    ensureHandle().catch(() => undefined);
  }, [ensureHandle]);

  useEffect(() => {
    if (!pendingOrg || !orgs) return;
    const target = orgs.find((org) => org._id === pendingOrg);
    if (target) {
      setPendingOrg(null);
      navigate(`/o/${target.slug}`);
    }
  }, [pendingOrg, orgs, navigate]);

  if (me === undefined || orgs === undefined) {
    return (
      <div className="flex h-[100dvh] items-center justify-center bg-canvas">
        <LoadingState label="接続しています" variant="Dots" />
      </div>
    );
  }
  if (!me) return <Navigate to="/login" replace />;
  if (orgs.length === 0) return <Navigate to="/welcome" replace />;

  const org = orgs.find((item) => item.slug === orgSlug);
  if (!org) return <Navigate to={`/o/${orgs[0]!.slug}`} replace />;

  const settings = location.pathname.startsWith(`/o/${org.slug}/settings`);

  return (
    <OrgProvider key={String(org._id)} me={me} orgs={orgs} org={org}>
      <Shell theme={theme} onToggleTheme={onToggleTheme} rail={!settings} railDefaultTab={chatId ? "Context" : "Runtime"}>
        <Outlet />
      </Shell>
      <DialogHost onOrgCreated={(id) => setPendingOrg(id)} />
    </OrgProvider>
  );
}
