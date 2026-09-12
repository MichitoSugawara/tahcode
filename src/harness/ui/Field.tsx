import { Check } from "lucide-react";
import type { ComponentProps, ReactNode, TextareaHTMLAttributes } from "react";
import GlideMenu from "@/components/primitives/GlideMenu";
import { cn } from "@/lib/utils";

/* Form primitives in Beautiful UI's field grammar: recessed field
 * surface, hairline ring, strong ring on focus, 13px ink. */

export function Label({ children, hint, htmlFor }: { children: ReactNode; hint?: ReactNode; htmlFor?: string }) {
  const Tag = htmlFor ? "label" : "span";
  return (
    <div className="mb-1.5 flex items-baseline justify-between gap-3">
      <Tag htmlFor={htmlFor} className="text-[12.5px] font-medium text-ink-2">
        {children}
      </Tag>
      {hint && <span className="text-[11.5px] text-ink-3">{hint}</span>}
    </div>
  );
}

/* `ComponentProps` (not `InputHTMLAttributes`) so callers can pass `ref` —
 * React 19 forwards it as a regular prop. */
export function Input({ className, invalid, ...props }: ComponentProps<"input"> & { invalid?: boolean }) {
  return (
    <input
      {...props}
      aria-invalid={invalid || props["aria-invalid"]}
      className={cn(
        "h-9 w-full rounded-control bg-field px-3 text-[13px] text-ink shadow-hairline outline-none transition-[box-shadow] duration-150 placeholder:text-ink-3 focus:shadow-[0_0_0_1px_var(--line-strong)] disabled:opacity-60",
        invalid && "shadow-[0_0_0_1px_var(--red)] focus:shadow-[0_0_0_1px_var(--red)]",
        className,
      )}
    />
  );
}

/** Per-field validation message; pair with `aria-describedby` on the input. */
export function FieldError({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <p id={id} role="alert" className="mt-1.5 text-[12px] leading-snug text-red" style={{ animation: "fade-in 150ms ease-out both" }}>
      {children}
    </p>
  );
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={cn(
        "w-full resize-none rounded-control bg-field px-3 py-2 text-[13px] leading-relaxed text-ink shadow-hairline outline-none transition-[box-shadow] duration-150 placeholder:text-ink-3 focus:shadow-[0_0_0_1px_var(--line-strong)]",
        className,
      )}
    />
  );
}

export type Choice<T extends string> = {
  value: T;
  label: ReactNode;
  desc?: ReactNode;
  icon?: ReactNode;
  disabled?: boolean;
  disabledReason?: string;
};

/** ApprovalCard's option rows as a reusable single-choice list. */
export function ChoiceList<T extends string>({
  options,
  value,
  onChange,
  mode = "radio",
}: {
  options: Choice<T>[];
  value: T | null;
  onChange: (value: T) => void;
  mode?: "radio" | "check";
}) {
  return (
    <GlideMenu className="flex flex-col gap-1" highlightClassName="inset-x-0 rounded-control bg-hover">
      {options.map((option) => {
        const on = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            data-menu-row
            aria-pressed={on}
            disabled={option.disabled}
            title={option.disabled ? option.disabledReason : undefined}
            onClick={() => onChange(option.value)}
            className="relative z-10 flex items-start gap-2.5 rounded-control py-1.5 pr-2 pl-1.5 text-left transition-colors duration-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span
              className={`mt-0.5 flex size-4 shrink-0 items-center justify-center transition-colors duration-200 ${
                mode === "radio" ? "rounded-full" : "rounded-[5px]"
              } ${on ? "bg-ink text-canvas" : "text-transparent shadow-[inset_0_0_0_1.5px_var(--line-strong)]"}`}
            >
              {mode === "radio" ? (
                <span className="size-1.5 rounded-full bg-canvas transition-transform duration-200" style={{ transform: on ? "scale(1)" : "scale(0)" }} />
              ) : (
                <Check size={11} strokeWidth={3} />
              )}
            </span>
            {option.icon && <span className="mt-0.5 flex shrink-0 text-ink-3">{option.icon}</span>}
            <span className="min-w-0 flex-1">
              <span className={`block text-[13px] leading-[1.35] transition-colors duration-200 ${on ? "text-ink" : "text-ink-2"}`}>{option.label}</span>
              {option.desc && <span className="mt-0.5 block text-[12px] leading-[1.45] text-ink-3">{option.desc}</span>}
            </span>
          </button>
        );
      })}
    </GlideMenu>
  );
}

export function InlineError({ children }: { children: ReactNode }) {
  return (
    <div className="mt-2 rounded-control bg-red-tint px-3 py-2 text-[12.5px] leading-relaxed text-red" style={{ animation: "fade-in 150ms ease-out both" }}>
      {children}
    </div>
  );
}
