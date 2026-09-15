import * as Popover from "@radix-ui/react-popover";
import {
  SUGGESTED_COMPOSER_BRANCHES,
  evaluateComposerBranchApply,
  isComposerRuntimeSelectable,
  needsProjectFolderMapping,
  normalizeComposerBranch,
} from "@shared/composerContext.ts";
import type { ComposerBranchApplyFailure } from "@shared/composerContext.ts";
import { hasUsableOnlineRuntime } from "@shared/runtimeHealth.ts";
import { Check, Cpu, Folder, GitBranch, Monitor, Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { toast } from "sonner";

import { Button } from "@/components/atoms/Button";
import GlideMenu from "@/components/primitives/GlideMenu";
import { isLive, useOrg } from "@/harness/OrgContext";
import type { Chat, Project, Runtime } from "@/harness/OrgContext";
import { Notice } from "@/harness/ui/Notice";
import { registerRuntimeCtaLabel } from "@/lib/desktop";

import type { Id } from "../../convex/_generated/dataModel";

export function effectiveComposerProject(
  chat: Chat | null,
  projects: Project[] | undefined,
  composerProjectId: Id<"projects"> | null
): Project | null {
  const projectId = chat?.projectId ?? composerProjectId;
  if (!projectId) {
    return null;
  }
  return projects?.find((project) => project._id === projectId) ?? null;
}

export function effectiveComposerRuntime(
  runtimes: Runtime[] | undefined,
  runtimeId: Id<"runtimes"> | null,
  now: number
): Runtime | null {
  if (runtimeId) {
    return runtimes?.find((runtime) => runtime._id === runtimeId) ?? null;
  }
  const live = (runtimes ?? []).filter(
    (runtime) => runtime.canUse && isLive(runtime, now)
  );
  return live.length === 1 ? (live[0] ?? null) : null;
}

export function useComposerBranchApply(chat: Chat | null) {
  const org = useOrg();
  const [error, setError] = useState<{
    attempted: string;
    failure: ComposerBranchApplyFailure;
  } | null>(null);
  const project = effectiveComposerProject(
    chat,
    org.projects,
    org.composerProjectId
  );

  const applyBranch = (raw: string): boolean => {
    const runtime = effectiveComposerRuntime(
      org.runtimes,
      org.runtimeId,
      org.now
    );
    const selected = org.runtimeId
      ? (org.runtimes ?? []).find((item) => item._id === org.runtimeId)
      : undefined;
    const result = evaluateComposerBranchApply({
      confirmedBranch: org.composerBranch,
      folderBlocked: needsProjectFolderMapping({
        folders: (project?.folders ?? []).map((folder) => ({
          cwd: folder.cwd,
          runtimeId: String(folder.runtimeId),
        })),
        hasProject: project !== null,
        projectCwd: project?.cwd,
        runtimeId: runtime ? String(runtime._id) : org.runtimeId,
      }),
      hasUsableOnline: hasUsableOnlineRuntime(org.runtimes ?? [], org.now),
      nextBranch: raw,
      runtimesReady: org.runtimes !== undefined,
      selectedRuntimeUsable: org.runtimeId
        ? isComposerRuntimeSelectable({
            canUse: selected?.canUse,
            live: selected ? isLive(selected, org.now) : false,
          })
        : null,
    });
    if (!result.ok) {
      setError({ attempted: raw, failure: result.failure });
      toast.error(result.failure.message);
      return false;
    }
    if (!result.unchanged) {
      org.setComposerBranch(result.branch);
    }
    setError(null);
    return true;
  };

  return { applyBranch, error, project, setError };
}

export function ComposerContextBar({
  applyBranch,
  chat,
  tall = false,
}: {
  applyBranch: (raw: string) => boolean;
  chat: Chat | null;
  tall?: boolean;
}) {
  const org = useOrg();
  const { composerProjectId, setComposerProjectId } = org;
  useEffect(() => {
    if (chat?.projectId && chat.projectId !== composerProjectId) {
      setComposerProjectId(chat.projectId);
    }
  }, [chat?.projectId, composerProjectId, setComposerProjectId]);
  const project = effectiveComposerProject(
    chat,
    org.projects,
    org.composerProjectId
  );
  const projectLockedToChat = Boolean(chat?.projectId);

  const selectProject = (projectId: Id<"projects"> | null) => {
    org.setComposerProjectId(projectId);
    if (!projectId) {
      return;
    }
    if (chat?.projectId && chat.projectId === projectId) {
      return;
    }
    const existing = (org.chats ?? []).find(
      (item) => item.kind === "project" && item.projectId === projectId
    );
    if (existing) {
      org.goChat(existing._id);
    }
  };

  return (
    <div
      data-composer-context-bar
      className={`bg-inset text-ink-2 flex min-h-9 w-full items-center gap-0.5 px-3 py-1.5 ${
        tall ? "rounded-t-[22px]" : "rounded-t-[14px]"
      }`}
    >
      <ContextMenu
        ariaLabel="プロジェクトを選択"
        icon={<Folder size={14} />}
        label={project?.name ?? "プロジェクトなし"}
      >
        {(close) => (
          <>
            {!projectLockedToChat && (
              <ContextRow
                label="プロジェクトなし"
                selected={!project}
                onSelect={() => {
                  selectProject(null);
                  close();
                }}
              />
            )}
            {(org.projects ?? []).map((item) => (
              <ContextRow
                key={String(item._id)}
                label={item.name}
                selected={project?._id === item._id}
                onSelect={() => {
                  selectProject(item._id);
                  close();
                }}
              />
            ))}
            <ContextRow
              icon={<Plus size={13} />}
              label="新しいプロジェクト"
              selected={false}
              onSelect={() => {
                org.openDialog({ kind: "createProject" });
                close();
              }}
            />
          </>
        )}
      </ContextMenu>
      <ContextMenu
        ariaLabel="マシンを選択"
        icon={<Monitor size={14} />}
        label={
          org.runtimeId
            ? (org.runtimes?.find((item) => item._id === org.runtimeId)?.name ??
              "指定中")
            : "自動"
        }
      >
        {(close) => (
          <>
            <ContextRow
              label="自動"
              tag={
                (org.runtimes ?? []).some(
                  (item) => item.canUse && isLive(item, org.now)
                )
                  ? "オンライン優先"
                  : "オフライン"
              }
              selected={!org.runtimeId}
              onSelect={() => {
                org.setRuntimeId(null);
                close();
              }}
            />
            {(org.runtimes ?? []).map((item) => {
              const live = isLive(item, org.now);
              const selectable = isComposerRuntimeSelectable({
                canUse: item.canUse,
                live,
              });
              return (
                <ContextRow
                  key={String(item._id)}
                  disabled={!selectable}
                  label={item.name}
                  tag={
                    item.canUse
                      ? live
                        ? "オンライン"
                        : "オフライン"
                      : "許可なし"
                  }
                  selected={org.runtimeId === item._id}
                  onSelect={() => {
                    if (!selectable) {
                      return;
                    }
                    org.setRuntimeId(item._id);
                    close();
                  }}
                />
              );
            })}
          </>
        )}
      </ContextMenu>
      <BranchMenu applyBranch={applyBranch} />
    </div>
  );
}

export function ComposerFolderNotice({ chat }: { chat: Chat | null }) {
  const org = useOrg();
  const project = effectiveComposerProject(
    chat,
    org.projects,
    org.composerProjectId
  );
  const runtime = effectiveComposerRuntime(
    org.runtimes,
    org.runtimeId,
    org.now
  );
  const folders = project?.folders ?? [];
  const needsFolder = needsProjectFolderMapping({
    folders: folders.map((folder) => ({
      cwd: folder.cwd,
      runtimeId: String(folder.runtimeId),
    })),
    hasProject: project !== null,
    projectCwd: project?.cwd,
    runtimeId: runtime ? String(runtime._id) : null,
  });
  if (!needsFolder || !project || !runtime) {
    return null;
  }
  return (
    <Notice
      tone="warn"
      title="このマシンのフォルダが未設定です"
      className="py-2"
      action={
        <Button
          type="button"
          size="xs"
          variant="accent"
          onClick={() =>
            org.openDialog({
              kind: "mapProjectFolder",
              projectId: project._id,
              runtimeId: runtime._id,
            })
          }
        >
          <Folder size={12} /> フォルダを指定
        </Button>
      }
    >
      「{project.name}」を「{runtime.name}
      」で動かすには作業ディレクトリが必要です。指定するまで送信できません。
    </Notice>
  );
}

export function ComposerBranchNotice({
  applyBranch,
  chat,
  error,
  onDismiss,
}: {
  applyBranch: (raw: string) => boolean;
  chat: Chat | null;
  error: { attempted: string; failure: ComposerBranchApplyFailure } | null;
  onDismiss: () => void;
}) {
  const org = useOrg();
  const project = effectiveComposerProject(
    chat,
    org.projects,
    org.composerProjectId
  );
  const runtime = effectiveComposerRuntime(
    org.runtimes,
    org.runtimeId,
    org.now
  );
  if (!error) {
    return null;
  }
  const { ctas, message } = error.failure;
  return (
    <Notice
      tone="warn"
      title="ブランチを切り替えられませんでした"
      className="py-2"
      action={
        <>
          {ctas.includes("retry") && (
            <Button
              type="button"
              size="xs"
              variant="accent"
              onClick={() => applyBranch(error.attempted)}
            >
              再試行
            </Button>
          )}
          {ctas.includes("mapFolder") && project && runtime && (
            <Button
              type="button"
              size="xs"
              variant="secondary"
              onClick={() =>
                org.openDialog({
                  kind: "mapProjectFolder",
                  projectId: project._id,
                  runtimeId: runtime._id,
                })
              }
            >
              <Folder size={12} /> フォルダを指定
            </Button>
          )}
          {ctas.includes("pickMachine") &&
            (hasUsableOnlineRuntime(org.runtimes ?? [], org.now) ? (
              <Button
                type="button"
                size="xs"
                variant="secondary"
                onClick={() => org.goSettings("runtimes")}
              >
                <Monitor size={12} /> 別のマシンを選ぶ
              </Button>
            ) : (
              <>
                <Button
                  type="button"
                  size="xs"
                  variant="secondary"
                  onClick={() => org.openDialog({ kind: "registerRuntime" })}
                >
                  <Cpu size={12} /> {registerRuntimeCtaLabel()}
                </Button>
                <Button
                  type="button"
                  size="xs"
                  variant="secondary"
                  onClick={() => org.goSettings("runtimes")}
                >
                  設定で確認
                </Button>
              </>
            ))}
          <Button type="button" size="xs" variant="ghost" onClick={onDismiss}>
            閉じる
          </Button>
        </>
      }
    >
      <div data-composer-branch-error>{message}</div>
    </Notice>
  );
}

function BranchMenu({
  applyBranch,
}: {
  applyBranch: (raw: string) => boolean;
}) {
  const org = useOrg();
  const [custom, setCustom] = useState("");
  const confirmed = normalizeComposerBranch(org.composerBranch);
  const options = useMemo(() => {
    const names = new Set<string>(SUGGESTED_COMPOSER_BRANCHES);
    names.add(confirmed);
    return [...names];
  }, [confirmed]);

  return (
    <ContextMenu
      ariaLabel="ブランチを選択"
      icon={<GitBranch size={14} />}
      label={confirmed}
    >
      {(close) => (
        <>
          {options.map((name) => (
            <ContextRow
              key={name}
              label={name}
              selected={confirmed === name}
              onSelect={() => {
                applyBranch(name);
                close();
              }}
            />
          ))}
          <form
            className="px-1.5 pt-1 pb-1"
            onSubmit={(event) => {
              event.preventDefault();
              const accepted = applyBranch(custom);
              if (accepted) {
                setCustom("");
              }
              close();
            }}
          >
            <input
              value={custom}
              onChange={(event) => setCustom(event.target.value)}
              placeholder="ブランチ名を入力"
              aria-label="ブランチ名を入力"
              className="rounded-control bg-field text-ink shadow-hairline placeholder:text-ink-3 h-7 w-full px-2 font-mono text-[12px] outline-none"
            />
          </form>
        </>
      )}
    </ContextMenu>
  );
}

function ContextMenu({
  ariaLabel,
  icon,
  label,
  children,
}: {
  ariaLabel: string;
  icon: ReactNode;
  label: string;
  children: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label={ariaLabel}
          aria-expanded={open}
          className="text-ink hover:bg-hover flex min-w-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-left text-[12.5px] transition-colors duration-100"
        >
          <span className="text-ink-2 flex shrink-0">{icon}</span>
          <span className="min-w-0 truncate font-medium">{label}</span>
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={6}
          className="bg-surface shadow-raised z-[80] min-w-52 rounded-[10px] p-1 outline-none"
          style={{
            animation: "pop-in 180ms cubic-bezier(0.23,1,0.32,1) both",
          }}
        >
          <GlideMenu
            className="flex max-h-64 flex-col gap-px overflow-y-auto"
            highlightClassName="inset-x-0 rounded-[6px] bg-hover"
          >
            {children(() => setOpen(false))}
          </GlideMenu>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

function ContextRow({
  disabled,
  icon,
  label,
  onSelect,
  selected,
  tag,
}: {
  disabled?: boolean;
  icon?: ReactNode;
  label: string;
  onSelect: () => void;
  selected: boolean;
  tag?: string;
}) {
  return (
    <button
      type="button"
      data-menu-row
      disabled={disabled}
      onClick={onSelect}
      className="relative z-10 flex w-full items-center gap-2 rounded-[6px] px-2 py-1.5 text-left disabled:opacity-45"
    >
      {icon && <span className="text-ink-3 flex shrink-0">{icon}</span>}
      <span className="text-ink min-w-0 flex-1 truncate text-[12.5px] font-medium">
        {label}
      </span>
      {tag && <span className="text-ink-3 shrink-0 text-[11px]">{tag}</span>}
      <span className={`text-ink shrink-0 ${selected ? "" : "invisible"}`}>
        <Check size={13} strokeWidth={2.5} />
      </span>
    </button>
  );
}
