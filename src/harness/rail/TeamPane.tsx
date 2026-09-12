import * as Popover from "@radix-ui/react-popover";
import { useMutation } from "convex/react";
import { Check, ChevronDown, UserPlus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "../../../convex/_generated/api";
import { Button } from "@/components/atoms/Button";
import { Monogram } from "@/components/atoms/EntityChip";
import { StatusPill } from "@/components/atoms/StatusPill";
import { Shimmer } from "@/components/atoms/Shimmer";
import GlideMenu from "@/components/primitives/GlideMenu";
import { useOrg, type Member, type OrgRole } from "@/harness/OrgContext";
import { Notice } from "@/harness/ui/Notice";
import { colorFor, displayName, monogram, roleLabel } from "@/lib/format";

/* ─────────────────────────────────────────────────────────
 * TEAM PANE — roster with roles. Admin+ changes admin/member;
 * only an owner can touch owner (and never the last one).
 * ───────────────────────────────────────────────────────── */

const ROLE_TONE: Record<OrgRole, "accent" | "green" | "neutral"> = { owner: "accent", admin: "green", member: "neutral" };

const ROLE_DESC: Record<OrgRole, string> = {
  owner: "Org 全体の管理。Owner の昇格・降格ができる唯一のロール",
  admin: "招待・ロール変更・プロジェクトメンバー追加",
  member: "見えるチャットと、許可されたランタイムのみ",
};

function RoleMenu({ member }: { member: Member }) {
  const { org, me, isOwner, isAdmin, members } = useOrg();
  const setRole = useMutation(api.orgs.setRole);
  const [open, setOpen] = useState(false);
  const isSelf = String(member.user._id) === String(me._id);
  const ownerCount = (members ?? []).filter((item) => item.role === "owner").length;
  const canEdit = isAdmin && (member.role !== "owner" || isOwner);

  if (!canEdit) {
    return <StatusPill tone={ROLE_TONE[member.role]}>{roleLabel(member.role)}</StatusPill>;
  }

  const options: { value: OrgRole; disabled: boolean; reason?: string }[] = [
    { value: "owner", disabled: !isOwner, reason: "Owner の付与は Owner のみ" },
    { value: "admin", disabled: member.role === "owner" && ownerCount <= 1, reason: "最後の Owner は降格できません" },
    { value: "member", disabled: member.role === "owner" && ownerCount <= 1, reason: "最後の Owner は降格できません" },
  ];

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button type="button" aria-label={`${displayName(member.user)} のロールを変更`} className="inline-flex items-center gap-1 rounded-full transition-[transform] duration-150 active:scale-[0.97]">
          <StatusPill tone={ROLE_TONE[member.role]} className="pr-1.5">
            {roleLabel(member.role)}
            <ChevronDown size={11} className="text-ink-3" />
          </StatusPill>
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content align="end" sideOffset={6} className="z-[80] w-64 rounded-[10px] bg-surface p-1 shadow-raised outline-none" style={{ animation: "pop-in 180ms cubic-bezier(0.23,1,0.32,1) both" }}>
          <GlideMenu className="flex flex-col gap-px" highlightClassName="inset-x-0 rounded-[6px] bg-hover">
            {options.map((option) => (
              <button
                key={option.value}
                type="button"
                data-menu-row
                disabled={option.disabled || option.value === member.role}
                title={option.disabled ? option.reason : undefined}
                onClick={() => {
                  setOpen(false);
                  void setRole({ orgId: org._id, userId: member.user._id, role: option.value })
                    .then(() => toast.success(`${displayName(member.user)} を ${roleLabel(option.value)} にしました`))
                    .catch((e: unknown) => toast.error(e instanceof Error ? e.message : "変更に失敗しました"));
                }}
                className="relative z-10 flex w-full items-start gap-2 rounded-[6px] px-2 py-1.5 text-left disabled:opacity-45"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-[12.5px] font-medium text-ink">{roleLabel(option.value)}</span>
                  <span className="block text-[11.5px] leading-[1.4] text-ink-3">{option.disabled ? option.reason : ROLE_DESC[option.value]}</span>
                </span>
                <span className={`mt-0.5 shrink-0 text-ink ${option.value === member.role ? "" : "invisible"}`}>
                  <Check size={13} strokeWidth={2.5} />
                </span>
              </button>
            ))}
          </GlideMenu>
          {isSelf && <div className="mt-1 border-t border-line px-2 pt-1.5 pb-1 text-[11px] text-ink-3">自分のロールを下げると管理操作ができなくなります</div>}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

export function TeamPane() {
  const { members, me, isAdmin, org, openDialog } = useOrg();
  const sorted = [...(members ?? [])].sort((a, b) => {
    const rank: Record<OrgRole, number> = { owner: 0, admin: 1, member: 2 };
    return rank[a.role] - rank[b.role] || displayName(a.user).localeCompare(displayName(b.user));
  });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2 px-0.5">
        <span className="text-[13px] font-semibold text-ink">{org.name} のメンバー</span>
        <span className="inline-flex h-5 items-center rounded-md bg-inset px-1.5 text-[11.5px] font-medium tabular-nums text-ink-2 shadow-hairline">{sorted.length}</span>
      </div>

      <div className="overflow-hidden rounded-card bg-surface shadow-card">
        {sorted.map((member, i) => {
          const self = String(member.user._id) === String(me._id);
          return (
            <div key={String(member.user._id)} className="flex min-h-12 items-center gap-2.5 border-b border-line px-3 py-2 last:border-0" style={{ animation: `fade-up 300ms cubic-bezier(0.23,1,0.32,1) ${i * 40}ms both` }}>
              <Monogram color={colorFor(String(member.user._id))} className="size-6 text-[11px]">
                {monogram(displayName(member.user))}
              </Monogram>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 text-[13px] font-medium text-ink">
                  <span className="truncate">{displayName(member.user)}</span>
                  {self && <span className="shrink-0 rounded-[4px] bg-inset px-1 text-[10.5px] font-medium text-ink-3">あなた</span>}
                </div>
                <div className="truncate text-[11.5px] text-ink-3">
                  {member.user.handle ? `@${member.user.handle}` : ""}
                  {member.user.handle && member.user.email ? " · " : ""}
                  {member.user.email ?? ""}
                </div>
              </div>
              <RoleMenu member={member} />
            </div>
          );
        })}
        {sorted.length === 0 && (
          <div className="px-3 py-3 text-[12.5px]">
            <Shimmer>メンバーを読み込んでいます</Shimmer>
          </div>
        )}
      </div>

      {isAdmin ? (
        <Button type="button" size="sm" variant="accent" className="self-start" onClick={() => openDialog({ kind: "invite" })}>
          <UserPlus size={13} /> 招待リンクを発行
        </Button>
      ) : (
        <Notice tone="locked" title="招待とロール変更は Owner / Admin の操作です">
          あなたは Member です。見えるチャットと、許可されたランタイムだけを使えます。
        </Notice>
      )}

      <div className="rounded-card bg-inset p-3 text-[12px] leading-relaxed text-ink-3 shadow-hairline">
        <div className="mb-1 font-medium text-ink-2">ロールの範囲</div>
        <div>Owner — {ROLE_DESC.owner}</div>
        <div>Admin — {ROLE_DESC.admin}</div>
        <div>Member — {ROLE_DESC.member}</div>
        <div className="mt-1.5">ロールはランタイムの利用可否を決めません。他人のマシンは許可が必要です。</div>
      </div>
    </div>
  );
}
