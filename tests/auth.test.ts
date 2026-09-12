import { describe, expect, it } from "vitest";
import { authFailureMessage, classifyAuthFailure, isValidEmail, validateAuthForm } from "../shared/auth.ts";

describe("validateAuthForm", () => {
  it("requires an email and a password", () => {
    const errors = validateAuthForm("signIn", { email: "", password: "", confirm: "" });
    expect(errors.email).toBe("メールアドレスを入力してください");
    expect(errors.password).toBe("パスワードを入力してください");
    expect(errors.confirm).toBeUndefined();
  });

  it("rejects malformed emails", () => {
    expect(validateAuthForm("signIn", { email: "not-an-email", password: "x", confirm: "" }).email).toBe("メールアドレスの形式が正しくありません");
    expect(isValidEmail("a@b.co")).toBe(true);
    expect(isValidEmail("a b@c.d")).toBe(false);
  });

  it("enforces the password policy and confirmation only on sign-up", () => {
    expect(validateAuthForm("signIn", { email: "a@b.co", password: "short", confirm: "" })).toEqual({});
    const weak = validateAuthForm("signUp", { email: "a@b.co", password: "short", confirm: "short" });
    expect(weak.password).toBe("パスワードは 8 文字以上で入力してください");
    expect(weak.confirm).toBeUndefined();
    expect(validateAuthForm("signUp", { email: "a@b.co", password: "long-enough-1", confirm: "" }).confirm).toBe("確認用のパスワードを入力してください");
    expect(validateAuthForm("signUp", { email: "a@b.co", password: "long-enough-1", confirm: "long-enough-2" }).confirm).toBe("パスワードが一致しません");
    expect(validateAuthForm("signUp", { email: "a@b.co", password: "long-enough-1", confirm: "long-enough-1" })).toEqual({});
  });
});

describe("classifyAuthFailure", () => {
  it("reads ConvexError codes from production-redacted errors", () => {
    const error = Object.assign(new Error("[Request ID: x] Server Error"), { data: { code: "INVALID_CREDENTIALS" } });
    expect(classifyAuthFailure(error)).toEqual({ kind: "code", code: "INVALID_CREDENTIALS" });
    expect(authFailureMessage(classifyAuthFailure(error), "signIn")).toBe("メールアドレスまたはパスワードが正しくありません");
  });

  it("falls back to dev-deployment messages", () => {
    expect(classifyAuthFailure(new Error("Uncaught Error: InvalidSecret"))).toEqual({ kind: "code", code: "INVALID_CREDENTIALS" });
    expect(classifyAuthFailure(new Error("Account a@b.co already exists"))).toEqual({ kind: "code", code: "ACCOUNT_EXISTS" });
    expect(classifyAuthFailure(new TypeError("Failed to fetch"))).toEqual({ kind: "network" });
    expect(classifyAuthFailure(new Error("Server Error"))).toEqual({ kind: "unknown" });
  });

  it("phrases unknown failures per flow", () => {
    expect(authFailureMessage({ kind: "unknown" }, "signUp")).toContain("登録できませんでした");
    expect(authFailureMessage({ kind: "unknown" }, "signIn")).toContain("ログインできませんでした");
    expect(authFailureMessage({ kind: "code", code: "ACCOUNT_EXISTS" }, "signUp")).toContain("すでに登録されています");
  });
});
