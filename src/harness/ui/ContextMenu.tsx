import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import GlideMenu from "@/components/primitives/GlideMenu";

export interface ContextMenuItem {
  danger?: boolean;
  disabled?: boolean;
  key: string;
  label: string;
  onSelect: () => void;
}

const MENU_PAD = 8;
const ESTIMATED_ITEM_HEIGHT = 36;

function clampPosition(
  x: number,
  y: number,
  width: number,
  height: number
): { left: number; top: number } {
  const maxLeft = window.innerWidth - width - MENU_PAD;
  const maxTop = window.innerHeight - height - MENU_PAD;
  return {
    left: Math.min(Math.max(MENU_PAD, x), Math.max(MENU_PAD, maxLeft)),
    top: Math.min(Math.max(MENU_PAD, y), Math.max(MENU_PAD, maxTop)),
  };
}

export function ContextMenu({
  items,
  onClose,
  x,
  y,
}: {
  items: ContextMenuItem[];
  onClose: () => void;
  x: number;
  y: number;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState(() =>
    clampPosition(x, y, 220, items.length * ESTIMATED_ITEM_HEIGHT + 12)
  );

  useLayoutEffect(() => {
    const node = menuRef.current;
    if (!node) {
      return;
    }
    const rect = node.getBoundingClientRect();
    setPosition(clampPosition(x, y, rect.width, rect.height));
  }, [x, y]);

  useEffect(() => {
    const close = (event: PointerEvent) => {
      const target = event.target as Element | null;
      if (target?.closest("[data-context-menu]")) {
        return;
      }
      onClose();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return createPortal(
    <div
      ref={menuRef}
      data-context-menu
      role="menu"
      className="bg-surface shadow-overlay fixed z-50 min-w-44 rounded-[14px] p-1.5"
      style={{
        animation: "pop-in 160ms cubic-bezier(0.23,1,0.32,1) both",
        left: position.left,
        top: position.top,
      }}
    >
      <GlideMenu
        className="flex flex-col gap-px"
        highlightClassName="inset-x-0 rounded-[8px] bg-hover-2"
      >
        {items.map((item) => (
          <button
            key={item.key}
            data-menu-row
            type="button"
            role="menuitem"
            disabled={item.disabled}
            onClick={() => {
              if (item.disabled) {
                return;
              }
              onClose();
              item.onSelect();
            }}
            className={`relative z-10 flex h-9 w-full items-center rounded-[8px] px-2.5 text-left text-[13.5px] disabled:opacity-45 ${
              item.danger ? "text-red" : "text-ink"
            }`}
          >
            {item.label}
          </button>
        ))}
      </GlideMenu>
    </div>,
    document.body
  );
}
