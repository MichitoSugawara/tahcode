import { describe, expect, it } from "vitest";

import {
  authFailureMessage,
  classifyAuthFailure,
  isValidEmail,
  validateAuthForm,
} from "../shared/auth.ts";

describe(validateAuthForm, () => {
  it("requires an email and a password", () => {
    const errors = validateAuthForm("signIn", {
      confirm: "",
      email: "",
      password: "",
    });
    expect(errors.email).toBe("メールアドレスを入力してください");
    expect(errors.password).toBe("パスワードを入力してください");
    expect(errors.confirm).toBeUndefined();
  });

  it("rejects malformed emails", () => {
    expect(
      validateAuthForm("signIn", {
        confirm: "",
        email: "not-an-email",
        password: "x",
      }).email
    ).toBe("メールアドレスの形式が正しくありません");
    expect(isValidEmail("a@b.co")).toBeTruthy();
    expect(isValidEmail("a b@c.d")).toBeFalsy();
  });

  it("enforces the password policy and confirmation only on sign-up", () => {
    expect(
      validateAuthForm("signIn", {
        confirm: "",
        email: "a@b.co",
        password: "short",
      })
    ).toStrictEqual({});
    const weak = validateAuthForm("signUp", {
      confirm: "short",
      email: "a@b.co",
      password: "short",
    });
    expect(weak.password).toBe("パスワードは 8 文字以上で入力してください");
    expect(weak.confirm).toBeUndefined();
    expect(
      validateAuthForm("signUp", {
        confirm: "",
        email: "a@b.co",
        password: "long-enough-1",
      }).confirm
    ).toBe("確認用のパスワードを入力してください");
    expect(
      validateAuthForm("signUp", {
        confirm: "long-enough-2",
        email: "a@b.co",
        password: "long-enough-1",
      }).confirm
    ).toBe("パスワードが一致しません");
  });

  it("accepts a matching sign-up confirmation", () => {
    expect(
      validateAuthForm("signUp", {
        confirm: "long-enough-1",
        email: "a@b.co",
        password: "long-enough-1",
      })
    ).toStrictEqual({});
  });
});

describe(classifyAuthFailure, () => {
  it("reads ConvexError codes from production-redacted errors", () => {
    const error = Object.assign(new Error("[Request ID: x] Server Error"), {
      data: { code: "INVALID_CREDENTIALS" },
    });
    expect(classifyAuthFailure(error)).toStrictEqual({
      code: "INVALID_CREDENTIALS",
      kind: "code",
    });
    expect(authFailureMessage(classifyAuthFailure(error), "signIn")).toBe(
      "メールアドレスまたはパスワードが正しくありません"
    );
  });

  it("falls back to dev-deployment messages", () => {
    expect(
      classifyAuthFailure(new Error("Uncaught Error: InvalidSecret"))
    ).toStrictEqual({ code: "INVALID_CREDENTIALS", kind: "code" });
    expect(
      classifyAuthFailure(new Error("Account a@b.co already exists"))
    ).toStrictEqual({ code: "ACCOUNT_EXISTS", kind: "code" });
    expect(classifyAuthFailure(new TypeError("Failed to fetch"))).toStrictEqual(
      { kind: "network" }
    );
    expect(classifyAuthFailure(new Error("Server Error"))).toStrictEqual({
      kind: "unknown",
    });
  });

  it("phrases unknown failures per flow", () => {
    expect(authFailureMessage({ kind: "unknown" }, "signUp")).toContain(
      "登録できませんでした"
    );
    expect(authFailureMessage({ kind: "unknown" }, "signIn")).toContain(
      "ログインできませんでした"
    );
    expect(
      authFailureMessage({ code: "ACCOUNT_EXISTS", kind: "code" }, "signUp")
    ).toContain("すでに登録されています");
  });
});
