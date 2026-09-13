import { Building2, ChevronDown, Lock } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/atoms/Button";
import { useCreateProjectWithChat } from "@/harness/optimisticMutations";
import { useOrg } from "@/harness/OrgContext";
import { Dialog } from "@/harness/ui/Dialog";
import { ChoiceList, Input, Label } from "@/harness/ui/Field";
import { errorSummary } from "@/lib/format";

/* ─────────────────────────────────────────────────────────
 * CREATE PROJECT — Multica's create dialog: name, visibility,
 * and optional resources (repo / working directory) that
 * become the agent's project context. Creates a first chat
 * ("General") so the project lands somewhere usable — and opens
 * it at once as an optimistic placeholder while both creates run.
 * ───────────────────────────────────────────────────────── */

export function CreateProjectDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { org, goPendingChat } = useOrg();
  const createProject = useCreateProjectWithChat();
  const [name, setName] = useState("");
  const [visibility, setVisibility] = useState<"org" | "private">("org");
  const [more, setMore] = useState(false);
  const [repoUrl, setRepoUrl] = useState("");
  const [cwd, setCwd] = useState("");

  const reset = () => {
    setName("");
    setVisibility("org");
    setMore(false);
    setRepoUrl("");
    setCwd("");
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          reset();
        }
        onOpenChange(next);
      }}
      title="新しいプロジェクト"
      description="プロジェクトはチャットの入れ物です。名前とリソースはエージェントのコンテキスト（project link）として渡されます。"
      width={480}
      footer={
        <>
          <span className="text-ink-3 text-[12px]">
            作成後に「General」チャットを開きます
          </span>
          <div className="flex items-center gap-1.5">
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
              form="create-project"
              variant="accent"
              size="sm"
              disabled={!name.trim()}
            >
              プロジェクトを作成
            </Button>
          </div>
        </>
      }
    >
      <form
        id="create-project"
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          const projectName = name.trim();
          if (!projectName) {
            return;
          }
          const { chatPlaceholder, projectCreated, chatCreated } =
            createProject(
              {
                cwd: cwd.trim() || undefined,
                name: projectName,
                repoUrl: repoUrl.trim() || undefined,
                visibility,
              },
              "General"
            );
          reset();
          onOpenChange(false);
          goPendingChat(chatPlaceholder, chatCreated);
          projectCreated.then(
            () => {
              toast.success(`プロジェクト「${projectName}」を作成しました`);
              /* the project landed; only its first chat can still fail from here */
              chatCreated.catch((error: unknown) =>
                toast.error("General チャットを作成できませんでした", {
                  description: errorSummary(error),
                })
              );
            },
            (error: unknown) =>
              toast.error(
                `プロジェクト「${projectName}」を作成できませんでした`,
                { description: errorSummary(error) }
              )
          );
        }}
      >
        <div>
          <Label>プロジェクト名</Label>
          <Input
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="例: Web リニューアル"
            maxLength={80}
          />
        </div>

        <div>
          <Label>公開範囲</Label>
          <ChoiceList
            value={visibility}
            onChange={setVisibility}
            options={[
              {
                desc: `${org.name} のメンバー全員が見て参加できます`,
                icon: <Building2 size={14} />,
                label: "Org 全体",
                value: "org",
              },
              {
                desc: "あなたと Owner / Admin、追加したメンバーだけに表示されます",
                icon: <Lock size={14} />,
                label: "プライベート",
                value: "private",
              },
            ]}
          />
        </div>

        <div>
          <button
            type="button"
            onClick={() => setMore((current) => !current)}
            aria-expanded={more}
            className="rounded-control text-ink-2 hover:bg-hover-2 -mx-1.5 flex items-center gap-1.5 px-1.5 py-1 text-[12.5px] font-medium transition-colors duration-100"
          >
            <ChevronDown
              size={14}
              className="transition-transform duration-300"
              style={{ transform: more ? "rotate(180deg)" : "rotate(0)" }}
            />
            リソース（任意）
            <span className="text-ink-3 font-normal">
              リポジトリ / 作業ディレクトリ
            </span>
          </button>
          <div
            className="grid transition-[grid-template-rows,opacity] duration-300"
            style={{
              gridTemplateRows: more ? "1fr" : "0fr",
              opacity: more ? 1 : 0,
              transitionTimingFunction: "cubic-bezier(0.23,1,0.32,1)",
            }}
          >
            <div className="overflow-hidden">
              <div className="rounded-card bg-inset shadow-hairline mt-2 flex flex-col gap-3 p-3">
                <div>
                  <Label hint="エージェントへの project link に含まれます">
                    リポジトリ URL
                  </Label>
                  <Input
                    value={repoUrl}
                    onChange={(event) => setRepoUrl(event.target.value)}
                    placeholder="https://github.com/acme/web"
                    inputMode="url"
                  />
                </div>
                <div>
                  <Label hint="ランタイム側のパス">作業ディレクトリ</Label>
                  <Input
                    value={cwd}
                    onChange={(event) => setCwd(event.target.value)}
                    placeholder="~/code/web"
                    className="font-mono"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </form>
    </Dialog>
  );
}
