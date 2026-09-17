import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";

import GlideMenu from "@/components/primitives/GlideMenu";
import {
  firstEnabledMenuIndex,
  nextEnabledMenuIndex,
  shouldDismissContextMenu,
} from "@/harness/contextMenus";

export interface ContextMenuItem {
  danger?: boolean;
  disabled?: boolean;
  disabledReason?: string;
  icon?: ReactNode;
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
  header,
  items,
  onClose,
  x,
  y,
}: {
  header?: ReactNode;
  items: ContextMenuItem[];
  onClose: () => void;
  x: number;
  y: number;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(() =>
    firstEnabledMenuIndex(items)
  );
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
    node.focus();
  }, [x, y]);

  useEffect(() => {
    const close = (event: PointerEvent) => {
      if (!shouldDismissContextMenu(event.target)) {
        return;
      }
      onClose();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        setActiveIndex((current) =>
          nextEnabledMenuIndex(
            items,
            current,
            event.key === "ArrowDown" ? 1 : -1
          )
        );
        return;
      }
      if (event.key === "Home" || event.key === "End") {
        event.preventDefault();
        setActiveIndex(
          event.key === "Home"
            ? firstEnabledMenuIndex(items)
            : nextEnabledMenuIndex(items, 0, -1)
        );
        return;
      }
      if (event.key === "Enter") {
        const item = items[activeIndex];
        if (!item || item.disabled) {
          return;
        }
        event.preventDefault();
        onClose();
        item.onSelect();
      }
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", onKey);
    };
  }, [activeIndex, items, onClose]);

  return createPortal(
    <div
      ref={menuRef}
      data-context-menu
      role="menu"
      tabIndex={-1}
      aria-activedescendant={
        items[activeIndex]
          ? `context-menu-${items[activeIndex].key}`
          : undefined
      }
      onContextMenu={(event) => event.preventDefault()}
      className="bg-surface shadow-overlay pointer-events-auto fixed z-[80] min-w-44 rounded-[14px] p-1.5 outline-none"
      style={{
        animation: "pop-in 160ms cubic-bezier(0.23,1,0.32,1) both",
        left: position.left,
        top: position.top,
      }}
    >
      {header}
      <GlideMenu
        className="flex flex-col gap-px"
        highlightClassName="inset-x-0 rounded-[8px] bg-hover-2"
      >
        {items.map((item, index) => (
          <button
            key={item.key}
            id={`context-menu-${item.key}`}
            data-menu-row
            type="button"
            role="menuitem"
            disabled={item.disabled}
            title={item.disabledReason}
            aria-disabled={item.disabled || undefined}
            onMouseEnter={() => {
              if (!item.disabled) {
                setActiveIndex(index);
              }
            }}
            onClick={() => {
              if (item.disabled) {
                return;
              }
              onClose();
              item.onSelect();
            }}
            className={`relative z-10 flex h-9 w-full items-center gap-1.5 rounded-[8px] px-2.5 text-left text-[13.5px] disabled:opacity-45 ${
              item.danger ? "text-red" : "text-ink"
            } ${index === activeIndex && !item.disabled ? "bg-hover-2" : ""}`}
          >
            {item.icon && (
              <span className="flex size-5 shrink-0 items-center justify-center">
                {item.icon}
              </span>
            )}
            {item.label}
          </button>
        ))}
      </GlideMenu>
    </div>,
    document.body
  );
}
