import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { ArrowRight, Check } from "lucide-react";
import { useEffect, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { Button } from "@/components/atoms/Button";
import LoadingState from "@/components/primitives/LoadingState";
import { Brand } from "@/harness/ui/Brand";
import { Notice } from "@/harness/ui/Notice";

/* /invite/:token — the landing for an invite link. Unauthenticated
 * visitors bounce through login and come straight back here. */
export default function InvitePage() {
  const { token = "" } = useParams();
  const { isAuthenticated, isLoading } = useConvexAuth();
  const navigate = useNavigate();
  const orgs = useQuery(api.orgs.listMine, isAuthenticated ? {} : "skip");
  const acceptInvite = useMutation(api.orgs.acceptInvite);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [joined, setJoined] = useState<Id<"orgs"> | null>(null);

  useEffect(() => {
    if (!joined || !orgs) return;
    const target = orgs.find((org) => org._id === joined);
    if (target) navigate(`/o/${target.slug}`, { replace: true });
  }, [joined, orgs, navigate]);

  if (isLoading) {
    return (
      <div className="flex h-[100dvh] items-center justify-center bg-canvas">
        <LoadingState label="確認しています" variant="Dots" />
      </div>
    );
  }
  if (!isAuthenticated) return <Navigate to={`/login?flow=signUp&next=${encodeURIComponent(`/invite/${token}`)}`} replace />;

  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-canvas p-4 text-ink">
      <section className="w-full max-w-[440px] overflow-hidden rounded-window bg-surface shadow-overlay" style={{ animation: "pop-in 300ms cubic-bezier(0.23,1,0.32,1) both" }}>
        <div className="px-5 pt-5">
          <Brand />
        </div>
        <div className="px-5 pt-4 pb-5">
          <h1 className="text-[16px] font-semibold tracking-[-0.01em] text-ink">Org への招待</h1>
          <p className="mt-1 text-[12.5px] leading-relaxed text-ink-3">このリンクは 1 回だけ使えます。参加すると招待時に選ばれたロール（Member または Admin）になります。</p>
          <div className="mt-4 rounded-card bg-inset px-3 py-2 font-mono text-[12px] text-ink-2 shadow-hairline">{token}</div>
          {error && (
            <Notice tone="warn" title="参加できませんでした" className="mt-3">
              {error}
            </Notice>
          )}
          <div className="mt-4 flex items-center justify-between gap-3">
            <Button type="button" variant="ghost" size="sm" onClick={() => navigate("/")}>
              あとで
            </Button>
            <Button
              type="button"
              variant="accent"
              size="md"
              disabled={busy || !!joined}
              onClick={async () => {
                setBusy(true);
                setError(null);
                try {
                  const id = await acceptInvite({ token });
                  setJoined(id);
                } catch (e) {
                  const message = e instanceof Error ? e.message : "";
                  setError(/expired/i.test(message) ? "この招待は期限切れです。発行者に再発行を依頼してください。" : /already used/i.test(message) ? "この招待はすでに使われています。" : /different email/i.test(message) ? "この招待は別のメールアドレス宛です。" : "招待が見つかりません。");
                } finally {
                  setBusy(false);
                }
              }}
            >
              {joined ? (
                <>
                  <Check size={14} /> 参加しました
                </>
              ) : busy ? (
                "参加中…"
              ) : (
                <>
                  参加する <ArrowRight size={14} />
                </>
              )}
            </Button>
          </div>
        </div>
      </section>
    </main>
  );
}
