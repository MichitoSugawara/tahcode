import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/atoms/Button";
import { Dialog } from "@/harness/ui/Dialog";
import { Input, Label } from "@/harness/ui/Field";
import { errorSummary } from "@/lib/format";

export function RenameDialog({
  description,
  initialValue,
  label,
  onOpenChange,
  onSubmit,
  open,
  title,
}: {
  description?: string;
  initialValue: string;
  label: string;
  onOpenChange: (open: boolean) => void;
  onSubmit: (value: string) => Promise<void>;
  open: boolean;
  title: string;
}) {
  const [value, setValue] = useState(initialValue);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setValue(initialValue);
      setBusy(false);
    }
  }, [initialValue, open]);

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      width={420}
      footer={
        <div className="ml-auto flex items-center gap-1.5">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onOpenChange(false)}
          >
            キャンセル
          </Button>
          <Button
            type="submit"
            form="rename-entity"
            variant="accent"
            size="sm"
            disabled={busy || !value.trim()}
          >
            保存
          </Button>
        </div>
      }
    >
      <form
        id="rename-entity"
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          const next = value.trim();
          if (!next || busy) {
            return;
          }
          setBusy(true);
          onSubmit(next).then(
            () => {
              toast.success("名前を変更しました");
              onOpenChange(false);
            },
            (error: unknown) => {
              setBusy(false);
              toast.error("名前を変更できませんでした", {
                description: errorSummary(error),
              });
            }
          );
        }}
      >
        <div>
          <Label htmlFor="rename-entity-input">{label}</Label>
          <Input
            id="rename-entity-input"
            autoFocus
            value={value}
            maxLength={80}
            onChange={(event) => setValue(event.target.value)}
          />
        </div>
      </form>
    </Dialog>
  );
}
