import { useAuthActions } from "@convex-dev/auth/react";
import {
  authFailureMessage,
  classifyAuthFailure,
  OAUTH_INCOMPLETE_MESSAGE,
  PASSWORD_MIN_LENGTH,
  SESSION_NOT_ESTABLISHED_MESSAGE,
  validateAuthForm,
} from "@shared/auth.ts";
import type { AuthFieldErrors, AuthFlow } from "@shared/auth.ts";
import { useConvexAuth, useQuery } from "convex/react";
import { ArrowRight, Cpu, MessageSquare, ShieldCheck } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";

import { Button } from "@/components/atoms/Button";
import { SegmentedControl } from "@/components/atoms/SegmentedControl";
import { Brand } from "@/harness/ui/Brand";
import { FieldError, InlineError, Input, Label } from "@/harness/ui/Field";
import { useDocumentTitle } from "@/lib/title";

import { api } from "../../convex/_generated/api";

/* ─────────────────────────────────────────────────────────
 * AUTH — one card on the canvas. Sign in / sign up share the
 * form; sign up adds a display name and a confirmation field.
 * `?next=` carries invite links through the redirect, including
 * the round trip through Google.
 * ───────────────────────────────────────────────────────── */

const FLOWS = ["ログイン", "新規登録"] as const;
type FlowLabel = (typeof FLOWS)[number];

/* set right before leaving for Google; if we come back without a session
 * the callback failed (denied consent, misconfigured client, expired code) */
const OAUTH_PENDING_KEY = "tahcode:oauth-pending";
const OAUTH_PENDING_TTL_MS = 15 * 60 * 1000;
/* a WebSocket action never rejects while the client is offline — it waits
 * for a reconnect — so bound the wait ourselves */
const SIGN_IN_TIMEOUT_MS = 20_000;
/* the backend has to accept the freshly issued JWT before we are signed in;
 * if it never does (bad JWKS / SITE_URL) say so instead of looping silently */
const SESSION_TIMEOUT_MS = 10_000;

class TimeoutError extends Error {}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new TimeoutError("timeout")), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

function takeOAuthPending(): boolean {
  try {
    const raw = sessionStorage.getItem(OAUTH_PENDING_KEY);
    if (!raw) {
      return false;
    }
    sessionStorage.removeItem(OAUTH_PENDING_KEY);
    return Date.now() - Number(raw) < OAUTH_PENDING_TTL_MS;
  } catch {
    return false;
  }
}

function GoogleMark() {
  return (
    <svg aria-hidden viewBox="0 0 18 18" className="size-4 shrink-0">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.83.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z"
      />
      <path
        fill="#FBBC05"
        d="M3.97 10.72A5.4 5.4 0 0 1 3.68 9c0-.6.1-1.18.29-1.72V4.95H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.05l3.01-2.33Z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.9 11.42 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z"
      />
    </svg>
  );
}

export default function LoginPage() {
  const { signIn } = useAuthActions();
  const { isAuthenticated } = useConvexAuth();
  const providers = useQuery(api.auth.providers);
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const [flowLabel, setFlowLabel] = useState<FlowLabel>(
    params.get("flow") === "signUp" ? "新規登録" : "ログイン"
  );
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [fieldErrors, setFieldErrors] = useState<AuthFieldErrors>({});
  const [formError, setFormError] = useState<{
    message: string;
    offerSignIn?: boolean;
  } | null>(null);
  const [pending, setPending] = useState<"password" | "google" | null>(null);
  const [awaitingSession, setAwaitingSession] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLInputElement>(null);
  const ids = useId();

  /* Captured during the first render, before ConvexAuthProvider's effect strips
   * `?code=` from the URL. A successful Google return always carries a code; its
   * absence means the callback failed (denied consent, misconfigured client). */
  const hadOAuthCode = useRef<boolean | null>(null);
  if (hadOAuthCode.current === null) {
    hadOAuthCode.current =
      typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).has("code");
  }

  const next =
    params.get("next") ??
    (location.state as { next?: string } | null)?.next ??
    "/";
  const safeNext = next.startsWith("/") ? next : "/";
  const signUp = flowLabel === "新規登録";
  const flow: AuthFlow = signUp ? "signUp" : "signIn";
  const googleEnabled = providers === undefined ? true : providers.google;
  const busy = pending !== null;
  useDocumentTitle(signUp ? "新規登録" : "ログイン");

  /* navigate only once the auth state has actually flipped, so a `next`
   * target (invite link) never bounces back here mid-transition */
  useEffect(() => {
    if (isAuthenticated) {
      navigate(safeNext, { replace: true });
    }
  }, [isAuthenticated, safeNext, navigate]);

  useEffect(() => {
    /* consume the marker on the first mount after returning from Google */
    if (!takeOAuthPending()) {
      return;
    }
    /* code present or already signed in → success/in-progress, let it proceed */
    if (hadOAuthCode.current || isAuthenticated) {
      return;
    }
    setFormError({ message: OAUTH_INCOMPLETE_MESSAGE });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!awaitingSession || isAuthenticated) {
      return;
    }
    const timer = setTimeout(() => {
      setAwaitingSession(false);
      setPending(null);
      setFormError({ message: SESSION_NOT_ESTABLISHED_MESSAGE });
    }, SESSION_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [awaitingSession, isAuthenticated]);

  const switchFlow = (label: FlowLabel) => {
    setFlowLabel(label);
    setFieldErrors({});
    setFormError(null);
    setConfirm("");
  };

  const clearFieldError = (field: keyof AuthFieldErrors) => {
    if (fieldErrors[field]) {
      setFieldErrors((current) => ({ ...current, [field]: undefined }));
    }
  };

  const submitPassword = async () => {
    if (busy) {
      return;
    }
    const errors = validateAuthForm(flow, { confirm, email, password });
    setFieldErrors(errors);
    setFormError(null);
    if (errors.email) {
      emailRef.current?.focus();
    } else if (errors.password) {
      passwordRef.current?.focus();
    } else if (errors.confirm) {
      confirmRef.current?.focus();
    }
    if (Object.values(errors).some(Boolean)) {
      return;
    }

    setPending("password");
    try {
      const data = new FormData();
      data.set("email", email.trim().toLowerCase());
      data.set("password", password);
      data.set("flow", flow);
      if (signUp && name.trim()) {
        data.set("name", name.trim());
      }
      const result = await withTimeout(
        signIn("password", data),
        SIGN_IN_TIMEOUT_MS
      );
      if (result.signingIn) {
        /* keep the button busy until the backend confirms the session */
        setAwaitingSession(true);
      } else {
        setPending(null);
        setFormError({
          message: authFailureMessage({ kind: "unknown" }, flow),
        });
      }
    } catch (error) {
      setPending(null);
      if (error instanceof TimeoutError) {
        setFormError({
          message: authFailureMessage({ kind: "timeout" }, flow),
        });
        return;
      }
      const failure = classifyAuthFailure(error);
      setFormError({
        message: authFailureMessage(failure, flow),
        offerSignIn:
          signUp &&
          failure.kind === "code" &&
          failure.code === "ACCOUNT_EXISTS",
      });
    }
  };

  const continueWithGoogle = async () => {
    if (busy || !googleEnabled) {
      return;
    }
    setPending("google");
    setFormError(null);
    setFieldErrors({});
    try {
      sessionStorage.setItem(OAUTH_PENDING_KEY, String(Date.now()));
    } catch {
      /* private mode without sessionStorage: we just lose the return hint */
    }
    try {
      /* land back here so `next` survives the round trip; the provider
       * exchanges the `code` on load and the effect above moves on */
      const redirectTo =
        safeNext === "/"
          ? "/login"
          : `/login?next=${encodeURIComponent(safeNext)}`;
      await withTimeout(signIn("google", { redirectTo }), SIGN_IN_TIMEOUT_MS);
      /* the browser is navigating away now; stay busy */
    } catch (error) {
      try {
        sessionStorage.removeItem(OAUTH_PENDING_KEY);
      } catch {
        /* ignore */
      }
      setPending(null);
      const failure =
        error instanceof TimeoutError
          ? ({ kind: "timeout" } as const)
          : classifyAuthFailure(error);
      setFormError({
        message:
          failure.kind === "network" || failure.kind === "timeout"
            ? authFailureMessage(failure, flow)
            : "Google でのログインを開始できませんでした。時間をおいてもう一度お試しください",
      });
    }
  };

  const autoFocusEmail =
    typeof window !== "undefined" &&
    window.matchMedia("(min-width: 1024px)").matches;

  return (
    <main className="bg-canvas text-ink flex min-h-[100dvh] items-center justify-center p-4">
      <div className="grid w-full max-w-[880px] gap-6 lg:grid-cols-[1fr_400px] lg:items-center">
        <section
          className="hidden flex-col gap-6 px-2 lg:flex"
          style={{
            animation: "fade-up 500ms cubic-bezier(0.23,1,0.32,1) both",
          }}
        >
          <Brand size="lg" />
          <h1 className="text-ink text-[28px] leading-[1.25] font-normal tracking-[-0.02em]">
            チームの会話と、
            <br />
            手元のマシンで動くコーディングエージェント。
          </h1>
          <ul className="text-ink-2 flex flex-col gap-3 text-[13.5px]">
            <li className="flex items-start gap-3">
              <span className="bg-accent-tint text-accent-ink mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-[7px]">
                <MessageSquare size={13} />
              </span>
              Org → プロジェクト → チャット。Personal DM
              では常時応答、プロジェクトチャットでは @mention で応答。
            </li>
            <li className="flex items-start gap-3">
              <span className="bg-accent-tint text-accent-ink mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-[7px]">
                <Cpu size={13} />
              </span>
              Codex / Claude / Cursor などの CLI をあなたのマシンで実行。
              <code className="bg-inset rounded-[4px] px-1 font-mono text-[12px]">
                npm i -g tahcode
              </code>{" "}
              で接続し、Multica daemon が動かします。
            </li>
            <li className="flex items-start gap-3">
              <span className="bg-accent-tint text-accent-ink mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-[7px]">
                <ShieldCheck size={13} />
              </span>
              Owner / Admin / Member と、default deny のランタイム利用許可。
            </li>
          </ul>
        </section>

        <section
          className="rounded-window bg-surface shadow-overlay w-full overflow-hidden"
          style={{ animation: "pop-in 300ms cubic-bezier(0.23,1,0.32,1) both" }}
        >
          <div className="flex items-center justify-between gap-3 px-5 pt-5">
            <div className="lg:hidden">
              <Brand />
            </div>
            <SegmentedControl
              options={FLOWS}
              value={flowLabel}
              onChange={switchFlow}
              className="ml-auto"
            />
          </div>
          <form
            className="flex flex-col gap-3.5 px-5 pt-4 pb-5"
            noValidate
            aria-busy={busy}
            onSubmit={(event) => {
              event.preventDefault();
              void submitPassword();
            }}
          >
            <div>
              <h2 className="text-ink text-[16px] font-semibold tracking-[-0.01em]">
                {signUp ? "アカウントを作成" : "おかえりなさい"}
              </h2>
              <p className="text-ink-3 mt-1 text-[12.5px] leading-relaxed">
                {signUp
                  ? "作成後、最初の Org を作るか招待リンクで参加します。"
                  : "Org を選んで Personal DM に戻ります。"}
              </p>
            </div>

            <Button
              type="button"
              variant="secondary"
              size="md"
              className="w-full"
              disabled={busy || !googleEnabled}
              onClick={() => void continueWithGoogle()}
            >
              <GoogleMark />
              {pending === "google"
                ? "Google に移動しています…"
                : "Google で続ける"}
            </Button>
            {!googleEnabled && (
              <p
                className="text-ink-3 -mt-1.5 text-center text-[11.5px] leading-relaxed"
                title="Convex の環境変数 AUTH_GOOGLE_ID / AUTH_GOOGLE_SECRET が未設定です"
              >
                Google ログインは現在利用できません。メールアドレスで
                {signUp ? "登録" : "ログイン"}してください。
              </p>
            )}
            <div
              className="text-ink-3 flex items-center gap-3 text-[11.5px]"
              aria-hidden
            >
              <span className="bg-line h-px flex-1" />
              または
              <span className="bg-line h-px flex-1" />
            </div>

            {signUp && (
              <div>
                <Label htmlFor={`${ids}-name`} hint="任意">
                  表示名
                </Label>
                <Input
                  id={`${ids}-name`}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="例: 山田 太郎"
                  autoComplete="name"
                  maxLength={80}
                  disabled={busy}
                />
              </div>
            )}
            <div>
              <Label htmlFor={`${ids}-email`}>メールアドレス</Label>
              <Input
                id={`${ids}-email`}
                ref={emailRef}
                type="email"
                inputMode="email"
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value);
                  clearFieldError("email");
                }}
                placeholder="you@example.com"
                autoComplete="email"
                autoCapitalize="none"
                spellCheck={false}
                autoFocus={autoFocusEmail}
                disabled={busy}
                invalid={Boolean(fieldErrors.email)}
                aria-describedby={
                  fieldErrors.email ? `${ids}-email-error` : undefined
                }
              />
              {fieldErrors.email && (
                <FieldError id={`${ids}-email-error`}>
                  {fieldErrors.email}
                </FieldError>
              )}
            </div>
            <div>
              <Label
                htmlFor={`${ids}-password`}
                hint={signUp ? `${PASSWORD_MIN_LENGTH} 文字以上` : undefined}
              >
                パスワード
              </Label>
              <Input
                id={`${ids}-password`}
                ref={passwordRef}
                type="password"
                value={password}
                onChange={(event) => {
                  setPassword(event.target.value);
                  clearFieldError("password");
                }}
                placeholder="••••••••"
                autoComplete={signUp ? "new-password" : "current-password"}
                disabled={busy}
                invalid={Boolean(fieldErrors.password)}
                aria-describedby={
                  fieldErrors.password ? `${ids}-password-error` : undefined
                }
              />
              {fieldErrors.password && (
                <FieldError id={`${ids}-password-error`}>
                  {fieldErrors.password}
                </FieldError>
              )}
            </div>
            {signUp && (
              <div>
                <Label htmlFor={`${ids}-confirm`}>パスワード（確認）</Label>
                <Input
                  id={`${ids}-confirm`}
                  ref={confirmRef}
                  type="password"
                  value={confirm}
                  onChange={(event) => {
                    setConfirm(event.target.value);
                    clearFieldError("confirm");
                  }}
                  placeholder="••••••••"
                  autoComplete="new-password"
                  disabled={busy}
                  invalid={Boolean(fieldErrors.confirm)}
                  aria-describedby={
                    fieldErrors.confirm ? `${ids}-confirm-error` : undefined
                  }
                />
                {fieldErrors.confirm && (
                  <FieldError id={`${ids}-confirm-error`}>
                    {fieldErrors.confirm}
                  </FieldError>
                )}
              </div>
            )}
            {formError && (
              <InlineError>
                <span role="alert">{formError.message}</span>
                {formError.offerSignIn && (
                  <button
                    type="button"
                    className="text-ink mt-1.5 block font-medium underline-offset-2 hover:underline"
                    onClick={() => switchFlow("ログイン")}
                  >
                    このメールアドレスでログインする
                  </button>
                )}
              </InlineError>
            )}
            <Button
              type="submit"
              variant="accent"
              size="md"
              disabled={busy}
              className="mt-1 w-full"
            >
              {pending === "password"
                ? awaitingSession
                  ? "サインインしています…"
                  : "確認しています…"
                : signUp
                  ? "登録して始める"
                  : "ログイン"}
              {!busy && <ArrowRight size={14} />}
            </Button>
            <p className="text-ink-3 text-center text-[12px]">
              {signUp ? "すでにアカウントがありますか？" : "はじめてですか？"}{" "}
              <button
                type="button"
                className="text-accent-ink font-medium hover:underline"
                disabled={busy}
                onClick={() => switchFlow(signUp ? "ログイン" : "新規登録")}
              >
                {signUp ? "ログイン" : "新規登録"}
              </button>
            </p>
          </form>
        </section>
      </div>
    </main>
  );
}
