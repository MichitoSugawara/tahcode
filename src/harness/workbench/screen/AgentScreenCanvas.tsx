import {
  formatScreenAge,
  screenPointFromClient,
} from "@shared/workbenchScreen.ts";
import type {
  ScreenControlMode,
  ScreenInputEvent,
} from "@shared/workbenchScreen.ts";
import { useCallback, useEffect, useRef, useState } from "react";
import type { PointerEvent, WheelEvent } from "react";

const MOVE_THROTTLE_MS = 40;
const BROWSER_CHORDS = new Set(["l", "n", "r", "t", "w"]);

function AgentCursor({ x, y }: { x: number; y: number }) {
  return (
    <svg
      aria-hidden
      className="pointer-events-none absolute z-10"
      style={{
        filter: "drop-shadow(0 1px 1.5px rgba(0,0,0,0.35))",
        left: x,
        top: y,
      }}
      width="16"
      height="20"
      viewBox="0 0 16 20"
    >
      <path
        d="M1 1.2 1 16.4 5.2 12.6 8.4 19 10.6 18 7.5 11.7 13.2 11.2 1 1.2Z"
        fill="white"
        stroke="black"
        strokeWidth="0.8"
      />
    </svg>
  );
}

export function AgentScreenCanvas({
  capturedAt,
  control,
  error,
  frameUrl,
  now,
  onInput,
  onPlaying,
  stale,
  stream,
  transport = "jpeg",
}: {
  capturedAt?: number;
  control: ScreenControlMode;
  error?: string;
  frameUrl?: string;
  now: number;
  onInput?: (event: ScreenInputEvent) => void;
  onPlaying?: () => void;
  stale: boolean;
  stream?: MediaStream;
  transport?: "jpeg" | "webrtc";
}) {
  const frameRef = useRef<HTMLImageElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const lastMove = useRef(0);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const [focused, setFocused] = useState(false);
  const interactive = control === "control" && onInput !== undefined;
  const live = transport === "webrtc";
  const age =
    capturedAt === undefined ? null : formatScreenAge(capturedAt, now);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !stream) {
      return;
    }
    video.srcObject = stream;
    return () => {
      video.srcObject = null;
    };
  }, [stream]);

  const pointFromEvent = useCallback(
    (event: { clientX: number; clientY: number }) => {
      const media = live ? videoRef.current : frameRef.current;
      if (!media) {
        return null;
      }
      const rect = media.getBoundingClientRect();
      const naturalWidth = live
        ? (videoRef.current?.videoWidth ?? 0)
        : (frameRef.current?.naturalWidth ?? 0);
      const naturalHeight = live
        ? (videoRef.current?.videoHeight ?? 0)
        : (frameRef.current?.naturalHeight ?? 0);
      return screenPointFromClient({
        clientX: event.clientX,
        clientY: event.clientY,
        height: rect.height,
        left: rect.left,
        naturalHeight,
        naturalWidth,
        top: rect.top,
        width: rect.width,
      });
    },
    [live]
  );

  const send = useCallback(
    (event: ScreenInputEvent) => {
      onInput?.(event);
    },
    [onInput]
  );

  const onPointer = (
    event: PointerEvent<Element>,
    kind: "move" | "down" | "up"
  ) => {
    const stage = event.currentTarget.getBoundingClientRect();
    setCursor({ x: event.clientX - stage.left, y: event.clientY - stage.top });
    if (!interactive) {
      return;
    }
    if (kind === "move") {
      const nowMs = Date.now();
      if (nowMs - lastMove.current < MOVE_THROTTLE_MS) {
        return;
      }
      lastMove.current = nowMs;
    }
    const point = pointFromEvent(event);
    if (!point) {
      return;
    }
    const button =
      event.button === 2 ? "right" : event.button === 1 ? "middle" : "left";
    send({
      button: kind === "move" ? undefined : button,
      kind,
      x: point.x,
      y: point.y,
    });
  };

  const onWheel = (event: WheelEvent<Element>) => {
    if (!interactive) {
      return;
    }
    event.preventDefault();
    const point = pointFromEvent(event);
    if (!point) {
      return;
    }
    send({
      dx: Math.round(event.deltaX / 40),
      dy: Math.round(event.deltaY / 40),
      kind: "scroll",
      x: point.x,
      y: point.y,
    });
  };

  return (
    <div
      data-workbench-screen-frame
      data-stale={stale ? "true" : "false"}
      data-workbench-transport={transport}
      className="bg-inset flex min-h-0 flex-1 flex-col p-2 pt-0"
    >
      <button
        type="button"
        data-workbench-agent-canvas
        aria-label="マシン画面"
        tabIndex={interactive ? 0 : -1}
        className={`relative min-h-0 w-full flex-1 overflow-hidden rounded-[8px] border-0 bg-black p-0 text-left outline-none ${
          interactive ? "[cursor:none]" : ""
        } ${focused ? "shadow-[0_0_0_1px_var(--accent)]" : ""}`}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onContextMenu={(event) => {
          if (interactive) {
            event.preventDefault();
          }
        }}
        onPointerMove={(event) => {
          onPointer(event, "move");
        }}
        onPointerDown={(event) => {
          event.currentTarget.focus();
          onPointer(event, "down");
        }}
        onPointerUp={(event) => {
          onPointer(event, "up");
        }}
        onPointerLeave={() => {
          setCursor(null);
        }}
        onDoubleClick={(event) => {
          if (!interactive) {
            return;
          }
          const point = pointFromEvent(event);
          if (!point) {
            return;
          }
          send({
            button: "left",
            count: 2,
            kind: "click",
            x: point.x,
            y: point.y,
          });
        }}
        onWheel={onWheel}
        onKeyDown={(event) => {
          if (!interactive) {
            return;
          }
          const chord = event.key.toLowerCase();
          if ((event.metaKey || event.ctrlKey) && BROWSER_CHORDS.has(chord)) {
            return;
          }
          event.preventDefault();
          if (event.key.length === 1 && !event.metaKey && !event.ctrlKey) {
            send({
              kind: "text",
              modifiers: event.shiftKey ? ["shift"] : undefined,
              text: event.key,
            });
            return;
          }
          send({
            code: event.code,
            key: event.key,
            kind: "key",
            modifiers: [
              event.altKey ? "alt" : "",
              event.ctrlKey ? "ctrl" : "",
              event.metaKey ? "meta" : "",
              event.shiftKey ? "shift" : "",
            ].filter(
              (item): item is "alt" | "ctrl" | "meta" | "shift" =>
                item.length > 0
            ),
          });
        }}
      >
        {live && stream ? (
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            aria-label="接続中マシンの画面"
            className="absolute inset-0 h-full w-full object-contain"
            onPlaying={() => {
              onPlaying?.();
            }}
          />
        ) : (
          <img
            ref={frameRef}
            alt="接続中マシンの画面フレーム"
            src={frameUrl}
            draggable={false}
            className="absolute inset-0 h-full w-full object-contain select-none"
          />
        )}
        {interactive && cursor ? (
          <AgentCursor x={cursor.x} y={cursor.y} />
        ) : null}
      </button>
      <div className="text-ink-3 flex shrink-0 items-center justify-between gap-2 px-1 pt-1.5 text-[11px]">
        <span>
          {live
            ? "ライブ映像"
            : stale
              ? "更新が止まっています"
              : age
                ? `最終フレーム ${age}`
                : "フレーム"}
          {control === "view"
            ? " · 閲覧のみ"
            : focused
              ? " · 操作中"
              : interactive
                ? " · クリックして操作"
                : ""}
        </span>
        {error ? <span className="text-orange truncate">{error}</span> : null}
      </div>
    </div>
  );
}
