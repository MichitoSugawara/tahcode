import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { Button, type ButtonVariant } from "@/components/atoms/Button";
import { copyText } from "@/lib/format";

/** CodeBlock's copy affordance as a standalone pill. */
export function CopyButton({
  text,
  label = "コピー",
  copiedLabel = "コピーしました",
  variant = "secondary",
  size = "sm",
}: {
  text: string;
  label?: string;
  copiedLabel?: string;
  variant?: ButtonVariant;
  size?: "xs" | "sm" | "md";
}) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      onClick={() => {
        void copyText(text).then((ok) => {
          if (!ok) return;
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
      className={copied ? "text-green" : undefined}
    >
      {copied ? <Check size={13} strokeWidth={2.5} /> : <Copy size={13} />}
      {copied ? copiedLabel : label}
    </Button>
  );
}
