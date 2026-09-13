import { BookOpen, Building2, Cpu, Users } from "lucide-react";
import { useEffect } from "react";
import { useLocation } from "react-router-dom";

import { StatusPill } from "@/components/atoms/StatusPill";
import { TextRow } from "@/components/atoms/TextRow";
import { useOrg } from "@/harness/OrgContext";
import { RuntimePane } from "@/harness/rail/RuntimePane";
import { SkillsPane } from "@/harness/rail/SkillsPane";
import { TeamPane } from "@/harness/rail/TeamPane";
import { CopyButton } from "@/harness/ui/CopyButton";
import { roleLabel } from "@/lib/format";
import { useDocumentTitle } from "@/lib/title";

/* ─────────────────────────────────────────────────────────
 * ORG SETTINGS — minimal by design: identity, members and
 * roles, runtimes and grants. The same panes as the rail,
 * given room to breathe.
 * ───────────────────────────────────────────────────────── */
export default function SettingsPage() {
  const { org, role, projects, chats } = useOrg();
  const location = useLocation();
  useDocumentTitle("設定", org.name);
  useEffect(() => {
    if (location.hash) {
      document
        .getElementById(location.hash.slice(1))
        ?.scrollIntoView({ block: "start" });
    }
  }, [location.hash]);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto flex w-full max-w-[1040px] flex-col gap-6 px-4 py-8 sm:px-8">
        <header
          style={{
            animation: "fade-up 400ms cubic-bezier(0.23,1,0.32,1) both",
          }}
        >
          <div className="text-ink-3 flex items-center gap-2 text-[12px]">
            <Building2 size={13} /> Org 設定
          </div>
          <h1 className="text-ink mt-1 text-[22px] font-normal tracking-[-0.02em]">
            {org.name}
          </h1>
        </header>

        <section
          className="rounded-card bg-surface shadow-card"
          style={{
            animation: "fade-up 400ms cubic-bezier(0.23,1,0.32,1) 60ms both",
          }}
        >
          <div className="primitive-card-bar border-line text-ink border-b text-[13px] font-medium">
            一般
          </div>
          <div className="px-3 py-1">
            <TextRow label="名前" value={org.name} />
            <TextRow
              label="スラッグ"
              value={
                <code className="font-mono text-[12.5px]">{org.slug}</code>
              }
              meta={
                <CopyButton
                  text={`${window.location.origin}/o/${org.slug}`}
                  label="URL"
                  size="xs"
                  variant="quiet"
                />
              }
            />
            <TextRow
              label="あなたのロール"
              value={
                <StatusPill
                  tone={
                    role === "owner"
                      ? "accent"
                      : role === "admin"
                        ? "green"
                        : "neutral"
                  }
                >
                  {roleLabel(role)}
                </StatusPill>
              }
            />
            <TextRow
              label="プロジェクト / チャット"
              value={`${projects?.length ?? 0} / ${chats?.length ?? 0}`}
              meta="あなたに見える範囲"
            />
          </div>
          <div className="border-line text-ink-3 border-t px-3 py-2 text-[12px]">
            名前変更・削除は Phase 1 の範囲外です（Owner のみ、後続フェーズ）。
          </div>
        </section>

        <div className="grid gap-6 lg:grid-cols-2">
          <section
            id="members"
            className="scroll-mt-4"
            style={{
              animation: "fade-up 400ms cubic-bezier(0.23,1,0.32,1) 120ms both",
            }}
          >
            <div className="text-ink-3 mb-3 flex items-center gap-2 text-[12px]">
              <Users size={13} /> メンバーとロール
            </div>
            <TeamPane />
          </section>
          <section
            id="runtimes"
            className="scroll-mt-4"
            style={{
              animation: "fade-up 400ms cubic-bezier(0.23,1,0.32,1) 180ms both",
            }}
          >
            <div className="text-ink-3 mb-3 flex items-center gap-2 text-[12px]">
              <Cpu size={13} /> ランタイムと利用許可
            </div>
            <RuntimePane />
          </section>
        </div>

        <section
          id="skills"
          className="scroll-mt-4"
          style={{
            animation: "fade-up 400ms cubic-bezier(0.23,1,0.32,1) 240ms both",
          }}
        >
          <div className="text-ink-3 mb-3 flex items-center gap-2 text-[12px]">
            <BookOpen size={13} /> スキルライブラリとプロファイル
          </div>
          <SkillsPane />
        </section>
      </div>
    </div>
  );
}
