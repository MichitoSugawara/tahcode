import { useMutation } from "convex/react";
import { useState } from "react";

import { Button } from "@/components/atoms/Button";
import { Dialog } from "@/harness/ui/Dialog";
import { InlineError, Input, Label } from "@/harness/ui/Field";

import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

/** Multica-style workspace creation: one name, the creator becomes owner. */
export function CreateOrgForm({
  onCreated,
  submitLabel = "Org を作成",
  autoFocus = true,
}: {
  onCreated: (orgId: Id<"orgs">) => void;
  submitLabel?: string;
  autoFocus?: boolean;
}) {
  const createOrg = useMutation(api.orgs.create);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!name.trim() || busy) {
          return;
        }
        setBusy(true);
        setError(null);
        try {
          const id = await createOrg({ name: name.trim() });
          onCreated(id);
        } catch (error) {
          setError(
            error instanceof Error ? error.message : "作成に失敗しました"
          );
        } finally {
          setBusy(false);
        }
      }}
    >
      <div>
        <Label hint="あとから変更できます">Org 名</Label>
        <Input
          autoFocus={autoFocus}
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="例: Acme Engineering"
          maxLength={80}
        />
      </div>
      <p className="text-ink-3 text-[12px] leading-relaxed">
        作成した人が <span className="text-ink-2 font-medium">Owner</span>{" "}
        になります。Owner は招待・権限・ランタイム許可のすべてを管理できます。
      </p>
      {error && <InlineError>{error}</InlineError>}
      <div className="flex justify-end">
        <Button
          type="submit"
          variant="accent"
          size="md"
          disabled={!name.trim() || busy}
        >
          {busy ? "作成中…" : submitLabel}
        </Button>
      </div>
    </form>
  );
}

export function CreateOrgDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (orgId: Id<"orgs">) => void;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="新しい Org"
      description="Org はチーム・プロジェクト・ランタイムの境界です。メンバーは招待リンクで参加します。"
      width={440}
    >
      <CreateOrgForm onCreated={onCreated} />
    </Dialog>
  );
}
