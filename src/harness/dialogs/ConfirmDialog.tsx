import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/atoms/Button";
import { Dialog } from "@/harness/ui/Dialog";
import { errorSummary } from "@/lib/format";

export function ConfirmDialog({
  confirmLabel,
  description,
  onConfirm,
  onOpenChange,
  open,
  successMessage,
  title,
}: {
  confirmLabel: string;
  description: string;
  onConfirm: () => Promise<void>;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  successMessage: string;
  title: string;
}) {
  const [busy, setBusy] = useState(false);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setBusy(false);
        }
        onOpenChange(next);
      }}
      title={title}
      description={description}
      width={420}
      footer={
        <div className="ml-auto flex items-center gap-1.5">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={() => onOpenChange(false)}
          >
            キャンセル
          </Button>
          <Button
            type="button"
            variant="danger"
            size="sm"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              onConfirm().then(
                () => {
                  toast.success(successMessage);
                  onOpenChange(false);
                },
                (error: unknown) => {
                  setBusy(false);
                  toast.error("削除できませんでした", {
                    description: errorSummary(error),
                  });
                }
              );
            }}
          >
            {confirmLabel}
          </Button>
        </div>
      }
    >
      <p className="text-ink-2 text-[13px] leading-relaxed">
        この操作は取り消せません。
      </p>
    </Dialog>
  );
}
