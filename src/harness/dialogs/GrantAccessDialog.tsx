import { useMutation } from "convex/react";
import { Users, UserRound, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/atoms/Button";
import { Monogram } from "@/components/atoms/EntityChip";
import { SegmentedControl } from "@/components/atoms/SegmentedControl";
import { StatusPill } from "@/components/atoms/StatusPill";
import { useOrg } from "@/harness/OrgContext";
import type { OrgRole } from "@/harness/OrgContext";
import { Dialog, SectionLabel } from "@/harness/ui/Dialog";
import { ChoiceList, InlineError } from "@/harness/ui/Field";
import { Notice } from "@/harness/ui/Notice";
import { colorFor, displayName, monogram, roleLabel } from "@/lib/format";

import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

/* ─────────────────────────────────────────────────────────
 * GRANT ACCESS — the runtime ACL. Default deny: only the
 * machine owner can run jobs until a grant exists. Grants
 * target one member or a whole role, and can be mixed.
 * ───────────────────────────────────────────────────────── */

const SEGMENTS = ["メンバー", "ロール"] as const;

export function GrantAccessDialog({
  open,
  onOpenChange,
  runtimeId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  runtimeId: Id<"runtimes">;
}) {
  const { runtimes, members, me, isAdmin } = useOrg();
  const grant = useMutation(api.runtimes.grant);
  const revoke = useMutation(api.runtimes.revokeGrant);
  const runtime = runtimes?.find((item) => item._id === runtimeId);
  const [segment, setSegment] = useState<(typeof SEGMENTS)[number]>("メンバー");
  const [userId, setUserId] = useState<Id<"users"> | null>(null);
  const [role, setRole] = useState<OrgRole | null>("member");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setSegment("メンバー");
      setUserId(null);
      setRole("member");
      setError(null);
    }
  }, [open, runtimeId]);

  const canManage =
    !!runtime && (String(runtime.ownerUserId) === String(me._id) || isAdmin);
  const grantedUserIds = useMemo(
    () =>
      new Set(
        (runtime?.grants ?? [])
          .filter((g) => g.targetType === "user")
          .map((g) => String(g.targetUserId))
      ),
    [runtime]
  );
  const grantedRoles = useMemo(
    () =>
      new Set(
        (runtime?.grants ?? [])
          .filter((g) => g.targetType === "role")
          .map((g) => g.targetRole)
      ),
    [runtime]
  );

  const memberOptions = (members ?? [])
    .filter(
      (member) => String(member.user._id) !== String(runtime?.ownerUserId)
    )
    .map((member) => ({
      desc: member.user.email,
      disabled: grantedUserIds.has(String(member.user._id)),
      disabledReason: "すでに許可済み",
      label: (
        <span className="inline-flex items-center gap-2">
          <Monogram color={colorFor(String(member.user._id))}>
            {monogram(displayName(member.user))}
          </Monogram>
          {displayName(member.user)}
          <span className="text-ink-3 text-[11.5px]">
            {roleLabel(member.role)}
          </span>
        </span>
      ),
      value: member.user._id,
    }));

  const roleOptions: {
    value: OrgRole;
    label: string;
    desc: string;
    disabled: boolean;
    disabledReason?: string;
  }[] = [
    {
      desc: "Org のすべてのメンバー（Admin / Owner を含む）",
      disabled: grantedRoles.has("member"),
      disabledReason: "すでに許可済み",
      label: "Member 全員",
      value: "member",
    },
    {
      desc: "Admin と Owner",
      disabled: grantedRoles.has("admin"),
      disabledReason: "すでに許可済み",
      label: "Admin 以上",
      value: "admin",
    },
    {
      desc: "Org の Owner",
      disabled: grantedRoles.has("owner"),
      disabledReason: "すでに許可済み",
      label: "Owner のみ",
      value: "owner",
    },
  ];

  const canSubmit = segment === "メンバー" ? !!userId : !!role;
  const showAdd = canManage && !(segment === "メンバー" && memberOptions.length === 0);
  const skipLabel = (runtime?.grants.length ?? 0) === 0 ? "今は追加しない" : "閉じる";

  const submit = async () => {
    if (!runtime || busy) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (segment === "メンバー") {
        if (!userId) {
          return;
        }
        await grant({
          runtimeId: runtime._id,
          targetType: "user",
          targetUserId: userId,
        });
        setUserId(null);
      } else {
        if (!role) {
          return;
        }
        await grant({
          runtimeId: runtime._id,
          targetRole: role,
          targetType: "role",
        });
      }
      toast.success("利用を許可しました");
    } catch (error) {
      setError(error instanceof Error ? error.message : "付与に失敗しました");
    } finally {
      setBusy(false);
    }
  };

  const owner = members?.find(
    (member) => String(member.user._id) === String(runtime?.ownerUserId)
  );

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={runtime ? `${runtime.name} の利用許可` : "利用許可"}
      description="所有者のあなたは、許可を足さなくてもこのマシンを使えます。他のメンバーに使わせたいときだけ追加してください。今は追加せずに閉じても構いません。"
      width={520}
      footer={
        canManage ? (
          <>
            <span className="text-ink-3 text-[12px]">
              所有者: {owner ? displayName(owner.user) : "—"}
            </span>
            <div className="flex items-center gap-1.5">
              <Button
                type="button"
                variant={canSubmit ? "ghost" : "accent"}
                size="sm"
                onClick={() => onOpenChange(false)}
              >
                {skipLabel}
              </Button>
              {showAdd && (
                <Button
                  type="button"
                  variant={canSubmit ? "accent" : "ghost"}
                  size="sm"
                  disabled={busy || !canSubmit}
                  onClick={() => void submit()}
                >
                  {busy ? "付与中…" : "許可を追加"}
                </Button>
              )}
            </div>
          </>
        ) : (
          <>
            <span className="text-ink-3 text-[12px]">
              許可を変更できるのは所有者と Admin 以上です
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onOpenChange(false)}
            >
              閉じる
            </Button>
          </>
        )
      }
    >
      {runtime ? (
        <div className="flex flex-col gap-4">
          <div>
            <SectionLabel>現在の許可</SectionLabel>
            {runtime.grants.length === 0 ? (
              <Notice tone="locked" title="今は所有者だけが使えます">
                共有しなくても、あなたはこのマシンでジョブを実行できます。他のメンバーが必要になったら、いつでも追加できます。
              </Notice>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {runtime.grants.map((item) => {
                  const user =
                    item.targetType === "user"
                      ? members?.find(
                          (member) =>
                            String(member.user._id) ===
                            String(item.targetUserId)
                        )?.user
                      : undefined;
                  return (
                    <span
                      key={String(item._id)}
                      className="bg-field text-ink shadow-hairline inline-flex h-7 items-center gap-1.5 rounded-full pr-1 pl-2 text-[12.5px]"
                      style={{
                        animation:
                          "pop-in 200ms cubic-bezier(0.23,1,0.32,1) both",
                      }}
                    >
                      {item.targetType === "user" ? (
                        <UserRound size={12} className="text-ink-3" />
                      ) : (
                        <Users size={12} className="text-ink-3" />
                      )}
                      {item.targetType === "user"
                        ? displayName(user)
                        : `ロール: ${roleLabel(item.targetRole ?? "member")}`}
                      {canManage && (
                        <button
                          type="button"
                          aria-label="許可を取り消す"
                          onClick={() => {
                            void revoke({ grantId: item._id })
                              .then(() => toast.success("許可を取り消しました"))
                              .catch((error: unknown) =>
                                toast.error(
                                  error instanceof Error
                                    ? error.message
                                    : "取り消しに失敗しました"
                                )
                              );
                          }}
                          className="text-ink-3 hover:bg-red-tint hover:text-red flex size-5 items-center justify-center rounded-full transition-colors duration-100"
                        >
                          <X size={11} strokeWidth={2.5} />
                        </button>
                      )}
                    </span>
                  );
                })}
              </div>
            )}
          </div>

          {canManage && (
            <div>
              <div className="mb-2 flex items-center justify-between gap-3">
                <SectionLabel className="mb-0">許可を追加</SectionLabel>
                <SegmentedControl
                  options={SEGMENTS}
                  value={segment}
                  onChange={setSegment}
                />
              </div>
              {segment === "メンバー" ? (
                memberOptions.length > 0 ? (
                  <ChoiceList
                    value={userId}
                    onChange={setUserId}
                    options={memberOptions}
                  />
                ) : (
                  <p className="rounded-card bg-inset text-ink-3 shadow-hairline px-3 py-2.5 text-[12.5px] leading-relaxed">
                    他のメンバーがまだいません。Team
                    タブから招待すると、ここに表示されます。
                  </p>
                )
              ) : (
                <ChoiceList
                  value={role}
                  onChange={setRole}
                  options={roleOptions}
                />
              )}
              {error && <InlineError>{error}</InlineError>}
            </div>
          )}

          <div className="text-ink-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] leading-relaxed">
            <StatusPill
              tone={runtime.canUse ? "green" : "neutral"}
              className="h-5 text-[11.5px]"
            >
              {runtime.canUse
                ? "あなたは利用できます"
                : "あなたは利用できません"}
            </StatusPill>
            <span>
              Owner / Admin でも許可がなければ他人のマシンは使えません
            </span>
          </div>
        </div>
      ) : (
        <p className="text-ink-2 text-[13px]">ランタイムが見つかりません。</p>
      )}
    </Dialog>
  );
}
