import type {
  ScreenControlMode,
  ScreenInputEvent,
} from "@shared/workbenchScreen.ts";

import { AgentScreenCanvas } from "./AgentScreenCanvas";

export function ScreenFrame({
  capturedAt,
  control = "view",
  error,
  frameUrl,
  now,
  onInput,
  stale,
}: {
  capturedAt?: number;
  control?: ScreenControlMode;
  error?: string;
  frameUrl: string;
  now: number;
  onInput?: (event: ScreenInputEvent) => void;
  stale: boolean;
}) {
  return (
    <AgentScreenCanvas
      capturedAt={capturedAt}
      control={control}
      error={error}
      frameUrl={frameUrl}
      now={now}
      onInput={onInput}
      stale={stale}
    />
  );
}

export function AgentScreenConnecting() {
  return (
    <div
      data-workbench-agent-connecting
      className="relative min-h-0 flex-1 overflow-hidden rounded-[8px] bg-black"
    >
      <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
        <svg width={26} height={26} className="block animate-spin" aria-hidden>
          <circle
            cx={13}
            cy={13}
            r={12}
            fill="none"
            stroke="rgba(255,255,255,0.18)"
            strokeWidth={2}
          />
          <circle
            cx={13}
            cy={13}
            r={12}
            fill="none"
            stroke="#fff"
            strokeWidth={2}
            strokeLinecap="round"
            strokeDasharray={`${0.28 * 2 * Math.PI * 12} ${0.72 * 2 * Math.PI * 12}`}
          />
        </svg>
      </span>
      <span
        className="absolute inset-x-0 text-center text-[12.5px] font-medium text-white/70"
        style={{ top: "calc(50% + 28px)" }}
      >
        マシン画面に接続しています
      </span>
    </div>
  );
}
