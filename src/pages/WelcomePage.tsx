import { useAuthActions } from "@convex-dev/auth/react";
import { useMutation, useQuery } from "convex/react";
import { ArrowRight, LogOut } from "lucide-react";
import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { useNavigate } from "react-router-dom";

import { Button } from "@/components/atoms/Button";
import { CreateOrgForm } from "@/harness/dialogs/CreateOrgDialog";
import { Brand } from "@/harness/ui/Brand";
import { InlineError, Input, Label } from "@/harness/ui/Field";
import { displayName } from "@/lib/format";
import { useDocumentTitle } from "@/lib/title";

import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

/* ─────────────────────────────────────────────────────────
 * FIRST RUN — no org yet. Create one (you become owner) or
 * paste an invite token. Uses the home entrance storyboard so
 * the very first screen already moves like the harness.
 * ───────────────────────────────────────────────────────── */

const REVEAL = {
  blur: 17,
  duration: 800,
  easing: "cubic-bezier(0.16, 1, 0.3, 1)",
  offsetY: 23,
};
function reveal(visible: boolean): CSSProperties {
  return {
    filter: visible ? "blur(0px)" : `blur(${REVEAL.blur}px)`,
    opacity: visible ? 1 : 0,
    transform: visible
      ? "translate3d(0,0,0)"
      : `translate3d(0, ${REVEAL.offsetY}px, 0)`,
    transition: ["opacity", "transform", "filter"]
      .map((p) => `${p} ${REVEAL.duration}ms ${REVEAL.easing}`)
      .join(", "),
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
  useDocumentTitle("はじめる");

  useEffect(() => {
    const timers = [170, 330, 400, 550].map((ms, i) =>
      setTimeout(() => setStage(i + 1), ms)
    );
    return () => timers.forEach(clearTimeout);
  }, []);

  /* once the new org shows up in the membership list, land in it */
  useEffect(() => {
    if (!pendingOrg || !orgs) {
      return;
    }
    const target = orgs.find((org) => org._id === pendingOrg);
    if (target) {
      navigate(`/o/${target.slug}`, { replace: true });
    }
  }, [pendingOrg, orgs, navigate]);

  /* someone with orgs should never sit on this page */
  useEffect(() => {
    if (orgs && orgs.length > 0 && !pendingOrg && orgs[0]) {
      navigate(`/o/${orgs[0].slug}`, { replace: true });
    }
  }, [orgs, pendingOrg, navigate]);

  return (
    <main className="bg-canvas text-ink flex min-h-[100dvh] flex-col p-4 sm:p-6">
      <header className="flex items-center justify-between">
        <Brand />
        <Button
          type="button"
          variant="quiet"
          size="xs"
          onClick={() => void signOut().then(() => navigate("/login"))}
        >
          <LogOut size={12} /> サインアウト
        </Button>
      </header>
      <div className="mx-auto flex w-full max-w-[720px] flex-1 flex-col justify-center py-10">
        <h1 className="text-ink text-[26px] font-normal tracking-[-0.02em]">
          <span
            className="home-reveal text-ink-3 block"
            style={reveal(stage >= 1)}
          >
            ようこそ、{displayName(me ?? undefined)}
          </span>
          <span className="home-reveal block" style={reveal(stage >= 2)}>
            最初の Org を作りましょう
          </span>
        </h1>
        <p
          className="home-reveal text-ink-2 mt-3 max-w-[560px] text-[13.5px] leading-relaxed"
          style={reveal(stage >= 2)}
        >
          Org はチームの境界です。作ったあとは Personal DM
          がすぐ使えて、プロジェクト・メンバー招待・ランタイム登録へ進めます。
        </p>

        <div
          className="home-reveal mt-7 grid gap-4 md:grid-cols-[1.2fr_1fr]"
          style={reveal(stage >= 3)}
        >
          <section className="rounded-window bg-surface shadow-card p-5">
            <h2 className="text-ink text-[14px] font-semibold">
              新しい Org を作る
            </h2>
            <p className="text-ink-3 mt-1 mb-4 text-[12.5px]">
              あなたが Owner になります。
            </p>
            <CreateOrgForm
              onCreated={(id) => setPendingOrg(id)}
              submitLabel="Org を作成して始める"
            />
          </section>

          <section className="rounded-window bg-surface shadow-card p-5">
            <h2 className="text-ink text-[14px] font-semibold">
              招待で参加する
            </h2>
            <p className="text-ink-3 mt-1 mb-4 text-[12.5px]">
              Owner / Admin
              から受け取ったリンクを開くか、トークンを貼り付けます。
            </p>
            <form
              className="flex flex-col gap-3"
              onSubmit={async (event) => {
                event.preventDefault();
                if (!token.trim() || busy) {
                  return;
                }
                setBusy(true);
                setError(null);
                try {
                  const raw = token.trim();
                  const extracted = raw.includes("/invite/")
                    ? (raw.split("/invite/")[1] ?? raw).split(/[?#]/)[0]
                    : raw;
                  const id = await acceptInvite({ token: extracted ?? raw });
                  setPendingOrg(id);
                } catch (error) {
                  const message = error instanceof Error ? error.message : "";
                  setError(
                    /expired/i.test(message)
                      ? "この招待は期限切れです"
                      : /already used/i.test(message)
                        ? "この招待はすでに使われています"
                        : /different email/i.test(message)
                          ? "この招待は別のメールアドレス宛です"
                          : "招待が見つかりません"
                  );
                } finally {
                  setBusy(false);
                }
              }}
            >
              <div>
                <Label>招待リンクまたはトークン</Label>
                <Input
                  value={token}
                  onChange={(event) => setToken(event.target.value)}
                  placeholder="https://…/invite/xxxx または xxxx"
                  className="font-mono"
                />
              </div>
              {error && <InlineError>{error}</InlineError>}
              <div className="flex justify-end">
                <Button
                  type="submit"
                  variant="secondary"
                  size="md"
                  disabled={!token.trim() || busy}
                >
                  {busy ? "確認中…" : "参加する"} <ArrowRight size={14} />
                </Button>
              </div>
            </form>
          </section>
        </div>

        <p
          className="home-reveal text-ink-3 mt-6 text-[12px]"
          style={reveal(stage >= 4)}
        >
          次のステップ: プロジェクト作成 → マシンランタイム登録 →
          メンバー招待とランタイム許可。すべてこの順に画面が案内します。
        </p>
      </div>
    </main>
  );
}
