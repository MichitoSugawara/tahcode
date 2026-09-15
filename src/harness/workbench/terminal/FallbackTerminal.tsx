import { encodeTerminalKey } from "@shared/workbenchTerminal.ts";
import { useEffect, useRef } from "react";

export function FallbackTerminal({
  disabled,
  history,
  onData,
}: {
  disabled?: boolean;
  history: string;
  onData: (data: string) => void;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = scroller.current;
    if (node) {
      node.scrollTop = node.scrollHeight;
    }
  }, [history]);

  return (
    <div
      ref={scroller}
      data-workbench-fallback-terminal
      role="textbox"
      aria-label="ターミナル"
      aria-multiline="true"
      aria-readonly={disabled}
      tabIndex={disabled ? -1 : 0}
      className="text-ink min-h-0 flex-1 overflow-auto bg-[#121712] px-2 py-1.5 font-mono text-[12px] leading-relaxed whitespace-pre-wrap outline-none"
      onKeyDown={(event) => {
        if (disabled) {
          return;
        }
        const data = encodeTerminalKey(event);
        if (data === null) {
          return;
        }
        event.preventDefault();
        onData(data);
      }}
    >
      {history}
    </div>
  );
}
