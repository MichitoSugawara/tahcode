import { useAuthActions } from "@convex-dev/auth/react";
import { useState } from "react";
import { toast } from "sonner";

export default function LoginPage() {
  const { signIn } = useAuthActions();
  const [flow, setFlow] = useState<"signIn" | "signUp">("signUp");
  const [pending, setPending] = useState(false);

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPending(true);
    try {
      const formData = new FormData(event.currentTarget);
      formData.set("flow", flow);
      await signIn("password", formData);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "ログインに失敗しました");
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="mx-auto flex h-full max-w-md flex-col justify-center gap-6 p-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-violet-600">
          Team Harness · Phase 1
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">
          チーム作業場にサインイン
        </h1>
        <p className="mt-2 text-sm text-stone-500">
          メール + パスワード（Convex Auth）。Org・Project・DM・ランタイムの垂直スライス用です。
        </p>
      </div>
      <form onSubmit={onSubmit} className="bui-surface flex flex-col gap-3 rounded-2xl p-5">
        <label className="grid gap-1 text-sm">
          <span className="font-medium">名前</span>
          <input
            name="name"
            placeholder="例: まい"
            className="rounded-lg border border-stone-200 bg-transparent px-3 py-2 outline-none focus:border-violet-500"
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-medium">メール</span>
          <input
            name="email"
            type="email"
            required
            placeholder="you@example.com"
            className="rounded-lg border border-stone-200 bg-transparent px-3 py-2 outline-none focus:border-violet-500"
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-medium">パスワード</span>
          <input
            name="password"
            type="password"
            required
            minLength={8}
            placeholder="8文字以上"
            className="rounded-lg border border-stone-200 bg-transparent px-3 py-2 outline-none focus:border-violet-500"
          />
        </label>
        <button
          type="submit"
          disabled={pending}
          className="bui-send mt-1 rounded-xl px-4 py-2 text-sm font-semibold disabled:opacity-50"
        >
          {pending ? "送信中…" : flow === "signUp" ? "登録して入る" : "ログイン"}
        </button>
        <button
          type="button"
          onClick={() => setFlow(flow === "signUp" ? "signIn" : "signUp")}
          className="text-sm text-stone-500 underline underline-offset-4"
        >
          {flow === "signUp" ? "ログインに切り替え" : "新規登録に切り替え"}
        </button>
      </form>
      <p className="text-xs leading-5 text-stone-500">
        Phase 1 スコープ: DM は常時応答、プロジェクトチャットは @mention
        時のみ応答。Kanban・Focus・クラウドエージェントは対象外です。
      </p>
    </div>
  );
}
