import { Folder, Lock, MessageSquare, Plus, UserRound } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/atoms/Button";
import {
  useCreateProjectChat,
  useSetChatAgent,
} from "@/harness/optimisticMutations";
import { useOrg } from "@/harness/OrgContext";
import { AgentPicker } from "@/harness/ui/AgentPicker";
import { Dialog } from "@/harness/ui/Dialog";
import { ChoiceList, Input, Label } from "@/harness/ui/Field";
import { errorSummary } from "@/lib/format";
import { agentMention } from "@/lib/providers";
import type { ProviderDriverKind } from "@/lib/providers";

import type { Id } from "../../../convex/_generated/dataModel";

/* ─────────────────────────────────────────────────────────
 * NEW CHAT — pick a project (or the personal DM), name it,
 * choose whether it inherits the project's visibility, and bind
 * the agent (provider + model) the chat runs on. The binding is
 * stored on the chat, so its first message and every auto-mention
 * use `@provider/model` — not whatever this browser last picked.
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
  const org = useOrg();
  const { projects, dmId, goChat, goPendingChat, openDialog } = org;
  const createChat = useCreateProjectChat();
  const bindChat = useSetChatAgent();
  const [target, setTarget] = useState<Target | null>(initialProjectId ?? null);
  const [title, setTitle] = useState("");
  const [visibility, setVisibility] = useState<"inherit" | "private">(
    "inherit"
  );
  const [driverKind, setDriverKind] = useState<ProviderDriverKind>(
    org.provider
  );
  const [model, setModel] = useState<string | null>(org.model);

  useEffect(() => {
    if (open) {
      setTarget(
        initialProjectId ??
          (projects && projects.length > 0 ? (projects[0]?._id ?? null) : null)
      );
      setTitle("");
      setVisibility("inherit");
      setDriverKind(org.provider);
      setModel(org.model);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialProjectId, projects]);

  const projectOptions = (projects ?? []).map((project) => ({
    desc:
      project.visibility === "private"
        ? "プライベートプロジェクト"
        : "Org 全体に公開",
    icon:
      project.visibility === "private" ? (
        <Lock size={14} />
      ) : (
        <Folder size={14} />
      ),
    label: project.name,
    value: project._id as Target,
  }));

  const isDm = target === "dm";
  const mention = agentMention(driverKind, model);

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="新しいチャット"
      description="チャットにはエージェント（プロバイダとモデル）を結びつけます。プロジェクトチャットでは @cursor/muse-spark-1.3 のようなメンションで応答し、Personal DM は常時応答です。"
      width={520}
      footer={
        <>
          <span
            className="text-ink-3 min-w-0 truncate text-[12px]"
            title={`送信時のメンション: ${mention}`}
          >
            {isDm
              ? "DM は 1 人 1 つ、常に利用できます"
              : "参加者は自動的にあなたです"}
          </span>
          <div className="flex shrink-0 items-center gap-1.5">
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
              form="new-chat"
              variant="accent"
              size="sm"
              disabled={!target}
            >
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
          if (!target) {
            return;
          }
          org.setAgent(driverKind, model);
          if (target === "dm") {
            if (dmId) {
              goChat(dmId);
              bindChat({
                chatId: dmId,
                driverKind,
                model: model ?? undefined,
              }).catch((error: unknown) => {
                toast.error("DM のエージェントを設定できませんでした", {
                  description: errorSummary(error),
                });
              });
            }
            onOpenChange(false);
            return;
          }
          const chatTitle = title.trim() || "新しいチャット";
          const { placeholder, created } = createChat({
            driverKind,
            model: model ?? undefined,
            projectId: target,
            title: chatTitle,
            visibility,
          });
          onOpenChange(false);
          goPendingChat(placeholder, created);
          created.catch((error: unknown) => {
            toast.error(`「${chatTitle}」を作成できませんでした`, {
              description: errorSummary(error),
            });
          });
        }}
      >
        <div>
          <Label
            hint={
              <button
                type="button"
                className="text-accent-ink inline-flex items-center gap-1 hover:underline"
                onClick={() => openDialog({ kind: "createProject" })}
              >
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
                desc: "あなただけのチャット。エージェントは常に応答します",
                icon: <UserRound size={14} />,
                label: "Personal DM",
                value: "dm",
              },
            ]}
          />
          {projectOptions.length === 0 && (
            <p className="text-ink-3 mt-2 text-[12px] leading-relaxed">
              参加しているプロジェクトがありません。プロジェクトを作るか、Owner
              / Admin に追加を依頼してください。
            </p>
          )}
        </div>

        {!isDm && target && (
          <>
            <div>
              <Label>タイトル</Label>
              <Input
                autoFocus
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="例: 認証まわりのリファクタ"
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
                    desc: "プロジェクトを見られる人は全員参加できます",
                    icon: <MessageSquare size={14} />,
                    label: "プロジェクトと同じ",
                    value: "inherit",
                  },
                  {
                    desc: "あなたと追加したメンバーだけに表示されます",
                    icon: <Lock size={14} />,
                    label: "プライベート",
                    value: "private",
                  },
                ]}
              />
            </div>
          </>
        )}

        {target && (
          <div>
            <Label hint="あとからコンポーザのピッカーでも変更できます">
              エージェント
            </Label>
            <AgentPicker
              driverKind={driverKind}
              model={model}
              onChange={(kind, next) => {
                setDriverKind(kind);
                setModel(next);
              }}
            />
          </div>
        )}
      </form>
    </Dialog>
  );
}
