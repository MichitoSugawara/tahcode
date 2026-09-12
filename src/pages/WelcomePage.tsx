import { useAuthActions } from "@convex-dev/auth/react";
import { useMutation, useQuery } from "convex/react";
import { ArrowRight, LogOut } from "lucide-react";
import { useEffect, useState, type CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { Button } from "@/components/atoms/Button";
import { CreateOrgForm } from "@/harness/dialogs/CreateOrgDialog";
import { Brand } from "@/harness/ui/Brand";
import { InlineError, Input, Label } from "@/harness/ui/Field";
import { displayName } from "@/lib/format";

/* ─────────────────────────────────────────────────────────
 * FIRST RUN — no org yet. Create one (you become owner) or
 * paste an invite token. Uses the home entrance storyboard so
 * the very first screen already moves like the harness.
 * ───────────────────────────────────────────────────────── */

const REVEAL = { offsetY: 23, blur: 17, duration: 800, easing: "cubic-bezier(0.16, 1, 0.3, 1)" };
function reveal(visible: boolean): CSSProperties {
  return {
    opacity: visible ? 1 : 0,
    transform: visible ? "translate3d(0,0,0)" : `translate3d(0, ${REVEAL.offsetY}px, 0)`,
    filter: visible ? "blur(0px)" : `blur(${REVEAL.blur}px)`,
    transition: ["opacity", "transform", "filter"].map((p) => `${p} ${REVEAL.duration}ms ${REVEAL.easing}`).join(", "),
  };
}

export default function WelcomePage() {
  const navigate = useNavigate();
  const { signOut } = useAuthActions();
  const me = useQuery(api.users.me);
  const orgs = useQuery(api.orgs.listMine);
  const acceptInvite = useMutation(api.orgs.acceptInvite);
  const [pendingOrg, setPendingOrg] = useState<Id<"orgs"> | null>(null);
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stage, setStage] = useState(0);

  useEffect(() => {
    const timers = [170, 330, 400, 550].map((ms, i) => setTimeout(() => setStage(i + 1), ms));
    return () => timers.forEach(clearTimeout);
  }, []);

  /* once the new org shows up in the membership list, land in it */
  useEffect(() => {
    if (!pendingOrg || !orgs) return;
    const target = orgs.find((org) => org._id === pendingOrg);
    if (target) navigate(`/o/${target.slug}`, { replace: true });
  }, [pendingOrg, orgs, navigate]);

  /* someone with orgs should never sit on this page */
  useEffect(() => {
    if (orgs && orgs.length > 0 && !pendingOrg && orgs[0]) navigate(`/o/${orgs[0].slug}`, { replace: true });
  }, [orgs, pendingOrg, navigate]);

  return (
    <main className="flex min-h-[100dvh] flex-col bg-canvas p-4 text-ink sm:p-6">
      <header className="flex items-center justify-between">
        <Brand />
        <Button type="button" variant="quiet" size="xs" onClick={() => void signOut().then(() => navigate("/login"))}>
          <LogOut size={12} /> サインアウト
        </Button>
      </header>
      <div className="mx-auto flex w-full max-w-[720px] flex-1 flex-col justify-center py-10">
        <h1 className="text-[26px] font-normal tracking-[-0.02em] text-ink">
          <span className="home-reveal block text-ink-3" style={reveal(stage >= 1)}>
            ようこそ、{displayName(me ?? undefined)}
          </span>
          <span className="home-reveal block" style={reveal(stage >= 2)}>
            最初の Org を作りましょう
          </span>
        </h1>
        <p className="home-reveal mt-3 max-w-[560px] text-[13.5px] leading-relaxed text-ink-2" style={reveal(stage >= 2)}>
          Org はチームの境界です。作ったあとは Personal DM がすぐ使えて、プロジェクト・メンバー招待・ランタイム登録へ進めます。
        </p>

        <div className="home-reveal mt-7 grid gap-4 md:grid-cols-[1.2fr_1fr]" style={reveal(stage >= 3)}>
          <section className="rounded-window bg-surface p-5 shadow-card">
            <h2 className="text-[14px] font-semibold text-ink">新しい Org を作る</h2>
            <p className="mt-1 mb-4 text-[12.5px] text-ink-3">あなたが Owner になります。</p>
            <CreateOrgForm onCreated={(id) => setPendingOrg(id)} submitLabel="Org を作成して始める" />
          </section>

          <section className="rounded-window bg-surface p-5 shadow-card">
            <h2 className="text-[14px] font-semibold text-ink">招待で参加する</h2>
            <p className="mt-1 mb-4 text-[12.5px] text-ink-3">Owner / Admin から受け取ったリンクを開くか、トークンを貼り付けます。</p>
            <form
              className="flex flex-col gap-3"
              onSubmit={async (event) => {
                event.preventDefault();
                if (!token.trim() || busy) return;
                setBusy(true);
                setError(null);
                try {
                  const raw = token.trim();
                  const extracted = raw.includes("/invite/") ? (raw.split("/invite/")[1] ?? raw).split(/[?#]/)[0] : raw;
                  const id = await acceptInvite({ token: extracted ?? raw });
                  setPendingOrg(id);
                } catch (e) {
                  const message = e instanceof Error ? e.message : "";
                  setError(/expired/i.test(message) ? "この招待は期限切れです" : /already used/i.test(message) ? "この招待はすでに使われています" : /different email/i.test(message) ? "この招待は別のメールアドレス宛です" : "招待が見つかりません");
                } finally {
                  setBusy(false);
                }
              }}
            >
              <div>
                <Label>招待リンクまたはトークン</Label>
                <Input value={token} onChange={(event) => setToken(event.target.value)} placeholder="https://…/invite/xxxx または xxxx" className="font-mono" />
              </div>
              {error && <InlineError>{error}</InlineError>}
              <div className="flex justify-end">
                <Button type="submit" variant="secondary" size="md" disabled={!token.trim() || busy}>
                  {busy ? "確認中…" : "参加する"} <ArrowRight size={14} />
                </Button>
              </div>
            </form>
          </section>
        </div>

        <p className="home-reveal mt-6 text-[12px] text-ink-3" style={reveal(stage >= 4)}>
          次のステップ: プロジェクト作成 → マシンランタイム登録 → メンバー招待とランタイム許可。すべてこの順に画面が案内します。
        </p>
      </div>
    </main>
  );
}
