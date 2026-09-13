import { useAction, useMutation, useQuery } from "convex/react";
import { BookOpen, Folder, Layers, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/atoms/Button";
import { Shimmer } from "@/components/atoms/Shimmer";
import { StatusPill } from "@/components/atoms/StatusPill";
import { useSetProjectProfile } from "@/harness/optimisticMutations";
import { useOrg } from "@/harness/OrgContext";
import { Dialog } from "@/harness/ui/Dialog";
import { Input, Label, Textarea } from "@/harness/ui/Field";
import { Notice } from "@/harness/ui/Notice";
import { errorSummary } from "@/lib/format";

import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

export function SkillsPane() {
  const { org, isAdmin, projects } = useOrg();
  const skills = useQuery(api.skills.listLibrary, { orgId: org._id });
  const profiles = useQuery(api.skillProfiles.list, { orgId: org._id });
  const [skillOpen, setSkillOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [editingProfile, setEditingProfile] = useState<
    Id<"skillProfiles"> | undefined
  >();

  return (
    <div className="flex flex-col gap-4">
      <Notice tone="info" title="本文はプロンプトに埋め込みません">
        ジョブ開始時に、選択したプロファイルのスキルをこのマシンのハーネス用ディレクトリへ同期します。各
        CLI がオンデマンドで読み込みます。
      </Notice>

      <section className="rounded-card bg-surface shadow-card overflow-hidden">
        <div className="primitive-card-bar border-line flex items-center justify-between border-b">
          <span className="text-ink inline-flex items-center gap-1.5 text-[13px] font-medium">
            <BookOpen size={13} /> ライブラリ
          </span>
          <span className="text-ink-3 text-[12px] tabular-nums">
            {skills?.length ?? "…"}
          </span>
        </div>
        <div className="flex flex-col">
          {skills === undefined && (
            <div className="px-3 py-3 text-[13px]">
              <Shimmer>スキルを読み込んでいます</Shimmer>
            </div>
          )}
          {skills?.length === 0 && (
            <div className="text-ink-3 px-3 py-3 text-[12.5px] leading-relaxed">
              まだスキルがありません。skills.sh の URL
              から取り込むか、手動で追加してください。
            </div>
          )}
          {(skills ?? []).map((skill) => (
            <SkillRow
              key={String(skill._id)}
              canEdit={isAdmin}
              description={skill.description}
              name={skill.name}
              skillId={skill._id}
              slug={skill.slug}
              sourceKind={skill.sourceKind}
            />
          ))}
        </div>
        {isAdmin && (
          <div className="border-line flex flex-wrap gap-1.5 border-t px-3 py-2.5">
            <Button
              type="button"
              size="xs"
              variant="accent"
              onClick={() => setImportOpen(true)}
            >
              <Plus size={12} /> skills.sh から取り込む
            </Button>
            <Button
              type="button"
              size="xs"
              variant="secondary"
              onClick={() => setSkillOpen(true)}
            >
              手動で追加
            </Button>
          </div>
        )}
      </section>

      <section className="rounded-card bg-surface shadow-card overflow-hidden">
        <div className="primitive-card-bar border-line flex items-center justify-between border-b">
          <span className="text-ink inline-flex items-center gap-1.5 text-[13px] font-medium">
            <Layers size={13} /> プロファイル
          </span>
          <span className="text-ink-3 text-[12px] tabular-nums">
            {profiles?.length ?? "…"}
          </span>
        </div>
        <div className="flex flex-col">
          {profiles === undefined && (
            <div className="px-3 py-3 text-[13px]">
              <Shimmer>プロファイルを読み込んでいます</Shimmer>
            </div>
          )}
          {profiles?.length === 0 && (
            <div className="text-ink-3 px-3 py-3 text-[12.5px] leading-relaxed">
              名前付きのスキル束です。チャットやプロジェクトに取り付けます。
            </div>
          )}
          {(profiles ?? []).map((profile) => (
            <ProfileRow
              key={String(profile._id)}
              canEdit={isAdmin}
              description={profile.description}
              name={profile.name}
              onEdit={() => {
                setEditingProfile(profile._id);
                setProfileOpen(true);
              }}
              profileId={profile._id}
              skillCount={profile.skillCount}
            />
          ))}
        </div>
        {isAdmin && (
          <div className="border-line border-t px-3 py-2.5">
            <Button
              type="button"
              size="xs"
              variant="accent"
              onClick={() => {
                setEditingProfile(undefined);
                setProfileOpen(true);
              }}
            >
              <Plus size={12} /> プロファイルを作成
            </Button>
          </div>
        )}
      </section>

      {!isAdmin && (
        <Notice
          tone="locked"
          title="ライブラリとプロファイルの編集は Admin 以上です"
        >
          メンバーは一覧の参照と、チャット /
          プロジェクトへの取り付けができます。
        </Notice>
      )}

      {(projects ?? []).length > 0 && <ProjectDefaults profiles={profiles} />}

      <CreateSkillDialog open={skillOpen} onOpenChange={setSkillOpen} />
      <ImportSkillDialog open={importOpen} onOpenChange={setImportOpen} />
      <ProfileEditorDialog
        open={profileOpen}
        onOpenChange={setProfileOpen}
        profileId={editingProfile}
      />
    </div>
  );
}

function ProjectDefaults({
  profiles,
}: {
  profiles:
    | {
        _id: Id<"skillProfiles">;
        name: string;
      }[]
    | undefined;
}) {
  const { projects } = useOrg();
  const setProfile = useSetProjectProfile();
  return (
    <section className="rounded-card bg-surface shadow-card overflow-hidden">
      <div className="primitive-card-bar border-line border-b">
        <span className="text-ink inline-flex items-center gap-1.5 text-[13px] font-medium">
          <Folder size={13} /> プロジェクトの既定プロファイル
        </span>
      </div>
      <div className="flex flex-col">
        {(projects ?? []).map((project) => (
          <div
            key={String(project._id)}
            className="border-line flex items-center gap-2 border-b px-3 py-2.5 last:border-0"
          >
            <div className="min-w-0 flex-1">
              <div className="text-ink truncate text-[13px] font-medium">
                {project.name}
              </div>
              <div className="text-ink-3 text-[12px]">
                新しいチャットに未指定なら引き継ぎます
              </div>
            </div>
            <select
              aria-label={`${project.name} の既定プロファイル`}
              className="rounded-control bg-field text-ink shadow-hairline h-8 max-w-[11rem] px-2 text-[12.5px] outline-none"
              value={project.profileId ? String(project.profileId) : ""}
              onChange={(event) => {
                const next = event.target.value;
                setProfile({
                  profileId: next ? (next as Id<"skillProfiles">) : null,
                  projectId: project._id,
                }).catch((error: unknown) => {
                  toast.error(
                    "プロジェクトのプロファイルを変更できませんでした",
                    {
                      description: errorSummary(error),
                    }
                  );
                });
              }}
            >
              <option value="">なし</option>
              {(profiles ?? []).map((profile) => (
                <option key={String(profile._id)} value={String(profile._id)}>
                  {profile.name}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>
    </section>
  );
}

function SkillRow({
  canEdit,
  description,
  name,
  skillId,
  slug,
  sourceKind,
}: {
  canEdit: boolean;
  description: string;
  name: string;
  skillId: Id<"librarySkills">;
  slug: string;
  sourceKind: "manual" | "url" | "skills_sh";
}) {
  const remove = useMutation(api.skills.remove);
  const sourceLabel =
    sourceKind === "skills_sh"
      ? "skills.sh"
      : sourceKind === "url"
        ? "URL"
        : "手動";
  return (
    <div className="border-line flex items-start gap-2 border-b px-3 py-2.5 last:border-0">
      <div className="min-w-0 flex-1">
        <div className="text-ink flex items-center gap-1.5 text-[13px] font-medium">
          <span className="truncate">{name}</span>
          <StatusPill tone="neutral">{sourceLabel}</StatusPill>
        </div>
        <div className="text-ink-3 font-mono text-[11.5px]">{slug}</div>
        {description && (
          <div className="text-ink-2 mt-0.5 line-clamp-2 text-[12px] leading-relaxed">
            {description}
          </div>
        )}
      </div>
      {canEdit && (
        <Button
          type="button"
          size="xs"
          variant="quiet"
          aria-label={`${name} を削除`}
          onClick={() => {
            remove({ skillId }).catch((error: unknown) => {
              toast.error("スキルを削除できませんでした", {
                description: errorSummary(error),
              });
            });
          }}
        >
          <Trash2 size={13} />
        </Button>
      )}
    </div>
  );
}

function ProfileRow({
  canEdit,
  description,
  name,
  onEdit,
  profileId,
  skillCount,
}: {
  canEdit: boolean;
  description?: string;
  name: string;
  onEdit: () => void;
  profileId: Id<"skillProfiles">;
  skillCount: number;
}) {
  const remove = useMutation(api.skillProfiles.remove);
  return (
    <div className="border-line flex items-start gap-2 border-b px-3 py-2.5 last:border-0">
      <button
        type="button"
        className="min-w-0 flex-1 text-left"
        onClick={canEdit ? onEdit : undefined}
      >
        <div className="text-ink text-[13px] font-medium">{name}</div>
        <div className="text-ink-3 text-[12px]">
          {skillCount} 件のスキル
          {description ? ` · ${description}` : ""}
        </div>
      </button>
      {canEdit && (
        <Button
          type="button"
          size="xs"
          variant="quiet"
          aria-label={`${name} を削除`}
          onClick={() => {
            remove({ profileId }).catch((error: unknown) => {
              toast.error("プロファイルを削除できませんでした", {
                description: errorSummary(error),
              });
            });
          }}
        >
          <Trash2 size={13} />
        </Button>
      )}
    </div>
  );
}

function CreateSkillDialog({
  onOpenChange,
  open,
}: {
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  const { org } = useOrg();
  const create = useMutation(api.skills.create);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setName("");
          setSlug("");
          setDescription("");
          setBody("");
        }
        onOpenChange(next);
      }}
      title="スキルを追加"
      description="SKILL.md の本文を保存します。ジョブ開始時にハーネス用ディレクトリへ書き出します。"
      footer={
        <>
          <span className="text-ink-3 text-[12px]">Admin 以上</span>
          <div className="flex gap-1.5">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => onOpenChange(false)}
            >
              キャンセル
            </Button>
            <Button
              type="submit"
              form="create-skill"
              size="sm"
              variant="accent"
              disabled={busy || name.trim().length < 1}
            >
              追加
            </Button>
          </div>
        </>
      }
    >
      <form
        id="create-skill"
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          setBusy(true);
          create({
            body,
            description: description || undefined,
            name,
            orgId: org._id,
            slug: slug || undefined,
          })
            .then(() => {
              toast.success("スキルを追加しました");
              onOpenChange(false);
            })
            .catch((error: unknown) => {
              toast.error("スキルを追加できませんでした", {
                description: errorSummary(error),
              });
            })
            .finally(() => setBusy(false));
        }}
      >
        <div>
          <Label htmlFor="skill-name">名前</Label>
          <Input
            id="skill-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={80}
            required
          />
        </div>
        <div>
          <Label htmlFor="skill-slug" hint="空なら名前から生成">
            スラッグ
          </Label>
          <Input
            id="skill-slug"
            value={slug}
            onChange={(event) => setSlug(event.target.value)}
            maxLength={64}
            placeholder="code-review"
          />
        </div>
        <div>
          <Label htmlFor="skill-desc">説明</Label>
          <Input
            id="skill-desc"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            maxLength={400}
          />
        </div>
        <div>
          <Label htmlFor="skill-body">SKILL.md</Label>
          <Textarea
            id="skill-body"
            value={body}
            onChange={(event) => setBody(event.target.value)}
            rows={8}
            placeholder={"---\nname: example\ndescription: …\n---\n\n手順…"}
          />
        </div>
      </form>
    </Dialog>
  );
}

function ImportSkillDialog({
  onOpenChange,
  open,
}: {
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  const { org } = useOrg();
  const importFromUrl = useAction(api.skillImport.importFromUrl);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setUrl("");
        }
        onOpenChange(next);
      }}
      title="skills.sh から取り込む"
      description="https://skills.sh/owner/repo/skill、owner/repo/skill、または raw の SKILL.md URL を指定します。"
      footer={
        <>
          <span className="text-ink-3 text-[12px]">外部取得は Action</span>
          <div className="flex gap-1.5">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => onOpenChange(false)}
            >
              キャンセル
            </Button>
            <Button
              type="submit"
              form="import-skill"
              size="sm"
              variant="accent"
              disabled={busy || url.trim().length < 1}
            >
              取り込む
            </Button>
          </div>
        </>
      }
    >
      <form
        id="import-skill"
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          setBusy(true);
          importFromUrl({ orgId: org._id, url: url.trim() })
            .then((result) => {
              toast.success(`「${result.slug}」を取り込みました`);
              onOpenChange(false);
            })
            .catch((error: unknown) => {
              toast.error("取り込みに失敗しました", {
                description: errorSummary(error),
              });
            })
            .finally(() => setBusy(false));
        }}
      >
        <div>
          <Label htmlFor="skill-url">URL または owner/repo/skill</Label>
          <Input
            id="skill-url"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://skills.sh/vercel-labs/agent-skills/…"
          />
        </div>
      </form>
    </Dialog>
  );
}

function ProfileEditorDialog({
  onOpenChange,
  open,
  profileId,
}: {
  onOpenChange: (open: boolean) => void;
  open: boolean;
  profileId?: Id<"skillProfiles">;
}) {
  const { org } = useOrg();
  const skills = useQuery(api.skills.listLibrary, { orgId: org._id });
  const existing = useQuery(
    api.skillProfiles.get,
    profileId ? { profileId } : "skip"
  );
  const create = useMutation(api.skillProfiles.create);
  const update = useMutation(api.skillProfiles.update);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selected, setSelected] = useState<Id<"librarySkills">[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }
    if (existing) {
      setName(existing.name);
      setDescription(existing.description ?? "");
      setSelected(existing.skillIds);
      return;
    }
    if (!profileId) {
      setName("");
      setDescription("");
      setSelected([]);
    }
  }, [existing, open, profileId]);

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={profileId ? "プロファイルを編集" : "プロファイルを作成"}
      description="チャットに取り付けるスキルの束です。本文は同期先の CLI が必要になったときだけ読みます。"
      footer={
        <>
          <span className="text-ink-3 text-[12px]">
            {selected.length} 件選択
          </span>
          <div className="flex gap-1.5">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => onOpenChange(false)}
            >
              キャンセル
            </Button>
            <Button
              type="submit"
              form="edit-profile"
              size="sm"
              variant="accent"
              disabled={busy || name.trim().length < 1}
            >
              保存
            </Button>
          </div>
        </>
      }
    >
      <form
        id="edit-profile"
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          setBusy(true);
          const done = profileId
            ? update({
                description,
                name,
                profileId,
                skillIds: selected,
              })
            : create({
                description,
                name,
                orgId: org._id,
                skillIds: selected,
              });
          done
            .then(() => {
              toast.success("プロファイルを保存しました");
              onOpenChange(false);
            })
            .catch((error: unknown) => {
              toast.error("プロファイルを保存できませんでした", {
                description: errorSummary(error),
              });
            })
            .finally(() => setBusy(false));
        }}
      >
        <div>
          <Label htmlFor="profile-name">名前</Label>
          <Input
            id="profile-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={80}
            required
          />
        </div>
        <div>
          <Label htmlFor="profile-desc">説明</Label>
          <Input
            id="profile-desc"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            maxLength={400}
          />
        </div>
        <div>
          <div className="text-ink-2 mb-1.5 text-[12.5px] font-medium">
            含めるスキル
          </div>
          <div className="flex flex-col gap-1">
            {(skills ?? []).map((skill) => {
              const on = selected.some(
                (id) => String(id) === String(skill._id)
              );
              const inputId = `profile-skill-${String(skill._id)}`;
              return (
                <div
                  key={String(skill._id)}
                  className="rounded-control flex items-start gap-2 px-1.5 py-1.5 text-[13px]"
                >
                  <input
                    id={inputId}
                    type="checkbox"
                    checked={on}
                    onChange={() => {
                      setSelected((current) =>
                        on
                          ? current.filter(
                              (id) => String(id) !== String(skill._id)
                            )
                          : [...current, skill._id]
                      );
                    }}
                  />
                  <label htmlFor={inputId}>
                    <span className="text-ink block">{skill.name}</span>
                    <span className="text-ink-3 block text-[12px]">
                      {skill.slug}
                    </span>
                  </label>
                </div>
              );
            })}
            {skills?.length === 0 && (
              <p className="text-ink-3 text-[12px]">
                先にライブラリへスキルを追加してください。
              </p>
            )}
          </div>
        </div>
      </form>
    </Dialog>
  );
}
