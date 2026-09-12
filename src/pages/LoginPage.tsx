import { useAuthActions } from "@convex-dev/auth/react";
import { useConvexAuth } from "convex/react";
import { ArrowRight, Cpu, MessageSquare, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/atoms/Button";
import { SegmentedControl } from "@/components/atoms/SegmentedControl";
import { InlineError, Input, Label } from "@/harness/ui/Field";
import { Brand } from "@/harness/ui/Brand";
import { useDocumentTitle } from "@/lib/title";

/* ─────────────────────────────────────────────────────────
 * AUTH — one card on the canvas. Sign in / sign up share the
 * form; sign up adds a display name. `?next=` carries invite
 * links through the redirect.
 * ───────────────────────────────────────────────────────── */

const FLOWS = ["ログイン", "新規登録"] as const;

export default function LoginPage() {
  const { signIn } = useAuthActions();
  const { isAuthenticated } = useConvexAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const [flow, setFlow] = useState<(typeof FLOWS)[number]>(params.get("flow") === "signUp" ? "新規登録" : "ログイン");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const next = params.get("next") ?? (location.state as { next?: string } | null)?.next ?? "/";
  const signUp = flow === "新規登録";
  useDocumentTitle(signUp ? "新規登録" : "ログイン");

  /* navigate only once the auth state has actually flipped, so a `next`
   * target (invite link) never bounces back here mid-transition */
  useEffect(() => {
    if (isAuthenticated) navigate(next.startsWith("/") ? next : "/", { replace: true });
  }, [isAuthenticated, next, navigate]);

  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-canvas p-4 text-ink">
      <div className="grid w-full max-w-[880px] gap-6 lg:grid-cols-[1fr_400px] lg:items-center">
        <section className="hidden flex-col gap-6 px-2 lg:flex" style={{ animation: "fade-up 500ms cubic-bezier(0.23,1,0.32,1) both" }}>
          <Brand size="lg" />
          <h1 className="text-[28px] leading-[1.25] font-normal tracking-[-0.02em] text-ink">
            チームの会話と、
            <br />
            手元のマシンで動くコーディングエージェント。
          </h1>
          <ul className="flex flex-col gap-3 text-[13.5px] text-ink-2">
            <li className="flex items-start gap-3">
              <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-[7px] bg-accent-tint text-accent-ink">
                <MessageSquare size={13} />
              </span>
              Org → プロジェクト → チャット。Personal DM では常時応答、プロジェクトチャットでは @mention で応答。
            </li>
            <li className="flex items-start gap-3">
              <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-[7px] bg-accent-tint text-accent-ink">
                <Cpu size={13} />
              </span>
              Codex / Claude / Cursor などの CLI をあなたのマシンで実行（t3code 由来のプロバイダ配線）。
            </li>
            <li className="flex items-start gap-3">
              <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-[7px] bg-accent-tint text-accent-ink">
                <ShieldCheck size={13} />
              </span>
              Owner / Admin / Member と、default deny のランタイム利用許可。
            </li>
          </ul>
        </section>

        <section className="w-full overflow-hidden rounded-window bg-surface shadow-overlay" style={{ animation: "pop-in 300ms cubic-bezier(0.23,1,0.32,1) both" }}>
          <div className="flex items-center justify-between gap-3 px-5 pt-5">
            <div className="lg:hidden">
              <Brand />
            </div>
            <SegmentedControl options={FLOWS} value={flow} onChange={setFlow} className="ml-auto" />
          </div>
          <form
            className="flex flex-col gap-3.5 px-5 pt-4 pb-5"
            onSubmit={async (event) => {
              event.preventDefault();
              if (pending) return;
              setPending(true);
              setError(null);
              try {
                const data = new FormData();
                data.set("email", email.trim());
                data.set("password", password);
                data.set("flow", signUp ? "signUp" : "signIn");
                if (signUp && name.trim()) data.set("name", name.trim());
                await signIn("password", data);
              } catch (e) {
                const message = e instanceof Error ? e.message : "";
                setError(
                  /InvalidSecret|Invalid password|InvalidAccountId/i.test(message)
                    ? "メールアドレスまたはパスワードが違います"
                    : /already exists|AccountAlreadyExists/i.test(message)
                      ? "このメールアドレスは登録済みです。ログインしてください"
                      : signUp
                        ? "登録に失敗しました。8 文字以上のパスワードを試してください"
                        : "ログインに失敗しました",
                );
              } finally {
                setPending(false);
              }
            }}
          >
            <div>
              <h2 className="text-[16px] font-semibold tracking-[-0.01em] text-ink">{signUp ? "アカウントを作成" : "おかえりなさい"}</h2>
              <p className="mt-1 text-[12.5px] leading-relaxed text-ink-3">
                {signUp ? "作成後、最初の Org を作るか招待リンクで参加します。" : "Org を選んで Personal DM に戻ります。"}
              </p>
            </div>
            {signUp && (
              <div>
                <Label>表示名</Label>
                <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="例: 山田 太郎" autoComplete="name" />
              </div>
            )}
            <div>
              <Label>メールアドレス</Label>
              <Input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" autoComplete="email" autoFocus />
            </div>
            <div>
              <Label hint={signUp ? "8 文字以上" : undefined}>パスワード</Label>
              <Input
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="••••••••"
                autoComplete={signUp ? "new-password" : "current-password"}
              />
            </div>
            {error && <InlineError>{error}</InlineError>}
            <Button type="submit" variant="accent" size="md" disabled={pending} className="mt-1 w-full">
              {pending ? "処理中…" : signUp ? "登録して始める" : "ログイン"}
              {!pending && <ArrowRight size={14} />}
            </Button>
            <p className="text-center text-[12px] text-ink-3">
              {signUp ? "すでにアカウントがありますか？" : "はじめてですか？"}{" "}
              <button type="button" className="font-medium text-accent-ink hover:underline" onClick={() => setFlow(signUp ? "ログイン" : "新規登録")}>
                {signUp ? "ログイン" : "新規登録"}
              </button>
            </p>
          </form>
        </section>
      </div>
    </main>
  );
}
