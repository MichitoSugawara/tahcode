import { formatScreenAge } from "@shared/workbenchScreen.ts";

export function ScreenFrame({
  capturedAt,
  error,
  frameUrl,
  now,
  stale,
}: {
  capturedAt?: number;
  error?: string;
  frameUrl: string;
  now: number;
  stale: boolean;
}) {
  const age =
    capturedAt === undefined ? null : formatScreenAge(capturedAt, now);
  return (
    <div
      data-workbench-screen-frame
      data-stale={stale ? "true" : "false"}
      className="flex min-h-0 flex-1 flex-col bg-black"
    >
      <img
        alt="接続中マシンの画面フレーム"
        src={frameUrl}
        className="min-h-0 w-full flex-1 object-contain"
      />
      <div className="text-ink-3 flex shrink-0 items-center justify-between gap-2 px-3 py-1.5 text-[11px]">
        <span>
          {stale
            ? "更新が止まっています"
            : age
              ? `最終フレーム ${age}`
              : "フレーム"}
        </span>
        {error ? <span className="text-orange truncate">{error}</span> : null}
      </div>
    </div>
  );
}
