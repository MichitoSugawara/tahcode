import { Folder, Lock, MessageSquare, Plus, UserRound } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import type { Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/atoms/Button";
import { useOrg } from "@/harness/OrgContext";
import { useCreateProjectChat } from "@/harness/optimisticMutations";
import { Dialog } from "@/harness/ui/Dialog";
import { ChoiceList, Input, Label } from "@/harness/ui/Field";
import { errorSummary } from "@/lib/format";

/* ─────────────────────────────────────────────────────────
 * NEW CHAT — pick a project (or the personal DM), name it,
 * choose whether it inherits the project's visibility.
 * Submitting opens the chat at once (optimistic placeholder);
 * a failed create backs out and reports through a toast.
 * ───────────────────────────────────────────────────────── */

type Target = "dm" | Id<"projects">;

export function NewChatDialog({
  open,
  onOpenChange,
  initialProjectId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialProjectId?: Id<"projects">;
}) {
  const { projects, dmId, goChat, goPendingChat, openDialog } = useOrg();
  const createChat = useCreateProjectChat();
  const [target, setTarget] = useState<Target | null>(initialProjectId ?? null);
  const [title, setTitle] = useState("");
  const [visibility, setVisibility] = useState<"inherit" | "private">("inherit");

  useEffect(() => {
    if (open) {
      setTarget(initialProjectId ?? (projects && projects.length > 0 ? (projects[0]?._id ?? null) : null));
      setTitle("");
      setVisibility("inherit");
    }
  }, [open, initialProjectId, projects]);

  const projectOptions = (projects ?? []).map((project) => ({
    value: project._id as Target,
    label: project.name,
    desc: project.visibility === "private" ? "プライベートプロジェクト" : "Org 全体に公開",
    icon: project.visibility === "private" ? <Lock size={14} /> : <Folder size={14} />,
  }));

  const isDm = target === "dm";

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="新しいチャット"
      description="プロジェクトチャットでは @codex や @claude のメンションでエージェントが応答します。Personal DM は常時応答です。"
      width={480}
      footer={
        <>
          <span className="text-[12px] text-ink-3">{isDm ? "DM は 1 人 1 つ、常に利用できます" : "参加者は自動的にあなたです"}</span>
          <div className="flex items-center gap-1.5">
            <Button type="button" variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
              キャンセル
            </Button>
            <Button type="submit" form="new-chat" variant="accent" size="sm" disabled={!target}>
              {isDm ? "DM を開く" : "チャットを作成"}
            </Button>
          </div>
        </>
      }
    >
      <form
        id="new-chat"
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (!target) return;
          if (target === "dm") {
            if (dmId) goChat(dmId);
            onOpenChange(false);
            return;
          }
          const chatTitle = title.trim() || "新しいチャット";
          const { placeholder, created } = createChat({ projectId: target, title: chatTitle, visibility });
          onOpenChange(false);
          goPendingChat(placeholder, created);
          created.catch((e: unknown) => {
            toast.error(`「${chatTitle}」を作成できませんでした`, { description: errorSummary(e) });
          });
        }}
      >
        <div>
          <Label
            hint={
              <button type="button" className="inline-flex items-center gap-1 text-accent-ink hover:underline" onClick={() => openDialog({ kind: "createProject" })}>
                <Plus size={11} /> 新しいプロジェクト
              </button>
            }
          >
            場所
          </Label>
          <ChoiceList<Target>
            value={target}
            onChange={setTarget}
            options={[
              ...projectOptions,
              {
                value: "dm",
                label: "Personal DM",
                desc: "あなただけのチャット。エージェントは常に応答します",
                icon: <UserRound size={14} />,
              },
            ]}
          />
          {projectOptions.length === 0 && (
            <p className="mt-2 text-[12px] leading-relaxed text-ink-3">
              参加しているプロジェクトがありません。プロジェクトを作るか、Owner / Admin に追加を依頼してください。
            </p>
          )}
        </div>

        {!isDm && target && (
          <>
            <div>
              <Label>タイトル</Label>
              <Input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} placeholder="例: 認証まわりのリファクタ" maxLength={80} />
            </div>
            <div>
              <Label>公開範囲</Label>
              <ChoiceList
                value={visibility}
                onChange={setVisibility}
                options={[
                  { value: "inherit", label: "プロジェクトと同じ", desc: "プロジェクトを見られる人は全員参加できます", icon: <MessageSquare size={14} /> },
                  { value: "private", label: "プライベート", desc: "あなたと追加したメンバーだけに表示されます", icon: <Lock size={14} /> },
                ]}
              />
            </div>
          </>
        )}
      </form>
    </Dialog>
  );
}
