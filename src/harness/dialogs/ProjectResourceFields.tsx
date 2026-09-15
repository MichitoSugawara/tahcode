import { folderPickHint } from "@shared/filesystemBrowse.ts";
import { Folder, Github, Monitor, X } from "lucide-react";

import { Button } from "@/components/atoms/Button";
import { StatusPill } from "@/components/atoms/StatusPill";
import { isLive } from "@/harness/OrgContext";
import type { Runtime } from "@/harness/OrgContext";
import { Input, Label } from "@/harness/ui/Field";
import { Notice } from "@/harness/ui/Notice";
import { folderPickForRuntime } from "@/lib/folderPick";

export function GithubRepoField({
  id,
  onChange,
  onDismissSuggestion,
  suggestedRepo,
  value,
}: {
  id: string;
  onChange: (value: string) => void;
  onDismissSuggestion?: () => void;
  suggestedRepo?: string | null;
  value: string;
}) {
  const showSuggestion =
    Boolean(suggestedRepo) && suggestedRepo !== value.trim();
  return (
    <section data-project-repo-section className="flex flex-col gap-2">
      <Label htmlFor={id} hint="任意 · 最初は空で大丈夫">
        GitHub リポジトリ
      </Label>
      <div className="relative">
        <Github
          size={14}
          aria-hidden
          className="text-ink-3 pointer-events-none absolute top-1/2 left-3 -translate-y-1/2"
        />
        <Input
          id={id}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="https://github.com/acme/web"
          inputMode="url"
          className="pl-9"
        />
      </div>
      {showSuggestion && suggestedRepo && (
        <Notice
          tone="info"
          title="フォルダから GitHub リポジトリを検出しました"
          action={
            <>
              <Button
                type="button"
                size="xs"
                variant="accent"
                onClick={() => onChange(suggestedRepo)}
              >
                {suggestedRepo} を使う
              </Button>
              {onDismissSuggestion && (
                <Button
                  type="button"
                  size="xs"
                  variant="ghost"
                  onClick={onDismissSuggestion}
                >
                  無視
                </Button>
              )}
            </>
          }
        >
          自動では埋めません。使う場合だけ適用してください。
        </Notice>
      )}
    </section>
  );
}

export function MachineFolderFields({
  desktopHost,
  folders,
  now,
  onClear,
  onPick,
  runtimes,
}: {
  desktopHost: string | null;
  folders: Record<string, string>;
  now: number;
  onClear: (runtimeId: string) => void;
  onPick: (runtime: Runtime) => void;
  runtimes: Runtime[] | undefined;
}) {
  const machines = [...(runtimes ?? [])].sort((left, right) => {
    const liveDelta = Number(isLive(right, now)) - Number(isLive(left, now));
    if (liveDelta !== 0) {
      return liveDelta;
    }
    return left.name.localeCompare(right.name, "ja");
  });

  return (
    <section data-project-machine-folders className="flex flex-col gap-2">
      <Label hint="任意 · マシンごとに別のフォルダ">マシン別フォルダ</Label>
      {machines.length === 0 ? (
        <p className="text-ink-3 text-[12.5px] leading-relaxed">
          組織にマシンがまだありません。あとから設定できます。フォルダもリポジトリも空のまま作れます。
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {machines.map((runtime) => {
            const id = String(runtime._id);
            const cwd = folders[id]?.trim() ?? "";
            const live = isLive(runtime, now);
            const pick = folderPickForRuntime({
              desktopHost,
              live,
              runtime,
            });
            const canPick = pick.mode !== "unavailable";
            return (
              <div
                key={id}
                data-machine-folder-row={id}
                className="rounded-card bg-inset shadow-hairline flex flex-col gap-2 px-3 py-2.5"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-ink flex items-center gap-1.5 text-[13px] font-medium">
                      <Monitor size={13} className="text-ink-3 shrink-0" />
                      <span className="truncate">{runtime.name}</span>
                    </div>
                    <p className="text-ink-3 mt-0.5 font-mono text-[11.5px] break-all">
                      {cwd.length > 0 ? cwd : "未設定"}
                    </p>
                  </div>
                  <StatusPill
                    tone={live ? "green" : "neutral"}
                    className="shrink-0"
                  >
                    {live ? "オンライン" : "オフライン"}
                  </StatusPill>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <Button
                    type="button"
                    size="xs"
                    variant="secondary"
                    disabled={!canPick}
                    title={folderPickHint(pick.reason)}
                    onClick={() => onPick(runtime)}
                  >
                    <Folder size={12} />
                    フォルダを選ぶ
                  </Button>
                  {cwd.length > 0 && (
                    <Button
                      type="button"
                      size="xs"
                      variant="ghost"
                      onClick={() => onClear(id)}
                    >
                      <X size={12} />
                      クリア
                    </Button>
                  )}
                  {!canPick && (
                    <span className="text-ink-3 text-[11.5px]">
                      {folderPickHint(pick.reason)}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
