import {
  applyImagegenDraft,
  imagegenInsert,
  wiredHarnessFeatures,
} from "@shared/harnessFeatures.ts";
import { JOB_CANCELLED_MESSAGE } from "@shared/jobs.ts";
import { useMutation, useQuery } from "convex/react";
import {
  AtSign,
  Bot,
  Brain,
  Cpu,
  Folder,
  Image as ImageIcon,
  MessageSquarePlus,
  Paperclip,
  Sparkles,
  UnfoldHorizontal,
  UserPlus,
  UserRound,
  Zap,
} from "lucide-react";
import { useCallback, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { toast } from "sonner";

import { Monogram } from "@/components/atoms/EntityChip";
import { ProviderMark } from "@/components/atoms/ProviderIcon";
import PromptBar from "@/components/primitives/PromptBar";
import type {
  PromptMenuItem,
  PromptPicker,
} from "@/components/primitives/PromptBar";
import { useSetChatAgent } from "@/harness/optimisticMutations";
import { isLive, useOrg } from "@/harness/OrgContext";
import type { Chat } from "@/harness/OrgContext";
import { LINEAR_CONNECTOR, providerIconSource } from "@/lib/connectorCard";
import { connectorMentionSuggestItems } from "@/lib/connectorMentions";
import { isDesktopShell, registerRuntimeCtaLabel } from "@/lib/desktop";
import { colorFor, displayName, formatBytes, monogram } from "@/lib/format";
import {
  MENTION_BOUNDARY,
  MENTION_HANDLE,
  activeAgentToken,
  expandResolvedMentions,
  hasAgentMention,
} from "@/lib/mentions";
import { isPlaceholderId, placeholderId, resolveId } from "@/lib/optimistic";
import {
  PROVIDERS,
  agentMention,
  catalogModelHint,
  cursorMentionSuggestItems,
  cursorModelFamily,
  descriptorPickerItems,
  getProviderOptionCurrentLabel,
  getProviderOptionCurrentValue,
  isProviderKind,
  modelCatalogFor,
  modelDisplayName,
  modelMentionExample,
  optionAriaLabel,
  optionDescriptorsFor,
  optionFooterFor,
  pickerModelSlug,
  retainValidOptions,
  supportsModelPick,
  upsertOptionSelection,
} from "@/lib/providers";
import type {
  ProviderDriverKind,
  ProviderOptionSelection,
} from "@/lib/providers";

import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

/* the draft ends in an @token still being typed — hold the auto-mention hint */
const TYPING_MENTION = new RegExp(`${MENTION_BOUNDARY}@${MENTION_HANDLE}*$`);

function ConnectorMentionIcon({
  displayName,
  src,
}: {
  displayName: string;
  src?: string;
}) {
  if (!src) {
    return <span aria-hidden>{displayName.slice(0, 1)}</span>;
  }
  return (
    <img
      src={src}
      alt=""
      width={14}
      height={14}
      className="size-3.5 rounded-[3px] object-cover"
    />
  );
}

function optionPickerIcon(optionId: string) {
  if (optionId === "fastMode" || optionId === "serviceTier") {
    return <Zap size={12} />;
  }
  if (optionId === "contextWindow") {
    return <UnfoldHorizontal size={12} />;
  }
  if (optionId === "agent") {
    return <Bot size={12} />;
  }
  return <Brain size={12} />;
}

function optionPickers(
  agent: ComposerAgent,
  models: {
    slug: string;
    defaultReasoningLevel?: string;
    supportedReasoningLevels?: string[];
  }[],
  setAgent: (
    driverKind: ProviderDriverKind,
    model: string | null,
    options?: ProviderOptionSelection[] | null
  ) => void
): PromptPicker[] {
  const hint = catalogModelHint(agent.driverKind, agent.model, models);
  const descriptors = optionDescriptorsFor(agent.driverKind, agent.model, hint);
  return descriptors.map((descriptor) => {
    const current = getProviderOptionCurrentValue(descriptor, agent.options);
    const items = descriptorPickerItems(descriptor);
    const value =
      descriptor.type === "boolean"
        ? current
          ? "true"
          : "false"
        : typeof current === "string"
          ? current
          : "";
    return {
      ariaLabel: optionAriaLabel(descriptor),
      footer: optionFooterFor(agent.driverKind, descriptor.id),
      icon: optionPickerIcon(descriptor.id),
      id: `opt-${descriptor.id}`,
      items: items.map((item) => ({
        key: item.key,
        name: item.name,
        tag: item.isDefault ? "既定" : undefined,
      })),
      label: getProviderOptionCurrentLabel(descriptor, agent.options),
      onChange: (key) =>
        setAgent(
          agent.driverKind,
          agent.model,
          upsertOptionSelection(
            agent.options,
            descriptor.id,
            descriptor.type === "boolean" ? key === "true" : key
          )
        ),
      value,
    };
  });
}

/* ─────────────────────────────────────────────────────────
 * COMPOSER — PromptBar wired to the org: @ agents + members,
 * / commands, provider + model + runtime pickers, R2
 * attachments, and the Phase 1 rule that project chats
 * auto-mention the chat's agent (`@cursor/muse-spark-1.3`) so a
 * plain message still reaches it.
 * ───────────────────────────────────────────────────────── */

const MENTION_RE = new RegExp(`@${MENTION_HANDLE}+`, "g");

export interface ComposerAgent {
  driverKind: ProviderDriverKind;
  model: string | null;
  options?: ProviderOptionSelection[];
}

/**
 * The agent a chat runs on: the chat's own binding when it has one, else the
 * org's last-used pick. Changing it writes both, so the choice sticks for the
 * chat (every member, every device) and seeds the next unbound chat.
 */
export function useChatAgent(chat: Chat | null) {
  const org = useOrg();
  const bindChat = useSetChatAgent();
  const agent: ComposerAgent = chat?.driverKind
    ? {
        driverKind: chat.driverKind,
        model: chat.model ?? null,
        options: chat.options,
      }
    : { driverKind: org.provider, model: org.model, options: org.options };
  const setAgent = useCallback(
    (
      driverKind: ProviderDriverKind,
      model: string | null,
      nextOptions?: ProviderOptionSelection[] | null
    ) => {
      const resolvedModel =
        driverKind === "cursor" && model ? cursorModelFamily(model) : model;
      const options =
        nextOptions === undefined
          ? retainValidOptions(driverKind, resolvedModel, agent.options)
          : (nextOptions ?? undefined);
      org.setAgent(driverKind, resolvedModel, options ?? null);
      if (chat) {
        /* a chat opened straight from its create dialog may still carry a placeholder id */
        void resolveId(chat._id)
          .then((chatId) =>
            bindChat({
              chatId,
              driverKind,
              model: resolvedModel ?? undefined,
              options,
            })
          )
          .catch((error: unknown) =>
            toast.error(
              error instanceof Error
                ? error.message
                : "エージェントの設定に失敗しました"
            )
          );
      }
    },
    [org, chat, bindChat, agent.options]
  );
  return { agent, setAgent };
}

/** Send with the Phase 1 rules applied (auto-mention in project chats,
 *  R2 uploads appended as links, runtime hint from the picker, and the
 *  chat's provider / model sent along so DMs bind to them too).
 *  The user's bubble is inserted optimistically so the thread moves the
 *  moment ⏎ is pressed; the agent's reply row still comes from the server. */
export function useSendMessage(chat: Chat | null) {
  const org = useOrg();
  const { agent } = useChatAgent(chat);
  const sendMessage = useMutation(api.messages.send).withOptimisticUpdate(
    (store, args) => {
      for (const { args: listArgs, value } of store.getAllQueries(
        api.messages.list
      )) {
        if (value === undefined || listArgs.chatId !== args.chatId) {
          continue;
        }
        store.setQuery(api.messages.list, listArgs, {
          ...value,
          messages: [
            ...value.messages,
            {
              _creationTime: Date.now(),
              _id: placeholderId("messages"),
              authorHandle: org.me.handle,
              authorId: org.me._id,
              authorName: org.me.name,
              authorType: "user",
              body: args.body,
              chatId: args.chatId,
              mentions: [...new Set(args.body.match(MENTION_RE) ?? [])],
            },
          ],
        });
      }
    }
  );
  const recordFile = useMutation(api.files.record);
  const prepareUpload = useMutation(api.files.prepareUpload);
  const ticketForKey = useMutation(api.files.ticketForKey);
  const [busy, setBusy] = useState(false);

  const upload = async (chatId: Id<"chats">, file: File): Promise<string> => {
    const prepared = await prepareUpload({
      chatId,
      contentType: file.type || "application/octet-stream",
      name: file.name,
      orgId: org.org._id,
      size: file.size,
    });
    const response = await fetch("/api/files", {
      body: file,
      headers: {
        "Content-Type": file.type || "application/octet-stream",
        "X-File-Name": encodeURIComponent(file.name),
        "X-Upload-Ticket": prepared.ticket,
      },
      method: "POST",
    });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(
        text || "ファイルサーバに接続できません（wrangler dev の起動を確認）"
      );
    }
    const uploaded = (await response.json()) as {
      key: string;
      name: string;
      contentType: string;
      size: number;
    };
    await recordFile({
      chatId,
      contentType: uploaded.contentType,
      key: uploaded.key,
      name: uploaded.name,
      orgId: org.org._id,
      size: uploaded.size,
    });
    let url = `/api/files/${encodeURIComponent(uploaded.key)}`;
    try {
      url = await ticketForKey({ key: uploaded.key });
    } catch {
      /* click-to-ticket still works for the path-only link */
    }
    return `📎 [${uploaded.name}](${url})`;
  };

  const send = async (text: string, files: File[] = []) => {
    if (!chat || busy) {
      return null;
    }
    setBusy(true);
    try {
      /* a chat opened straight from its create dialog may still carry a placeholder id */
      const chatId = await resolveId(chat._id);
      const links: string[] = [];
      for (const file of files) {
        links.push(await upload(chatId, file));
      }
      let body = applyImagegenDraft(
        agent.driverKind,
        [text, ...links].filter(Boolean).join("\n")
      );
      if (chat.kind === "project" && !hasAgentMention(body)) {
        body = `${agentMention(agent.driverKind, agent.model)} ${body}`;
      }
      body = expandResolvedMentions(body);
      const result = await sendMessage({
        body,
        chatId,
        driverKind: agent.driverKind,
        model: agent.model ?? undefined,
        options: agent.options,
        runtimeId: org.runtimeId ?? undefined,
      });
      return { chatId, dispatched: result.dispatched, jobId: result.jobId };
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "送信に失敗しました"
      );
      return null;
    } finally {
      setBusy(false);
    }
  };

  return { busy, send };
}

export function useCancelJob() {
  const cancelJob = useMutation(api.jobs.cancel);
  const [stopping, setStopping] = useState(false);
  const cancel = useCallback(
    async (jobId: Id<"jobs">) => {
      if (stopping) {
        return false;
      }
      setStopping(true);
      try {
        await cancelJob({ jobId });
        toast.success(JOB_CANCELLED_MESSAGE);
        return true;
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "中断に失敗しました"
        );
        return false;
      } finally {
        setStopping(false);
      }
    },
    [cancelJob, stopping]
  );
  return { cancel, stopping };
}

export function Composer({
  chat,
  tall = false,
  placeholder,
  autoFocus,
  onSubmit,
  onSent,
}: {
  chat: Chat | null;
  tall?: boolean;
  placeholder?: string;
  autoFocus?: boolean;
  /** fires as the message leaves the composer — before the round-trip, so callers can navigate at once */
  onSubmit?: (chat: Chat) => void;
  onSent?: (result: {
    chatId: Id<"chats">;
    dispatched: boolean;
    jobId?: Id<"jobs">;
  }) => void;
}) {
  const org = useOrg();
  const { send: sendWithRules, busy } = useSendMessage(chat);
  const { agent, setAgent } = useChatAgent(chat);
  const { cancel, stopping } = useCancelJob();
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<File[]>([]);
  const [draft, setDraft] = useState("");
  const serverChatId = chat && !isPlaceholderId(chat._id) ? chat._id : null;
  const activeJob = useQuery(
    api.jobs.activeForChat,
    serverChatId ? { chatId: serverChatId } : "skip"
  );

  const disabled = !chat;
  const isProject = chat?.kind === "project";
  const typingMention = TYPING_MENTION.test(draft);
  const needsMention =
    isProject &&
    draft.trim().length > 0 &&
    !hasAgentMention(draft) &&
    !typingMention;
  const mention = agentMention(agent.driverKind, agent.model);
  const provider = PROVIDERS[agent.driverKind];

  const liveRuntimes = useMemo(
    () => (org.runtimes ?? []).filter((runtime) => isLive(runtime, org.now)),
    [org.runtimes, org.now]
  );
  const usable = useMemo(
    () => liveRuntimes.filter((runtime) => runtime.canUse),
    [liveRuntimes]
  );
  const installed = useMemo(
    () =>
      new Set(
        usable.flatMap((runtime) =>
          runtime.providers
            .filter((provider) => provider.available)
            .map((provider) => provider.driverKind)
        )
      ),
    [usable]
  );
  const linearConnections = useQuery(api.connectorConnections.listByOrg, {
    orgId: org.org._id,
    provider: LINEAR_CONNECTOR.provider,
  });
  const linearMentionIcon = providerIconSource(LINEAR_CONNECTOR);

  /* `@cursor/` switches the @ menu from providers + people to that provider's models */
  const modelToken = useMemo(() => {
    const token = activeAgentToken(draft);
    return token && token.modelQuery !== null ? token : null;
  }, [draft]);
  const cursorSuggestKind = useMemo(() => {
    if (modelToken?.providerKind !== "cursor") {
      return;
    }
    return cursorMentionSuggestItems(
      modelToken.handle,
      modelToken.modelQuery ?? "",
      modelCatalogFor("cursor", org.runtimes).models
    )[0]?.kind;
  }, [modelToken, org.runtimes]);

  const mentions: PromptMenuItem[] = useMemo(() => {
    if (modelToken) {
      const kind = modelToken.providerKind;
      const catalog = modelCatalogFor(kind, org.runtimes);
      const rows =
        kind === "cursor"
          ? cursorMentionSuggestItems(
              modelToken.handle,
              modelToken.modelQuery ?? "",
              catalog.models
            )
          : catalog.models.map((model) => ({
              desc: model.name ?? model.slug,
              insert: `@${modelToken.handle}/${model.slug} `,
              key: `m-${kind}-${model.slug}`,
              kind: "family" as const,
              name: `@${modelToken.handle}/${model.slug}`,
              search: [model.slug, model.name, ...(model.aliases ?? [])]
                .filter((part): part is string => Boolean(part))
                .join(" "),
              slug: model.slug,
              trailing: model.default
                ? "CLI の既定"
                : model.legacy
                  ? "legacy"
                  : catalog.source === "live"
                    ? "live"
                    : undefined,
            }));
      return rows.map((row) => ({
        desc: row.desc,
        icon: <ProviderMark kind={kind} />,
        insert: row.insert,
        key: row.key,
        name: row.name,
        search: row.search,
        trailing: row.trailing,
      }));
    }
    const agents: PromptMenuItem[] = [
      {
        desc: "このチャットの既定エージェントで実行",
        icon: <Sparkles size={14} />,
        insert: "@agent ",
        key: "agent",
        name: "@agent",
      },
      ...Object.entries(PROVIDERS).map(([kind, info]) => ({
        desc: `${info.label} で実行（@${info.handle}/… でモデル指定）`,
        icon: <ProviderMark kind={kind} />,
        insert: `@${info.handle} `,
        key: kind,
        name: `@${info.handle}`,
        trailing: installed.has(kind as never)
          ? "利用可"
          : liveRuntimes.length > 0
            ? "未検出"
            : undefined,
      })),
    ];
    const people: PromptMenuItem[] = (org.members ?? [])
      .filter((member) => member.user.handle)
      .map((member) => ({
        desc: displayName(member.user),
        icon: (
          <Monogram color={colorFor(String(member.user._id))}>
            {monogram(displayName(member.user))}
          </Monogram>
        ),
        insert: `@${member.user.handle} `,
        key: `u-${String(member.user._id)}`,
        name: `@${member.user.handle}`,
        trailing:
          String(member.user._id) === String(org.me._id) ? "あなた" : undefined,
      }));
    const connectors: PromptMenuItem[] = connectorMentionSuggestItems(
      linearConnections ?? []
    ).map((item) => ({
      desc: item.desc,
      icon: (
        <ConnectorMentionIcon
          displayName={LINEAR_CONNECTOR.displayName}
          src={linearMentionIcon}
        />
      ),
      insert: item.insert,
      key: item.key,
      name: item.name,
      search: item.search,
      trailing: (
        <span className="bg-inset text-ink-3 rounded-[4px] px-1 text-[10.5px] font-medium">
          {item.trailing}
        </span>
      ),
    }));
    return [...agents, ...connectors, ...people];
  }, [
    linearConnections,
    linearMentionIcon,
    modelToken,
    org.members,
    org.me._id,
    org.runtimes,
    installed,
    liveRuntimes.length,
  ]);

  const commands: PromptMenuItem[] = [
    {
      action: () => org.openDialog({ kind: "newChat" }),
      desc: "新しいチャット",
      icon: <MessageSquarePlus size={14} />,
      key: "new",
      name: "/new",
    },
    {
      action: () => org.openDialog({ kind: "createProject" }),
      desc: "新しいプロジェクト",
      icon: <Folder size={14} />,
      key: "project",
      name: "/project",
    },
    {
      action: () => org.openDialog({ kind: "registerRuntime" }),
      desc: isDesktopShell()
        ? registerRuntimeCtaLabel()
        : "マシンランタイムを登録",
      icon: <Cpu size={14} />,
      key: "runtime",
      name: "/runtime",
    },
    {
      action: () => org.dmId && org.goChat(org.dmId),
      desc: "Personal DM を開く",
      icon: <UserRound size={14} />,
      key: "dm",
      name: "/dm",
    },
    ...(org.isAdmin
      ? [
          {
            action: () => org.openDialog({ kind: "invite" }),
            desc: "メンバーを招待",
            icon: <UserPlus size={14} />,
            key: "invite",
            name: "/invite",
          },
        ]
      : []),
    ...wiredHarnessFeatures()
      .filter((feature) => feature.slash)
      .map((feature) => ({
        desc: "Codex CLI の画像生成スキルを挿入",
        icon: <ImageIcon size={14} />,
        insert: feature.insert(agent.driverKind),
        key: feature.id,
        name: feature.slash ?? feature.name,
        trailing: "Codex",
      })),
  ];

  const harnessCommands: PromptMenuItem[] = wiredHarnessFeatures().map(
    (feature) => ({
      desc: feature.description,
      icon: <ImageIcon size={14} />,
      insert: feature.insert(agent.driverKind),
      key: feature.id,
      name: feature.name,
      trailing: "Codex",
    })
  );

  const plusItems: PromptMenuItem[] = [
    {
      action: () => fileRef.current?.click(),
      desc: "Cloudflare R2 に保存（20MB まで）",
      icon: <Paperclip size={14} />,
      key: "attach",
      name: "ファイルを添付",
    },
    {
      desc: "Codex の $imagegen を使って画像を生成",
      icon: <ImageIcon size={14} />,
      insert: imagegenInsert(agent.driverKind),
      key: "imagegen",
      name: "画像を生成",
      trailing: "Codex",
    },
  ];

  /* live list from a connected machine when one reported it, static snapshot otherwise */
  const catalog = useMemo(
    () => modelCatalogFor(agent.driverKind, org.runtimes),
    [agent.driverKind, org.runtimes]
  );
  const models = catalog.models;
  const pickers: PromptPicker[] = [
    {
      ariaLabel: "プロバイダを選択",
      footer:
        "t3code 由来のプロバイダ配線 · CLI はランタイム側（tahcode start / Multica daemon）",
      id: "provider",
      icon: <ProviderMark kind={agent.driverKind} />,
      items: Object.entries(PROVIDERS).map(([kind, info]) => ({
        icon: <ProviderMark kind={kind} />,
        key: kind,
        name: info.label,
        tag: installed.has(kind as never)
          ? "利用可"
          : liveRuntimes.length > 0
            ? "未検出"
            : undefined,
      })),
      label: provider.label,
      onChange: (key) => {
        /* model slugs are provider-specific, so a provider change resets to that CLI's default */
        if (isProviderKind(key) && key !== agent.driverKind) {
          setAgent(key, null, null);
        }
      },
      value: agent.driverKind,
    },
    {
      ariaLabel: "モデルを選択",
      footer: supportsModelPick(agent.driverKind)
        ? `メンションは @${provider.handle}/<slug> の形になります · 既定 = CLI 側の設定 · ${catalog.source === "live" ? "live: " : ""}${catalog.note}`
        : `${provider.label} は headless CLI がなく、モデルは選べません`,
      id: "model",
      items: [
        { key: "", name: "既定モデル", tag: "CLI の設定" },
        ...(supportsModelPick(agent.driverKind)
          ? models.map((model) => ({
              key: model.slug,
              name: model.name ?? model.slug,
              tag: model.default
                ? "CLI の既定"
                : model.legacy
                  ? "legacy"
                  : undefined,
            }))
          : []),
      ],
      label: agent.model
        ? (modelDisplayName(agent.driverKind, agent.model) ?? agent.model)
        : "既定モデル",
      onChange: (key) => setAgent(agent.driverKind, key || null),
      value: pickerModelSlug(agent.driverKind, agent.model),
    },
    ...optionPickers(agent, catalog.models, setAgent),
    {
      ariaLabel: "ランタイムを選択",
      emptyHint: "ランタイムがありません",
      footer:
        (org.runtimes ?? []).length === 0
          ? isDesktopShell()
            ? `「/runtime」で${registerRuntimeCtaLabel()}`
            : "「/runtime」でこのマシンを登録（npm i -g tahcode）"
          : "default deny — 許可のないマシンは選べません",
      icon: <Cpu size={12} />,
      id: "runtime",
      items: [
        {
          key: "auto",
          name: "自動選択",
          tag: usable.length > 0 ? `${usable.length} 台` : "オフライン",
        },
        ...(org.runtimes ?? []).map((runtime) => ({
          key: String(runtime._id),
          name: runtime.name,
          tag: runtime.canUse
            ? isLive(runtime, org.now)
              ? "オンライン"
              : "オフライン"
            : "許可なし",
          disabled: !runtime.canUse,
        })),
      ],
      label: org.runtimeId
        ? (org.runtimes?.find((runtime) => runtime._id === org.runtimeId)
            ?.name ?? "指定中")
        : "自動",
      onChange: (key) =>
        org.setRuntimeId(key === "auto" ? null : (key as Id<"runtimes">)),
      value: org.runtimeId ? String(org.runtimeId) : "auto",
    },
  ];

  const send = async (text: string) => {
    if (chat && !busy) {
      onSubmit?.(chat);
    }
    const result = await sendWithRules(text, pending);
    if (result) {
      setPending([]);
      onSent?.(result);
      return true;
    }
    return false;
  };

  let hint: ReactNode = null;
  if (disabled) {
    hint = "チャットを開くと送信できます";
  } else if (needsMention) {
    hint = (
      <span className="inline-flex flex-wrap items-center gap-1">
        <AtSign size={11} /> メンションがないので送信時に{" "}
        <code className="text-ink-2 font-mono">{mention}</code>{" "}
        を自動付与します（Phase 1 のルール）
      </span>
    );
  } else if (activeJob) {
    hint = activeJob.canCancel
      ? "生成中 — 中断でこのジョブを止められます"
      : "生成中です";
  } else if (isProject) {
    hint = `${mention} がこのチャットのエージェント · ${modelMentionExample(agent.driverKind)} のように別のモデルも指名できます · $imagegen で画像生成 · ⏎ 送信 · ⇧⏎ 改行`;
  } else {
    hint = `DM ではエージェントが常に応答します（${mention}） · $imagegen で画像生成 · ⏎ 送信 · ⇧⏎ 改行`;
  }

  return (
    <>
      <PromptBar
        tall={tall}
        disabled={disabled}
        busy={busy}
        jobRunning={!!activeJob}
        canStop={!!activeJob?.canCancel && !stopping}
        onStop={activeJob ? () => cancel(activeJob._id) : undefined}
        placeholder={
          placeholder ??
          (isProject
            ? `${mention} にタスクを頼む、または相談を書く…`
            : "何でも聞いてください…")
        }
        mentions={mentions}
        commands={commands}
        harnessCommands={harnessCommands}
        plusItems={plusItems}
        pickers={pickers}
        attachments={pending.map((file) => ({
          name: `${file.name} · ${formatBytes(file.size)}`,
          size: file.size,
        }))}
        onRemoveAttachment={(index) =>
          setPending((current) => current.filter((_, i) => i !== index))
        }
        onSend={send}
        onDraftChange={setDraft}
        hint={hint}
        autoFocus={autoFocus}
        menuFooter={{
          at: modelToken
            ? cursorSuggestKind === "effort"
              ? "推論レベルを選んでください。未選択のまま送ると Medium になります"
              : `${PROVIDERS[modelToken.providerKind].label} のモデル · 推論はセレクトで選択 · @${modelToken.handle} だけなら CLI の既定モデル`
            : "エージェントかメンバーを選択 · @provider/ でモデル候補",
          dollar: "ハーネス固有の機能 · Codex $imagegen で画像生成",
        }}
      />
      <input
        ref={fileRef}
        type="file"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) {
            if (file.size > 20 * 1024 * 1024) {
              toast.error("20MB までのファイルを添付できます");
            } else {
              setPending((current) => [...current, file]);
            }
          }
          event.target.value = "";
        }}
      />
    </>
  );
}
