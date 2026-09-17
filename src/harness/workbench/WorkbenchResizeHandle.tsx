import { useRef, useState } from "react";

import {
  clampWorkbenchWidth,
  WORKBENCH_WIDTH_MAX_PX,
  WORKBENCH_WIDTH_MIN_PX,
  WORKBENCH_WIDTH_NUDGE_PX,
} from "./state";

type DragOrigin = {
  startWidth: number;
  startX: number;
};

/** Left-edge splitter for the verification workbench. */
export function WorkbenchResizeHandle({
  onWidthChange,
  width,
}: {
  onWidthChange: (next: number) => void;
  width: number;
}) {
  const drag = useRef<DragOrigin | null>(null);
  const [dragging, setDragging] = useState(false);

  const applyClientX = (clientX: number) => {
    const origin = drag.current;
    if (!origin) {
      return;
    }
    onWidthChange(
      clampWorkbenchWidth(origin.startWidth - (clientX - origin.startX))
    );
  };

  const endDrag = () => {
    drag.current = null;
    setDragging(false);
  };

  return (
    <div
      role="separator"
      aria-label="右サイドバーの幅を変更"
      aria-orientation="vertical"
      aria-valuemax={WORKBENCH_WIDTH_MAX_PX}
      aria-valuemin={WORKBENCH_WIDTH_MIN_PX}
      aria-valuenow={width}
      data-workbench-resize
      tabIndex={0}
      className={`absolute inset-y-0 left-0 z-10 w-2 cursor-col-resize touch-none border-0 bg-transparent p-0 ${
        dragging ? "bg-hover-2" : "hover:bg-hover"
      }`}
      onPointerDown={(event) => {
        if (event.button !== 0) {
          return;
        }
        event.preventDefault();
        drag.current = { startWidth: width, startX: event.clientX };
        setDragging(true);
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        applyClientX(event.clientX);
      }}
      onPointerUp={(event) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
        endDrag();
      }}
      onPointerCancel={endDrag}
      onKeyDown={(event) => {
        if (event.key === "ArrowLeft") {
          event.preventDefault();
          onWidthChange(clampWorkbenchWidth(width + WORKBENCH_WIDTH_NUDGE_PX));
          return;
        }
        if (event.key === "ArrowRight") {
          event.preventDefault();
          onWidthChange(clampWorkbenchWidth(width - WORKBENCH_WIDTH_NUDGE_PX));
          return;
        }
        if (event.key === "Home") {
          event.preventDefault();
          onWidthChange(WORKBENCH_WIDTH_MIN_PX);
          return;
        }
        if (event.key === "End") {
          event.preventDefault();
          onWidthChange(WORKBENCH_WIDTH_MAX_PX);
        }
      }}
    />
  );
}
