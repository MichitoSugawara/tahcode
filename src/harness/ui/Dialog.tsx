import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ReactNode } from "react";

/* ─────────────────────────────────────────────────────────
 * DIALOG — Beautiful UI window grammar (radius 14, surface,
 * overlay shadow, pop-in) on Radix for focus/escape handling.
 * Mirrors the harness's "Fork this harness" modal layout.
 * ───────────────────────────────────────────────────────── */

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  width = 520,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className="fixed inset-0 z-[70] bg-black/30 backdrop-blur-[2px] dark:bg-black/60"
          style={{ animation: "fade-in 200ms ease-out both" }}
        />
        <div className="fixed inset-0 z-[71] flex items-center justify-center p-4 sm:p-8">
          <DialogPrimitive.Content
            className="rounded-window bg-surface shadow-overlay relative flex max-h-[85vh] w-full flex-col overflow-hidden outline-none"
            style={{
              animation: "pop-in 250ms cubic-bezier(0.23,1,0.32,1) both",
              maxWidth: width,
            }}
          >
            <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-4">
              <div className="min-w-0">
                <DialogPrimitive.Title className="text-ink text-[16px] font-semibold tracking-[-0.01em]">
                  {title}
                </DialogPrimitive.Title>
                {description && (
                  <DialogPrimitive.Description className="text-ink-2 mt-2 text-[13px] leading-relaxed text-pretty">
                    {description}
                  </DialogPrimitive.Description>
                )}
              </div>
              <DialogPrimitive.Close
                aria-label="閉じる"
                className="primitive-icon-button text-ink-3 hover:bg-hover hover:text-ink -mt-1 -mr-1.5 shrink-0 transition-colors duration-100"
              >
                <X size={15} strokeWidth={2.2} />
              </DialogPrimitive.Close>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">
              {children}
            </div>
            {footer && (
              <div className="border-line flex items-center justify-between gap-3 border-t px-5 py-3.5">
                {footer}
              </div>
            )}
          </DialogPrimitive.Content>
        </div>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

export function SectionLabel({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`text-ink-2 mb-2 text-[12.5px] font-medium ${className}`}>
      {children}
    </div>
  );
}

export function Well({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-card bg-inset shadow-hairline overflow-hidden ${className}`}
    >
      {children}
    </div>
  );
}
