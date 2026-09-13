/* Client-side counterpart of convex/lib/authErrors.ts: the server throws
 * ConvexError({ code }) and the login page maps the code to copy here. Keep
 * the code list in sync with AUTH_ERROR_CODES on the server. */

export const AUTH_ERROR_CODES = [
  "INVALID_CREDENTIALS",
  "TOO_MANY_ATTEMPTS",
  "ACCOUNT_EXISTS",
  "WEAK_PASSWORD",
  "INVALID_EMAIL",
] as const;
export type AuthErrorCode = (typeof AUTH_ERROR_CODES)[number];

export type AuthFlow = "signIn" | "signUp";

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export type AuthFieldErrors = Partial<
  Record<"name" | "email" | "password" | "confirm", string>
>;

export function validateAuthForm(
  flow: AuthFlow,
  values: { email: string; password: string; confirm: string }
): AuthFieldErrors {
  const errors: AuthFieldErrors = {};
  const email = values.email.trim();
  if (!email) {
    errors.email = "メールアドレスを入力してください";
  } else if (!isValidEmail(email)) {
    errors.email = "メールアドレスの形式が正しくありません";
  }
  if (!values.password) {
    errors.password = "パスワードを入力してください";
  } else if (
    flow === "signUp" &&
    values.password.length < PASSWORD_MIN_LENGTH
  ) {
    errors.password = `パスワードは ${PASSWORD_MIN_LENGTH} 文字以上で入力してください`;
  } else if (
    flow === "signUp" &&
    values.password.length > PASSWORD_MAX_LENGTH
  ) {
    errors.password = `パスワードは ${PASSWORD_MAX_LENGTH} 文字以内で入力してください`;
  }
  if (flow === "signUp" && !errors.password) {
    if (!values.confirm) {
      errors.confirm = "確認用のパスワードを入力してください";
    } else if (values.confirm !== values.password) {
      errors.confirm = "パスワードが一致しません";
    }
  }
  return errors;
}

export type AuthFailure =
  | { kind: "code"; code: AuthErrorCode }
  | { kind: "network" }
  | { kind: "timeout" }
  | { kind: "unknown" };

const NETWORK_ERROR =
  /Failed to fetch|NetworkError|Network request failed|Load failed|ECONNREFUSED|Could not connect|connection (lost|closed)|offline/i;

/** Classifies whatever `signIn` rejected with (ConvexError data, Error, string). */
export function classifyAuthFailure(error: unknown): AuthFailure {
  const data = (error as { data?: unknown } | null)?.data;
  const code =
    typeof data === "string"
      ? data
      : (data as { code?: unknown } | undefined)?.code;
  if (
    typeof code === "string" &&
    (AUTH_ERROR_CODES as readonly string[]).includes(code)
  ) {
    return { code: code as AuthErrorCode, kind: "code" };
  }
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "";
  /* dev deployments include the original message in the stack; map those too */
  if (
    /InvalidAccountId|InvalidSecret|Invalid credentials|INVALID_CREDENTIALS/.test(
      message
    )
  ) {
    return { kind: "code", code: "INVALID_CREDENTIALS" };
  }
  if (/TooManyFailedAttempts|TOO_MANY_ATTEMPTS/.test(message)) {
    return { kind: "code", code: "TOO_MANY_ATTEMPTS" };
  }
  if (/already exists|ACCOUNT_EXISTS/.test(message)) {
    return { kind: "code", code: "ACCOUNT_EXISTS" };
  }
  if (/Invalid password|WEAK_PASSWORD/.test(message)) {
    return { kind: "code", code: "WEAK_PASSWORD" };
  }
  if (/valid email|INVALID_EMAIL/.test(message)) {
    return { kind: "code", code: "INVALID_EMAIL" };
  }
  if (NETWORK_ERROR.test(message)) {
    return { kind: "network" };
  }
  return { kind: "unknown" };
}

export function authFailureMessage(
  failure: AuthFailure,
  flow: AuthFlow
): string {
  switch (failure.kind) {
    case "code": {
      switch (failure.code) {
        case "INVALID_CREDENTIALS": {
          return "メールアドレスまたはパスワードが正しくありません";
        }
        case "TOO_MANY_ATTEMPTS": {
          return "ログインの試行回数が上限に達しました。しばらく待ってからもう一度お試しください";
        }
        case "ACCOUNT_EXISTS": {
          return "このメールアドレスはすでに登録されています。ログインしてください";
        }
        case "WEAK_PASSWORD": {
          return `パスワードは ${PASSWORD_MIN_LENGTH} 文字以上 ${PASSWORD_MAX_LENGTH} 文字以内で入力してください`;
        }
        case "INVALID_EMAIL": {
          return "メールアドレスの形式が正しくありません";
        }
      }
      break;
    }
    case "network": {
      return "サーバーに接続できません。ネットワーク接続を確認して、もう一度お試しください";
    }
    case "timeout": {
      return "サーバーからの応答がありません。ネットワーク接続を確認して、もう一度お試しください";
    }
    case "unknown": {
      break;
    }
  }
  return flow === "signUp"
    ? "登録できませんでした。時間をおいてもう一度お試しください"
    : "ログインできませんでした。時間をおいてもう一度お試しください";
}

export const SESSION_NOT_ESTABLISHED_MESSAGE =
  "認証は完了しましたが、セッションを開始できませんでした。時間をおいて再度お試しください。繰り返す場合は管理者にご連絡ください";

export const OAUTH_INCOMPLETE_MESSAGE =
  "Google でのログインを完了できませんでした。もう一度お試しください";
