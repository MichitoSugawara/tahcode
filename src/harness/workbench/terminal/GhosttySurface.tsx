import { historyWritePlan } from "@shared/workbenchTerminal.ts";
import { useEffect, useRef, useState } from "react";

import { GhosttyTerminalCore } from "./ghostty/core";
import {
  measureGhosttyCell,
  renderGhosttySnapshot,
  terminalGridSize,
} from "./ghostty/renderer";
import { workbenchGhosttyTheme } from "./theme";

const FONT = 'ui-monospace, "JetBrains Mono Variable", Menlo, monospace';
const FONT_SIZE = 12;
const PADDING = 6;

export function GhosttySurface({
  disabled,
  history,
  onData,
  onFail,
  onLink,
  onResize,
}: {
  disabled?: boolean;
  history: string;
  onData: (data: string) => void;
  onFail?: () => void;
  onLink?: (href: string) => void;
  onResize?: (cols: number, rows: number) => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const coreRef = useRef<GhosttyTerminalCore | null>(null);
  const historyRef = useRef("");
  const onDataRef = useRef(onData);
  const onResizeRef = useRef(onResize);
  const onFailRef = useRef(onFail);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    onDataRef.current = onData;
    onFailRef.current = onFail;
    onResizeRef.current = onResize;
  }, [onData, onFail, onResize]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const host = hostRef.current;
    if (!canvas || !host) {
      return;
    }
    let disposed = false;
    let frame = 0;
    const context = canvas.getContext("2d");
    if (!context) {
      setFailed(true);
      onFailRef.current?.();
      return;
    }
    const theme = workbenchGhosttyTheme(host);
    const metrics = measureGhosttyCell(context, FONT_SIZE, FONT);
    const start = async () => {
      try {
        const size = terminalGridSize(
          host.clientWidth,
          host.clientHeight,
          metrics,
          PADDING
        );
        const core = await GhosttyTerminalCore.create(
          size.cols,
          size.rows,
          metrics.width,
          metrics.height,
          theme,
          (data) => {
            onDataRef.current(data);
          }
        );
        if (disposed) {
          core.dispose();
          return;
        }
        coreRef.current = core;
        if (historyRef.current) {
          core.resetAndWrite(historyRef.current);
        }
        const draw = () => {
          if (disposed || !coreRef.current) {
            return;
          }
          const snapshot = coreRef.current.snapshot();
          const ratio = window.devicePixelRatio || 1;
          const width = host.clientWidth;
          const height = host.clientHeight;
          if (
            canvas.width !== Math.floor(width * ratio) ||
            canvas.height !== Math.floor(height * ratio)
          ) {
            canvas.width = Math.floor(width * ratio);
            canvas.height = Math.floor(height * ratio);
            canvas.style.width = `${width}px`;
            canvas.style.height = `${height}px`;
            context.setTransform(ratio, 0, 0, ratio, 0, 0);
          }
          renderGhosttySnapshot({
            context,
            cursorOn: true,
            focused: document.activeElement === host,
            fontFamily: FONT,
            fontSize: FONT_SIZE,
            forceFull: true,
            metrics,
            padding: PADDING,
            snapshot,
          });
          frame = window.requestAnimationFrame(draw);
        };
        frame = window.requestAnimationFrame(draw);
      } catch {
        if (!disposed) {
          setFailed(true);
          onFailRef.current?.();
        }
      }
    };
    void start();
    const observer = new ResizeObserver(() => {
      const core = coreRef.current;
      if (!core) {
        return;
      }
      const next = terminalGridSize(
        host.clientWidth,
        host.clientHeight,
        metrics,
        PADDING
      );
      core.resize(next.cols, next.rows, metrics.width, metrics.height);
      onResizeRef.current?.(next.cols, next.rows);
    });
    observer.observe(host);
    return () => {
      disposed = true;
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      coreRef.current?.dispose();
      coreRef.current = null;
    };
  }, []);

  useEffect(() => {
    const core = coreRef.current;
    const plan = historyWritePlan(historyRef.current, history);
    historyRef.current = history;
    if (!core || plan.data.length === 0) {
      return;
    }
    if (plan.kind === "reset") {
      core.resetAndWrite(plan.data);
      return;
    }
    core.write(plan.data);
  }, [history]);

  if (failed) {
    return null;
  }

  return (
    <div
      ref={hostRef}
      data-workbench-ghostty
      role="textbox"
      aria-label="ターミナル"
      aria-multiline="true"
      aria-readonly={disabled}
      tabIndex={disabled ? -1 : 0}
      className="min-h-0 flex-1 outline-none"
      onKeyDown={(event) => {
        if (disabled) {
          return;
        }
        const core = coreRef.current;
        if (!core) {
          return;
        }
        const data = core.encodeKey(event.nativeEvent);
        if (!data) {
          return;
        }
        event.preventDefault();
        onData(data);
      }}
      onClick={(event) => {
        hostRef.current?.focus();
        const core = coreRef.current;
        const canvas = canvasRef.current;
        const context = canvas?.getContext("2d");
        if (!core || !canvas || !context || !onLink) {
          return;
        }
        const metrics = measureGhosttyCell(context, FONT_SIZE, FONT);
        const rect = canvas.getBoundingClientRect();
        const col = Math.floor(
          (event.clientX - rect.left - PADDING) / metrics.width
        );
        const row = Math.floor(
          (event.clientY - rect.top - PADDING) / metrics.height
        );
        const href = core.hyperlinkAt(col, row);
        if (href) {
          onLink(href);
        }
      }}
    >
      <canvas ref={canvasRef} className="block size-full" />
    </div>
  );
}
