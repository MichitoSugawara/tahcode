import { useMutation } from "convex/react";
import { Link2, Shield, UserRound } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../../../convex/_generated/api";
import { Button } from "@/components/atoms/Button";
import { useOrg } from "@/harness/OrgContext";
import { Dialog, SectionLabel, Well } from "@/harness/ui/Dialog";
import { CopyButton } from "@/harness/ui/CopyButton";
import { ChoiceList, InlineError } from "@/harness/ui/Field";
import { Notice } from "@/harness/ui/Notice";

/* ─────────────────────────────────────────────────────────
 * INVITE — Admin+ picks a role and gets a 7-day link. Owner
 * cannot be granted by invitation (Multica rule): promote an
 * existing member instead.
 * ───────────────────────────────────────────────────────── */

export function InviteDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { org, isAdmin } = useOrg();
  const createInvite = useMutation(api.orgs.createInvite);
  const [role, setRole] = useState<"member" | "admin">("member");
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setToken(null);
      setError(null);
      setRole("member");
    }
  }, [open]);

  const link = token ? `${window.location.origin}/invite/${token}` : "";

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={`${org.name} に招待`}
      description="招待リンクを共有してください。リンクを開いてサインインすると、選んだロールで参加します。有効期限は 7 日です。"
      width={480}
      footer={
        token ? (
          <>
            <span className="text-[12px] text-ink-3">リンクは 1 回だけ使えます</span>
            <div className="flex items-center gap-1.5">
              <Button type="button" variant="ghost" size="sm" onClick={() => setToken(null)}>
                もう 1 通発行
              </Button>
              <Button type="button" variant="accent" size="sm" onClick={() => onOpenChange(false)}>
                完了
              </Button>
            </div>
          </>
        ) : (
          <>
            <span className="text-[12px] text-ink-3">{isAdmin ? "Owner は招待では付与できません" : "招待は Admin 以上の権限が必要です"}</span>
            <div className="flex items-center gap-1.5">
              <Button type="button" variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
                キャンセル
              </Button>
              <Button
                type="button"
                variant="accent"
                size="sm"
                disabled={!isAdmin || busy}
                onClick={async () => {
                  setBusy(true);
                  setError(null);
                  try {
                    const result = await createInvite({ orgId: org._id, role });
                    setToken(result.token);
                  } catch (e) {
                    setError(e instanceof Error ? e.message : "発行に失敗しました");
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <Link2 size={13} /> {busy ? "発行中…" : "招待リンクを発行"}
              </Button>
            </div>
          </>
        )
      }
    >
      {!isAdmin ? (
        <Notice tone="locked" title="招待できるのは Owner / Admin です">
          あなたのロールは Member です。招待が必要な場合は Owner または Admin に依頼してください。
        </Notice>
      ) : token ? (
        <div className="flex flex-col gap-4" style={{ animation: "fade-up 300ms cubic-bezier(0.23,1,0.32,1) both" }}>
          <div>
            <SectionLabel>招待リンク（{role === "admin" ? "Admin" : "Member"}）</SectionLabel>
            <Well className="flex items-center gap-2 px-3 py-2">
              <Link2 size={14} className="shrink-0 text-ink-3" />
              <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-ink-2">{link}</span>
              <CopyButton text={link} label="リンクをコピー" size="xs" />
            </Well>
          </div>
          <div>
            <SectionLabel>トークンのみ</SectionLabel>
            <Well className="flex items-center gap-2 px-3 py-2">
              <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-ink-2">{token}</span>
              <CopyButton text={token} size="xs" />
            </Well>
            <p className="mt-1.5 text-[12px] leading-relaxed text-ink-3">はじめて開いたときの「招待で参加」欄に貼り付けても参加できます。</p>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <SectionLabel className="mb-0">参加時のロール</SectionLabel>
          <ChoiceList
            value={role}
            onChange={setRole}
            options={[
              { value: "member", label: "Member", desc: "見えるチャットと、許可されたランタイムだけを使えます", icon: <UserRound size={14} /> },
              { value: "admin", label: "Admin", desc: "招待・ロール変更・プロジェクトメンバーの追加ができます", icon: <Shield size={14} /> },
            ]}
          />
          {error && <InlineError>{error}</InlineError>}
        </div>
      )}
    </Dialog>
  );
}
