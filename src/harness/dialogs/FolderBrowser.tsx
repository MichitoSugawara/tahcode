import {
  filterBrowseEntries,
  sameDesktopHost,
} from "@shared/filesystemBrowse.ts";
import type { FsBrowseResult } from "@shared/filesystemBrowse.ts";
import { useMutation, useQuery } from "convex/react";
import {
  ArrowUp,
  Check,
  ChevronRight,
  Folder,
  Home,
  LoaderCircle,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/atoms/Button";
import { isLive } from "@/harness/OrgContext";
import type { Runtime } from "@/harness/OrgContext";
import { Input } from "@/harness/ui/Field";
import { browseDesktopFolder, hasDesktopFolderBrowse } from "@/lib/desktop";
import { folderPickForRuntime } from "@/lib/folderPick";
import { cn } from "@/lib/utils";

import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

export function FolderBrowser({
  desktopHost,
  initialPath,
  now,
  onCancel,
  onSelect,
  runtime,
}: {
  desktopHost: string | null;
  initialPath?: string;
  now: number;
  onCancel: () => void;
  onSelect: (path: string, gitRemoteUrl?: string) => void;
  runtime: Runtime;
}) {
  const request = useMutation(api.runtimeFs.request);
  const [path, setPath] = useState(initialPath?.trim() ?? "");
  const [query, setQuery] = useState("");
  const [requestId, setRequestId] = useState<Id<"runtimeFsRequests"> | null>(
    null
  );
  const [local, setLocal] = useState<FsBrowseResult | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [localBusy, setLocalBusy] = useState(false);
  const [selected, setSelected] = useState(0);
  const remote = useQuery(
    api.runtimeFs.get,
    requestId ? { requestId } : "skip"
  );
  const useDesktop =
    sameDesktopHost(runtime.hostname, desktopHost) && hasDesktopFolderBrowse();
  const pick = folderPickForRuntime({
    desktopHost,
    live: isLive(runtime, now),
    runtime,
  });

  useEffect(() => {
    setQuery("");
    setSelected(0);
    if (useDesktop) {
      setLocalBusy(true);
      setLocalError(null);
      void browseDesktopFolder(path || undefined).then((result) => {
        setLocalBusy(false);
        if (!result) {
          setLocalError("このデスクトップではフォルダを辿れません");
          return;
        }
        if (!result.ok) {
          setLocalError(result.error);
          setLocal(null);
          return;
        }
        setLocal({
          entries: result.entries,
          gitRemoteUrl: result.gitRemoteUrl,
          homePath: result.homePath,
          parentPath: result.parentPath,
          path: result.path,
        });
      });
      return;
    }
    setLocal(null);
    void request({ path, runtimeId: runtime._id })
      .then(setRequestId)
      .catch((error: unknown) => {
        setLocalError(
          error instanceof Error ? error.message : "フォルダを開けませんでした"
        );
      });
  }, [path, request, runtime._id, useDesktop]);

  const result = local ?? (remote?.status === "done" ? remote.result : null);
  const error =
    localError ??
    (remote?.status === "failed" ? (remote.error ?? "読めませんでした") : null);
  const loading =
    !result &&
    !error &&
    (useDesktop
      ? localBusy
      : remote === undefined || remote?.status !== "done");
  const entries = useMemo(
    () => filterBrowseEntries(result?.entries ?? [], query),
    [query, result?.entries]
  );

  useEffect(() => {
    setSelected(0);
  }, [entries.length, query]);

  return (
    <div className="flex flex-col gap-3" data-folder-browser>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          size="xs"
          variant="secondary"
          disabled={!result?.parentPath}
          onClick={() => result?.parentPath && setPath(result.parentPath)}
          aria-label="親フォルダへ"
        >
          <ArrowUp size={13} />
        </Button>
        <Button
          type="button"
          size="xs"
          variant="secondary"
          onClick={() => setPath("")}
          aria-label="ホーム"
        >
          <Home size={13} />
        </Button>
        <div className="text-ink min-w-0 flex-1 truncate font-mono text-[12px]">
          {result?.path || (path.length > 0 ? path : "ホーム")}
        </div>
      </div>
      <Input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="フォルダ名で絞り込み"
        aria-label="フォルダを検索"
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setSelected((current) => Math.min(entries.length - 1, current + 1));
          }
          if (event.key === "ArrowUp") {
            event.preventDefault();
            setSelected((current) => Math.max(0, current - 1));
          }
          if (event.key === "Enter") {
            const entry = entries[selected];
            if (entry) {
              event.preventDefault();
              setPath(entry.path);
            }
          }
          if (
            event.key === "Backspace" &&
            query.length < 1 &&
            result?.parentPath
          ) {
            event.preventDefault();
            setPath(result.parentPath);
          }
        }}
      />
      <div
        className="rounded-card bg-inset shadow-hairline max-h-64 overflow-y-auto"
        role="listbox"
        aria-label="フォルダ一覧"
      >
        {loading && (
          <div className="text-ink-3 flex items-center gap-2 px-3 py-6 text-[12.5px]">
            <LoaderCircle size={14} className="animate-spin" />
            {runtime.name} のフォルダを読み込み中…
          </div>
        )}
        {error && !loading && (
          <p className="text-red px-3 py-4 text-[12.5px] leading-relaxed">
            {error}
          </p>
        )}
        {result && !loading && entries.length === 0 && (
          <p className="text-ink-3 px-3 py-4 text-[12.5px] leading-relaxed">
            {query.trim()
              ? "一致するフォルダがありません"
              : "このフォルダにはサブフォルダがありません"}
          </p>
        )}
        {entries.map((entry, index) => (
          <button
            key={entry.path}
            type="button"
            role="option"
            aria-selected={index === selected}
            onClick={() => setPath(entry.path)}
            onMouseEnter={() => setSelected(index)}
            className={cn(
              "flex w-full items-center gap-2 px-3 py-2 text-left text-[13px]",
              index === selected ? "bg-hover text-ink" : "text-ink-2"
            )}
          >
            <Folder size={14} className="shrink-0" />
            <span className="min-w-0 flex-1 truncate">{entry.name}</span>
            <ChevronRight size={13} className="text-ink-3 shrink-0" />
          </button>
        ))}
      </div>
      {pick.reason === "oldBridge" && (
        <p className="text-ink-3 text-[12px] leading-relaxed">
          このマシンの CLI を更新すると、フォルダを辿って選べます。
        </p>
      )}
      <div className="flex items-center justify-end gap-1.5">
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          戻る
        </Button>
        <Button
          type="button"
          size="sm"
          variant="accent"
          disabled={!result}
          onClick={() => {
            if (!result) {
              return;
            }
            onSelect(result.path, result.gitRemoteUrl);
          }}
        >
          <Check size={13} />
          このフォルダを使う
        </Button>
      </div>
    </div>
  );
}
