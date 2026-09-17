import type {
  ScreenControlMode,
  ScreenInputEvent,
} from "@shared/workbenchScreen.ts";

import { AgentScreenCanvas } from "./AgentScreenCanvas";

export { AgentScreenConnecting } from "./AgentScreenConnecting";

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

export function ScreenLive({
  control = "view",
  error,
  now,
  onInput,
  onPlaying,
  stream,
}: {
  control?: ScreenControlMode;
  error?: string;
  now: number;
  onInput?: (event: ScreenInputEvent) => void;
  onPlaying?: () => void;
  stream: MediaStream;
}) {
  return (
    <AgentScreenCanvas
      control={control}
      error={error}
      now={now}
      onInput={onInput}
      onPlaying={onPlaying}
      stale={false}
      stream={stream}
      transport="webrtc"
    />
  );
}
