import { ConvexError } from "convex/values";

/* Stable codes the login UI can translate. Convex redacts plain `Error`
 * messages on production deployments ("Server Error"), so the password
 * provider's failures must be re-thrown as ConvexError to reach the client. */
export const AUTH_ERROR_CODES = [
  "INVALID_CREDENTIALS",
  "TOO_MANY_ATTEMPTS",
  "ACCOUNT_EXISTS",
  "WEAK_PASSWORD",
  "INVALID_EMAIL",
] as const;
export type AuthErrorCode = (typeof AUTH_ERROR_CODES)[number];

// Type alias (not interface): ConvexError<T> requires T extends Value, and
// interfaces lack the implicit index signature that object type aliases have.
export type AuthErrorData = { code: AuthErrorCode };

export function authError(code: AuthErrorCode): ConvexError<AuthErrorData> {
  return new ConvexError<AuthErrorData>({ code });
}

/** Maps @convex-dev/auth's internal error messages onto our codes. */
export function classifyAuthError(message: string): AuthErrorCode | null {
  if (/InvalidAccountId|InvalidSecret|Invalid credentials/i.test(message)) {
    return "INVALID_CREDENTIALS";
  }
  if (/TooManyFailedAttempts/i.test(message)) {
    return "TOO_MANY_ATTEMPTS";
  }
  if (/already exists/i.test(message)) {
    return "ACCOUNT_EXISTS";
  }
  if (/Invalid password/i.test(message)) {
    return "WEAK_PASSWORD";
  }
  if (/valid email/i.test(message)) {
    return "INVALID_EMAIL";
  }
  return null;
}

export function toConvexAuthError(error: unknown): unknown {
  if (error instanceof ConvexError) {
    return error;
  }
  const message = error instanceof Error ? error.message : String(error);
  const code = classifyAuthError(message);
  return code ? authError(code) : error;
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

export function isAcceptablePassword(password: string): boolean {
  return (
    password.length >= PASSWORD_MIN_LENGTH &&
    password.length <= PASSWORD_MAX_LENGTH
  );
}
