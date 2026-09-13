import { useMutation } from "convex/react";
import { Folder, Lock, MessageSquare, Plus, UserRound } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/atoms/Button";
import { useOrg } from "@/harness/OrgContext";
import { AgentPicker } from "@/harness/ui/AgentPicker";
import { Dialog } from "@/harness/ui/Dialog";
import { ChoiceList, InlineError, Input, Label } from "@/harness/ui/Field";
import { agentMention, type ProviderDriverKind } from "@/lib/providers";

/* ─────────────────────────────────────────────────────────
 * NEW CHAT — pick a project (or the personal DM), name it,
 * choose whether it inherits the project's visibility, and bind
 * the agent (provider + model) the chat runs on. The binding is
 * stored on the chat, so its first message and every auto-mention
 * use `@provider/model` — not whatever this browser last picked.
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
  const { projects, dmId, goChat, openDialog } = org;
  const createChat = useMutation(api.chats.createProjectChat);
  const bindChat = useMutation(api.chats.setAgent);
  const [target, setTarget] = useState<Target | null>(initialProjectId ?? null);
  const [title, setTitle] = useState("");
  const [visibility, setVisibility] = useState<"inherit" | "private">("inherit");
  const [driverKind, setDriverKind] = useState<ProviderDriverKind>(org.provider);
  const [model, setModel] = useState<string | null>(org.model);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setTarget(initialProjectId ?? (projects && projects.length > 0 ? (projects[0]?._id ?? null) : null));
      setTitle("");
      setVisibility("inherit");
      setDriverKind(org.provider);
      setModel(org.model);
      setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialProjectId, projects]);

  const projectOptions = (projects ?? []).map((project) => ({
    value: project._id as Target,
    label: project.name,
    desc: project.visibility === "private" ? "プライベートプロジェクト" : "Org 全体に公開",
    icon: project.visibility === "private" ? <Lock size={14} /> : <Folder size={14} />,
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
          <span className="min-w-0 truncate text-[12px] text-ink-3" title={`送信時のメンション: ${mention}`}>
            {isDm ? "DM は 1 人 1 つ、常に利用できます" : "参加者は自動的にあなたです"}
          </span>
          <div className="flex shrink-0 items-center gap-1.5">
            <Button type="button" variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
              キャンセル
            </Button>
            <Button type="submit" form="new-chat" variant="accent" size="sm" disabled={!target || busy}>
              {isDm ? (busy ? "設定中…" : "DM を開く") : busy ? "作成中…" : "チャットを作成"}
            </Button>
          </div>
        </>
      }
    >
      <form
        id="new-chat"
        className="flex flex-col gap-4"
        onSubmit={async (event) => {
          event.preventDefault();
          if (!target || busy) return;
          setBusy(true);
          setError(null);
          try {
            org.setAgent(driverKind, model);
            if (target === "dm") {
              if (dmId) {
                await bindChat({ chatId: dmId, driverKind, model: model ?? undefined });
                goChat(dmId);
              }
              onOpenChange(false);
              return;
            }
            const chatId = await createChat({
              projectId: target,
              title: title.trim() || "新しいチャット",
              visibility,
              driverKind,
              model: model ?? undefined,
            });
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

        {target && (
          <div>
            <Label hint="あとからコンポーザのピッカーでも変更できます">エージェント</Label>
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
        {error && <InlineError>{error}</InlineError>}
      </form>
    </Dialog>
  );
}
