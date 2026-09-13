import * as SwitchPrimitive from "@radix-ui/react-switch";

/** Beautiful UI toggle on Radix Switch — accent track when on, field track when off. */
export function Switch({
  checked,
  onCheckedChange,
  disabled = false,
  label,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <SwitchPrimitive.Root
      checked={checked}
      onCheckedChange={onCheckedChange}
      disabled={disabled}
      aria-label={label}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-[background-color,opacity] duration-200 outline-none focus-visible:shadow-[0_0_0_2px_var(--accent)] disabled:opacity-50 ${
        checked ? "bg-btn" : "bg-line-strong"
      }`}
    >
      <SwitchPrimitive.Thumb
        className="block size-4 rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,0.25)] transition-transform duration-200 data-[state=checked]:translate-x-[18px] data-[state=unchecked]:translate-x-[2px]"
      />
    </SwitchPrimitive.Root>
  );
}
