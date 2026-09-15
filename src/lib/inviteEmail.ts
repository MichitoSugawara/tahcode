import { isValidEmail } from "@shared/auth.ts";

export function normalizeOptionalEmail(raw: string): string | undefined {
  const trimmed = raw.trim().toLowerCase();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function optionalInviteEmailError(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }
  if (!isValidEmail(trimmed)) {
    return "メールアドレスの形式が正しくありません";
  }
  return null;
}

export function inviteAcceptErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : "";
  if (/different email/i.test(raw)) {
    return "この招待は別のメールアドレス宛です。";
  }
  if (/verify your email/i.test(raw)) {
    return "参加する前にメールアドレスを確認してください。";
  }
  if (/already used/i.test(raw)) {
    return "この招待はすでに使われています。";
  }
  if (/expired/i.test(raw)) {
    return "この招待は期限切れです。発行者に再発行を依頼してください。";
  }
  return "招待が見つかりません。";
}
