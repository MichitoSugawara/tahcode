import { useMutation } from "convex/react";
import { Building2, ChevronDown, Lock } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "../../../convex/_generated/api";
import { Button } from "@/components/atoms/Button";
import { useOrg } from "@/harness/OrgContext";
import { Dialog } from "@/harness/ui/Dialog";
import { ChoiceList, InlineError, Input, Label } from "@/harness/ui/Field";

/* ─────────────────────────────────────────────────────────
 * CREATE PROJECT — Multica's create dialog: name, visibility,
 * and optional resources (repo / working directory) that
 * become the agent's project context. Creates a first chat
 * ("General") so the project lands somewhere usable.
 * ───────────────────────────────────────────────────────── */

export function CreateProjectDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { org, goChat } = useOrg();
  const createProject = useMutation(api.projects.create);
  const createChat = useMutation(api.chats.createProjectChat);
  const [name, setName] = useState("");
  const [visibility, setVisibility] = useState<"org" | "private">("org");
  const [more, setMore] = useState(false);
  const [repoUrl, setRepoUrl] = useState("");
  const [cwd, setCwd] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setName("");
    setVisibility("org");
    setMore(false);
    setRepoUrl("");
    setCwd("");
    setError(null);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
      title="新しいプロジェクト"
      description="プロジェクトはチャットの入れ物です。名前とリソースはエージェントのコンテキスト（project link）として渡されます。"
      width={480}
      footer={
        <>
          <span className="text-[12px] text-ink-3">作成後に「General」チャットを開きます</span>
          <div className="flex items-center gap-1.5">
            <Button type="button" variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
              キャンセル
            </Button>
            <Button
              type="submit"
              form="create-project"
              variant="accent"
              size="sm"
              disabled={!name.trim() || busy}
            >
              {busy ? "作成中…" : "プロジェクトを作成"}
            </Button>
          </div>
        </>
      }
    >
      <form
        id="create-project"
        className="flex flex-col gap-4"
        onSubmit={async (event) => {
          event.preventDefault();
          if (!name.trim() || busy) return;
          setBusy(true);
          setError(null);
          try {
            const projectId = await createProject({
              orgId: org._id,
              name: name.trim(),
              visibility,
              repoUrl: repoUrl.trim() || undefined,
              cwd: cwd.trim() || undefined,
            });
            const chatId = await createChat({ projectId, title: "General", visibility: "inherit" });
            toast.success(`プロジェクト「${name.trim()}」を作成しました`);
            reset();
            onOpenChange(false);
            goChat(chatId);
          } catch (e) {
            setError(e instanceof Error ? e.message : "作成に失敗しました");
          } finally {
            setBusy(false);
          }
        }}
      >
        <div>
          <Label>プロジェクト名</Label>
          <Input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="例: Web リニューアル" maxLength={80} />
        </div>

        <div>
          <Label>公開範囲</Label>
          <ChoiceList
            value={visibility}
            onChange={setVisibility}
            options={[
              {
                value: "org",
                label: "Org 全体",
                desc: `${org.name} のメンバー全員が見て参加できます`,
                icon: <Building2 size={14} />,
              },
              {
                value: "private",
                label: "プライベート",
                desc: "あなたと Owner / Admin、追加したメンバーだけに表示されます",
                icon: <Lock size={14} />,
              },
            ]}
          />
        </div>

        <div>
          <button
            type="button"
            onClick={() => setMore((current) => !current)}
            aria-expanded={more}
            className="-mx-1.5 flex items-center gap-1.5 rounded-control px-1.5 py-1 text-[12.5px] font-medium text-ink-2 transition-colors duration-100 hover:bg-hover-2"
          >
            <ChevronDown size={14} className="transition-transform duration-300" style={{ transform: more ? "rotate(180deg)" : "rotate(0)" }} />
            リソース（任意）
            <span className="font-normal text-ink-3">リポジトリ / 作業ディレクトリ</span>
          </button>
          <div
            className="grid transition-[grid-template-rows,opacity] duration-300"
            style={{ gridTemplateRows: more ? "1fr" : "0fr", opacity: more ? 1 : 0, transitionTimingFunction: "cubic-bezier(0.23,1,0.32,1)" }}
          >
            <div className="overflow-hidden">
              <div className="mt-2 flex flex-col gap-3 rounded-card bg-inset p-3 shadow-hairline">
                <div>
                  <Label hint="エージェントへの project link に含まれます">リポジトリ URL</Label>
                  <Input value={repoUrl} onChange={(event) => setRepoUrl(event.target.value)} placeholder="https://github.com/acme/web" inputMode="url" />
                </div>
                <div>
                  <Label hint="ランタイム側のパス">作業ディレクトリ</Label>
                  <Input value={cwd} onChange={(event) => setCwd(event.target.value)} placeholder="~/code/web" className="font-mono" />
                </div>
              </div>
            </div>
          </div>
        </div>
        {error && <InlineError>{error}</InlineError>}
      </form>
    </Dialog>
  );
}
