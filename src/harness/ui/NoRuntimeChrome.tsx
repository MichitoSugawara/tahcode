import { Cpu } from "lucide-react";

import { Button } from "@/components/atoms/Button";
import { Notice } from "@/harness/ui/Notice";
import { registerRuntimeCtaLabel } from "@/lib/desktop";

/**
 * Live connection chrome for the composer — hides as soon as any usable
 * machine is online. Historical setup replies in the thread stay quiet.
 */
export function NoRuntimeChrome({
  onRegister,
  onReview,
  registered,
}: {
  onRegister: () => void;
  onReview?: () => void;
  registered: boolean;
}) {
  if (registered) {
    return (
      <Notice
        tone="locked"
        title="いま使えるランタイムがありません"
        className="py-2"
        action={
          <>
            <Button
              type="button"
              size="xs"
              variant="accent"
              onClick={onRegister}
            >
              <Cpu size={12} /> {registerRuntimeCtaLabel()}
            </Button>
            {onReview && (
              <Button
                type="button"
                size="xs"
                variant="secondary"
                onClick={onReview}
              >
                設定で確認
              </Button>
            )}
          </>
        }
      >
        指定中のマシンが応答しなくても、他にオンラインで利用できるマシンがあれば自動で使います。いまは使えるマシンがありません。設定のランタイムで状態と許可を確認してください。
      </Notice>
    );
  }

  return (
    <Notice
      tone="info"
      title="マシンランタイムがまだありません"
      className="py-2"
      action={
        <Button type="button" size="xs" variant="accent" onClick={onRegister}>
          <Cpu size={12} /> {registerRuntimeCtaLabel()}
        </Button>
      }
    >
      エージェントは手元のマシンで動きます。登録して{" "}
      <code className="bg-field rounded-[4px] px-1 font-mono text-[11px]">
        tahcode start
      </code>{" "}
      で接続すると、この案内は消えます。
    </Notice>
  );
}
