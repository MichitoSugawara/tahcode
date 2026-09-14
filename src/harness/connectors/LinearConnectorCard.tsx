import { useAction, useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { Check, Pencil, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { Button } from "@/components/atoms/Button";
import { Shimmer } from "@/components/atoms/Shimmer";
import { StatusPill } from "@/components/atoms/StatusPill";
import { useOrg } from "@/harness/OrgContext";
import { Dialog, SectionLabel, Well } from "@/harness/ui/Dialog";
import { Input } from "@/harness/ui/Field";
import { Notice } from "@/harness/ui/Notice";
import type {
  ConnectorCardLocalPhase,
  ConnectorCardPhase,
  ConnectorCatalogEntry,
  ConnectorScope,
} from "@/lib/connectorCard";
import {
  CONNECTOR_CARD_COPY,
  LINEAR_CONNECTOR,
  connectorAccountCountLabel,
  connectorAccountLabel,
  connectorStatusLabel,
  connectorStatusTone,
  connectionsForProvider,
  isPendingConnectorAccountId,
  linearConnectReturnConnectionId,
  linearConnectReturnScope,
  marketplaceConnectorPhase,
  providerIconSource,
  resolveConnectorCardPhase,
  shouldShowAddAnotherAccount,
  shouldStartOauthFromMarketplace,
  stripLinearConnectReturnSearch,
} from "@/lib/connectorCard";
import { errorSummary } from "@/lib/format";

import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

type Connection = FunctionReturnType<
  typeof api.connectorConnections.listByOrg
>[number];

const LINEAR_CONNECT_POLL_MS = 2000;
const LINEAR_CONNECT_MAX_POLLS = 15;

function parseReturnConnectionId(
  search: string
): Id<"connectorConnections"> | undefined {
  const raw = linearConnectReturnConnectionId(search);
  if (!raw) {
    return;
  }
  return raw as Id<"connectorConnections">;
}

function useLinearConnectReturn({
  enabled,
  orgId,
  scope,
  setConfirming,
  setDetailOpen,
  setLocalPhase,
  setWaitingConnectionId,
}: {
  enabled: boolean;
  orgId: Id<"orgs">;
  scope: ConnectorScope;
  setConfirming: (value: boolean) => void;
  setDetailOpen: (open: boolean) => void;
  setLocalPhase: (phase: ConnectorCardLocalPhase) => void;
  setWaitingConnectionId: (
    value: Id<"connectorConnections"> | undefined
  ) => void;
}) {
  const completeConnect = useAction(api.connectorConnect.completeLinearConnect);
  const location = useLocation();
  const navigate = useNavigate();
  const returningScope = linearConnectReturnScope(location.search);
  const returningConnectionId = parseReturnConnectionId(location.search);

  useEffect(() => {
    if (!enabled || returningScope !== scope) {
      return;
    }
    let cancelled = false;
    let polls = 0;
    let timer: ReturnType<typeof window.setTimeout> | undefined;
    const finishSearch = stripLinearConnectReturnSearch(location.search);
    const clearReturnQuery = () => {
      navigate(
        {
          pathname: location.pathname,
          search: finishSearch,
        },
        { replace: true }
      );
    };
    setDetailOpen(true);
    if (returningConnectionId) {
      setWaitingConnectionId(returningConnectionId);
    }
    const run = async () => {
      setConfirming(true);
      setLocalPhase("waiting");
      try {
        const completeArgs: {
          connectionId?: Id<"connectorConnections">;
          orgId: Id<"orgs">;
          scope: ConnectorScope;
        } = { orgId, scope };
        if (returningConnectionId) {
          completeArgs.connectionId = returningConnectionId;
        }
        const result = await completeConnect(completeArgs);
        if (cancelled) {
          return;
        }
        if (result.status === "pending" && polls < LINEAR_CONNECT_MAX_POLLS) {
          polls += 1;
          timer = window.setTimeout(() => {
            void run();
          }, LINEAR_CONNECT_POLL_MS);
          return;
        }
        if (result.status === "connected") {
          setLocalPhase("idle");
          setWaitingConnectionId(undefined);
          toast.success("Linear を接続しました");
        } else {
          setLocalPhase("failed");
          toast.error("Linear の認証を確認できませんでした");
        }
        setConfirming(false);
        clearReturnQuery();
      } catch (error: unknown) {
        if (cancelled) {
          return;
        }
        setConfirming(false);
        setLocalPhase("failed");
        toast.error("Linear の認証を確認できませんでした", {
          description: errorSummary(error),
        });
        clearReturnQuery();
      }
    };
    void run();
    return () => {
      cancelled = true;
      if (timer !== undefined) {
        window.clearTimeout(timer);
      }
    };
  }, [
    completeConnect,
    enabled,
    location.pathname,
    location.search,
    navigate,
    orgId,
    returningConnectionId,
    returningScope,
    scope,
    setConfirming,
    setDetailOpen,
    setLocalPhase,
    setWaitingConnectionId,
  ]);
}

function ConnectorProviderIcon({
  catalog,
}: {
  catalog: ConnectorCatalogEntry;
}) {
  const src = providerIconSource(catalog);
  if (!src) {
    return (
      <span
        aria-hidden
        className="bg-inset text-ink-2 flex size-9 shrink-0 items-center justify-center rounded-[10px] text-[13px] font-medium"
      >
        {catalog.displayName.slice(0, 1)}
      </span>
    );
  }
  return (
    <img
      src={src}
      alt=""
      width={36}
      height={36}
      className="size-9 shrink-0 rounded-[10px] object-cover"
    />
  );
}

function ConnectorMarketplaceRow({
  catalog,
  connections,
  onOpen,
}: {
  catalog: ConnectorCatalogEntry;
  connections: Connection[];
  onOpen: () => void;
}) {
  const phase = marketplaceConnectorPhase(
    connections.map((connection) => connection.status)
  );
  const countLabel = connectorAccountCountLabel(connections.length);
  const description = countLabel ?? catalog.description;

  return (
    <button
      type="button"
      className="connector-marketplace-row flex w-full items-center gap-3 py-2.5 text-left"
      /* Grok marketplace / sand-connector-card__header: one provider row
       * opens the account detail; CTA stays on the header, not stacked. */
      onClick={onOpen}
    >
      <ConnectorProviderIcon catalog={catalog} />
      <div className="connector-card-text min-w-0 flex-1">
        <h3 className="text-ink truncate text-[13px] font-medium">
          {catalog.displayName}
        </h3>
        <p className="text-ink-3 mt-0.5 truncate text-[12px] leading-snug">
          {description}
        </p>
      </div>
      <div className="connector-card-actions flex shrink-0 items-center gap-2">
        {phase === "connected" ? (
          <span
            className="text-ink-2 inline-flex items-center gap-1 text-[12.5px]"
            role="status"
          >
            <Check aria-hidden size={14} strokeWidth={2.5} />
            {CONNECTOR_CARD_COPY.connected}
          </span>
        ) : null}
        {phase === "needsAuth" ? (
          <StatusPill tone="orange">{CONNECTOR_CARD_COPY.needsAuth}</StatusPill>
        ) : null}
        {phase === "add" ? (
          <span className="text-ink-2 text-[12.5px]">
            {CONNECTOR_CARD_COPY.add}
          </span>
        ) : null}
      </div>
    </button>
  );
}

function ConnectorChatRow({
  canAdd,
  catalog,
  connections,
  localPhase,
  onAdd,
  onAuthorize,
  onOpen,
  onReopen,
  preferredScope,
}: {
  canAdd: boolean;
  catalog: ConnectorCatalogEntry;
  connections: Connection[];
  localPhase: ConnectorCardLocalPhase;
  onAdd: () => void;
  onAuthorize: () => void;
  onOpen: () => void;
  onReopen: () => void;
  preferredScope: ConnectorScope;
}) {
  const scoped = connections.filter(
    (connection) => connection.scope === preferredScope
  );
  const primary =
    scoped.find((connection) => connection.status === "connected") ?? scoped[0];
  const phase = resolveConnectorCardPhase({
    hasConnection: primary !== undefined,
    localPhase,
    status: primary?.status,
  });
  const countLabel = connectorAccountCountLabel(connections.length);
  const description = countLabel ?? catalog.description;
  const showTeam = preferredScope === "org";

  return (
    <article className="connector-marketplace-row connector-chat-card flex items-center gap-3 py-2.5">
      <ConnectorProviderIcon catalog={catalog} />
      <button
        type="button"
        className="connector-card-text min-w-0 flex-1 text-left"
        onClick={onOpen}
      >
        <div className="text-ink flex items-center gap-1.5 text-[13px] font-medium">
          <h3 className="truncate">{catalog.displayName}</h3>
          {showTeam ? (
            <span className="bg-inset text-ink-3 shrink-0 rounded-[4px] px-1 text-[10.5px] font-medium">
              {CONNECTOR_CARD_COPY.team}
            </span>
          ) : (
            <span className="bg-inset text-ink-3 shrink-0 rounded-[4px] px-1 text-[10.5px] font-medium">
              {CONNECTOR_CARD_COPY.personal}
            </span>
          )}
        </div>
        <p className="text-ink-3 mt-0.5 truncate text-[12px] leading-snug">
          {description}
        </p>
      </button>
      <ConnectorChatActions
        canAdd={canAdd}
        displayName={catalog.displayName}
        phase={phase}
        onAdd={onAdd}
        onAuthorize={onAuthorize}
        onReopen={onReopen}
      />
    </article>
  );
}

function ConnectorChatActions({
  canAdd,
  displayName,
  onAdd,
  onAuthorize,
  onReopen,
  phase,
}: {
  canAdd: boolean;
  displayName: string;
  onAdd: () => void;
  onAuthorize: () => void;
  onReopen: () => void;
  phase: ConnectorCardPhase;
}) {
  if (phase === "connected") {
    return (
      <div className="connector-card-actions flex shrink-0 items-center gap-2">
        <span
          className="text-ink-2 inline-flex items-center gap-1 text-[12.5px]"
          role="status"
        >
          <Check aria-hidden size={14} strokeWidth={2.5} />
          {CONNECTOR_CARD_COPY.connected}
        </span>
      </div>
    );
  }

  if (phase === "waiting") {
    return (
      <div className="connector-card-actions flex max-w-[15rem] shrink-0 flex-col items-end gap-1 text-right">
        <span className="text-ink-2 text-[12px] leading-snug" role="status">
          {CONNECTOR_CARD_COPY.waiting(displayName)}
        </span>
        <Button type="button" size="xs" variant="secondary" onClick={onReopen}>
          {CONNECTOR_CARD_COPY.reopen}
        </Button>
      </div>
    );
  }

  if (phase === "retry") {
    return (
      <div className="connector-card-actions flex max-w-[15rem] shrink-0 flex-col items-end gap-1 text-right">
        <span className="text-ink-2 text-[12px] leading-snug" role="status">
          {CONNECTOR_CARD_COPY.retryHint(displayName)}
        </span>
        <Button type="button" size="xs" variant="accent" onClick={onReopen}>
          {CONNECTOR_CARD_COPY.retry}
        </Button>
      </div>
    );
  }

  if (!canAdd) {
    return null;
  }

  return (
    <div className="connector-card-actions flex shrink-0 items-center gap-2">
      <Button
        type="button"
        size="xs"
        variant="accent"
        onClick={phase === "add" ? onAdd : onAuthorize}
      >
        {phase === "add"
          ? CONNECTOR_CARD_COPY.add
          : CONNECTOR_CARD_COPY.authorize}
      </Button>
    </div>
  );
}

function ConnectorAccountRow({
  busy,
  canManage,
  connection,
  onAuthorize,
  onCancelWait,
  onRemove,
  onRename,
  onReopen,
  waiting,
}: {
  busy: boolean;
  canManage: boolean;
  connection: Connection;
  onAuthorize: () => void;
  onCancelWait: () => void;
  onRemove: () => void;
  onRename: (displayLabel: string) => Promise<void>;
  onReopen: () => void;
  waiting: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(connection.displayLabel ?? "");
  const [saving, setSaving] = useState(false);
  const label = connectorAccountLabel(connection.displayLabel);
  const showAuthorize = canManage && connection.status !== "connected";

  useEffect(() => {
    if (!editing) {
      setDraft(connection.displayLabel ?? "");
    }
  }, [connection.displayLabel, editing]);

  const commitRename = async () => {
    if (saving) {
      return;
    }
    const next = draft.trim();
    const previous = connection.displayLabel?.trim() ?? "";
    setEditing(false);
    if (next === previous) {
      return;
    }
    setSaving(true);
    try {
      await onRename(next);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="border-line flex items-center gap-3 border-b px-3 py-2.5 last:border-b-0">
      <div className="min-w-0 flex-1">
        {editing ? (
          <Input
            aria-label={CONNECTOR_CARD_COPY.rename}
            autoFocus
            className="h-7 px-2"
            disabled={busy || saving}
            placeholder={CONNECTOR_CARD_COPY.renamePlaceholder}
            value={draft}
            onBlur={() => {
              void commitRename();
            }}
            onChange={(event) => {
              setDraft(event.target.value);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void commitRename();
              }
              if (event.key === "Escape") {
                event.preventDefault();
                setDraft(connection.displayLabel ?? "");
                setEditing(false);
              }
            }}
          />
        ) : (
          <div className="text-ink flex items-center gap-1.5 text-[13px] font-medium">
            <span className="truncate">{label}</span>
            {canManage ? (
              <button
                type="button"
                aria-label={CONNECTOR_CARD_COPY.rename}
                className="text-ink-3 hover:text-ink shrink-0 rounded-[4px] p-0.5"
                disabled={busy || saving || waiting}
                onClick={() => {
                  setEditing(true);
                }}
              >
                <Pencil aria-hidden size={12} strokeWidth={2.2} />
              </button>
            ) : null}
            {connection.scope === "org" ? (
              <span className="bg-inset text-ink-3 shrink-0 rounded-[4px] px-1 text-[10.5px] font-medium">
                {CONNECTOR_CARD_COPY.team}
              </span>
            ) : (
              <span className="bg-inset text-ink-3 shrink-0 rounded-[4px] px-1 text-[10.5px] font-medium">
                {CONNECTOR_CARD_COPY.personal}
              </span>
            )}
          </div>
        )}
      </div>
      {waiting ? (
        <StatusPill tone="orange">{CONNECTOR_CARD_COPY.needsAuth}</StatusPill>
      ) : (
        <StatusPill tone={connectorStatusTone(connection.status)}>
          {connectorStatusLabel(connection.status)}
        </StatusPill>
      )}
      {waiting ? (
        <>
          <Button
            type="button"
            size="xs"
            variant="accent"
            disabled={busy}
            onClick={onReopen}
          >
            {CONNECTOR_CARD_COPY.reopen}
          </Button>
          <Button
            type="button"
            size="xs"
            variant="quiet"
            disabled={busy}
            onClick={onCancelWait}
          >
            {CONNECTOR_CARD_COPY.cancelWait}
          </Button>
        </>
      ) : (
        <>
          {showAuthorize ? (
            <Button
              type="button"
              size="xs"
              variant="accent"
              disabled={busy}
              onClick={onAuthorize}
            >
              {CONNECTOR_CARD_COPY.authorize}
            </Button>
          ) : null}
          {canManage ? (
            <button
              type="button"
              aria-label={CONNECTOR_CARD_COPY.removeAccount(label)}
              className="text-red hover:bg-red-tint shrink-0 rounded-[6px] p-1 disabled:opacity-50"
              disabled={busy || saving}
              onClick={onRemove}
            >
              <Trash2 aria-hidden size={14} strokeWidth={2.2} />
            </button>
          ) : null}
        </>
      )}
    </div>
  );
}

function ConnectorDetailDialog({
  actorUserId,
  catalog,
  confirming,
  connections,
  isAdmin,
  localPhase,
  onAddAccount,
  onAuthorize,
  onCancelWait,
  onOpenChange,
  onRemove,
  onRename,
  onReopen,
  open,
  waitingConnectionId,
}: {
  actorUserId: Id<"users">;
  catalog: ConnectorCatalogEntry;
  confirming: boolean;
  connections: Connection[];
  isAdmin: boolean;
  localPhase: ConnectorCardLocalPhase;
  onAddAccount: (scope: ConnectorScope) => void;
  onAuthorize: (connection: Connection) => void;
  onCancelWait: (connection: Connection) => void;
  onOpenChange: (open: boolean) => void;
  onRemove: (connection: Connection) => void;
  onRename: (connection: Connection, displayLabel: string) => Promise<void>;
  onReopen: (connection: Connection) => void;
  open: boolean;
  waitingConnectionId?: Id<"connectorConnections">;
}) {
  const [pendingRemove, setPendingRemove] = useState<Connection | null>(null);
  const waiting = localPhase === "waiting";
  const failed = localPhase === "failed";

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={onOpenChange}
        width={560}
        title={
          <span className="flex items-center gap-2.5">
            <ConnectorProviderIcon catalog={catalog} />
            {catalog.displayName}
          </span>
        }
        description={catalog.description}
      >
        <section className="connector-detail-accounts">
          <SectionLabel>{CONNECTOR_CARD_COPY.accounts}</SectionLabel>
          <Well>
            {connections.map((connection) => {
              const canManageRow =
                isAdmin || String(connection.userId) === String(actorUserId);
              const rowWaiting =
                waiting &&
                waitingConnectionId !== undefined &&
                String(waitingConnectionId) === String(connection._id);
              return (
                <ConnectorAccountRow
                  key={String(connection._id)}
                  busy={confirming}
                  canManage={canManageRow}
                  connection={connection}
                  waiting={rowWaiting}
                  onAuthorize={() => {
                    onAuthorize(connection);
                  }}
                  onCancelWait={() => {
                    onCancelWait(connection);
                  }}
                  onRemove={() => {
                    setPendingRemove(connection);
                  }}
                  onRename={async (displayLabel) => {
                    await onRename(connection, displayLabel);
                  }}
                  onReopen={() => {
                    onReopen(connection);
                  }}
                />
              );
            })}
            <div className="px-3 py-2.5">
              {shouldShowAddAnotherAccount(connections) ? (
                <button
                  type="button"
                  className="text-ink-2 hover:text-ink text-[13px] disabled:opacity-50"
                  disabled={confirming || waiting}
                  onClick={() => {
                    onAddAccount(isAdmin ? "org" : "user");
                  }}
                >
                  {CONNECTOR_CARD_COPY.addAnotherAccount}
                </button>
              ) : null}
              {connections.length === 0 && !waiting ? (
                <>
                  <Button
                    type="button"
                    size="sm"
                    variant="accent"
                    disabled={confirming}
                    onClick={() => {
                      onAddAccount(isAdmin ? "org" : "user");
                    }}
                  >
                    {CONNECTOR_CARD_COPY.authorize}
                  </Button>
                  <p className="text-ink-3 mt-1 text-[12px]">
                    {CONNECTOR_CARD_COPY.authorizeHint}
                  </p>
                </>
              ) : null}
              {waiting ? (
                <p className="text-ink-3 mt-1 text-[12px]" role="status">
                  {confirming
                    ? CONNECTOR_CARD_COPY.confirming(catalog.displayName)
                    : CONNECTOR_CARD_COPY.waiting(catalog.displayName)}
                </p>
              ) : null}
              {failed ? (
                <p className="text-ink-3 mt-1 text-[12px]" role="status">
                  {CONNECTOR_CARD_COPY.retryHint(catalog.displayName)}
                </p>
              ) : null}
            </div>
          </Well>
        </section>
      </Dialog>

      <Dialog
        open={pendingRemove !== null}
        onOpenChange={(next) => {
          if (!next) {
            setPendingRemove(null);
          }
        }}
        title={`${catalog.displayName} を削除しますか？`}
        description={
          pendingRemove?.scope === "org"
            ? "このアカウントの org 連携だけを削除します。他の Linear アカウントは残ります。"
            : "このアカウントの個人連携だけを削除します。他の Linear アカウントは残ります。"
        }
        footer={
          <>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => {
                setPendingRemove(null);
              }}
            >
              キャンセル
            </Button>
            <Button
              type="button"
              size="sm"
              variant="danger"
              disabled={confirming}
              onClick={() => {
                if (!pendingRemove) {
                  return;
                }
                onRemove(pendingRemove);
                setPendingRemove(null);
              }}
            >
              {CONNECTOR_CARD_COPY.remove}
            </Button>
          </>
        }
      >
        <p className="text-ink-2 text-[13px] leading-relaxed">
          {pendingRemove
            ? `${connectorAccountLabel(pendingRemove.displayLabel)} — ${CONNECTOR_CARD_COPY.removeDetail}`
            : CONNECTOR_CARD_COPY.removeDetail}
        </p>
      </Dialog>
    </>
  );
}

export function LinearConnectorCard({
  preferredScope = "org",
  variant = "marketplace",
}: {
  preferredScope?: ConnectorScope;
  variant?: "chat" | "marketplace";
}) {
  const { org, isAdmin, me } = useOrg();
  const connections = useQuery(api.connectorConnections.listByOrg, {
    orgId: org._id,
    provider: LINEAR_CONNECTOR.provider,
  });
  const linearConnections = connectionsForProvider(
    connections ?? [],
    LINEAR_CONNECTOR.provider
  );
  const location = useLocation();
  const returningScope = linearConnectReturnScope(location.search);
  const canAddPreferred = preferredScope === "user" || isAdmin;
  const [detailOpen, setDetailOpen] = useState(false);
  const [localPhase, setLocalPhase] = useState<ConnectorCardLocalPhase>("idle");
  const [confirming, setConfirming] = useState(false);
  const [waitingConnectionId, setWaitingConnectionId] = useState<
    Id<"connectorConnections"> | undefined
  >();
  const startConnect = useAction(api.connectorConnect.startLinearConnect);
  const renameConnection = useMutation(api.connectorConnections.rename);
  const removeConnection = useMutation(api.connectorConnections.remove);

  useLinearConnectReturn({
    enabled: returningScope !== null,
    orgId: org._id,
    scope: returningScope ?? "org",
    setConfirming,
    setDetailOpen,
    setLocalPhase,
    setWaitingConnectionId,
  });

  const runStart = async (
    scope: ConnectorScope,
    connectionId?: Id<"connectorConnections">
  ) => {
    if (!isAdmin && scope === "org") {
      return;
    }
    setDetailOpen(true);
    setLocalPhase("waiting");
    try {
      const startArgs: {
        connectionId?: Id<"connectorConnections">;
        orgId: Id<"orgs">;
        returnOrigin: string;
        returnPath?: string;
        scope: ConnectorScope;
      } = {
        orgId: org._id,
        returnOrigin: window.location.origin,
        returnPath: location.pathname,
        scope,
      };
      if (connectionId) {
        startArgs.connectionId = connectionId;
      }
      const result = await startConnect(startArgs);
      if (result.connectionId) {
        setWaitingConnectionId(result.connectionId);
      }
      if (result.ready && result.authorizeUrl) {
        window.location.assign(result.authorizeUrl);
        return;
      }
      setLocalPhase("failed");
      if (!result.connectionId) {
        setWaitingConnectionId(undefined);
      }
      toast.message(
        result.reason === "oauth_not_configured"
          ? CONNECTOR_CARD_COPY.notConfigured
          : CONNECTOR_CARD_COPY.authorizeHint
      );
    } catch (error: unknown) {
      setLocalPhase("failed");
      toast.error("Linear の接続を開始できませんでした", {
        description: errorSummary(error),
      });
    }
  };

  const runRename = async (connection: Connection, displayLabel: string) => {
    try {
      const renameArgs: {
        connectionId: Id<"connectorConnections">;
        displayLabel?: string;
      } = { connectionId: connection._id };
      if (displayLabel.length > 0) {
        renameArgs.displayLabel = displayLabel;
      }
      await renameConnection(renameArgs);
    } catch (error: unknown) {
      toast.error("名前の変更に失敗しました", {
        description: errorSummary(error),
      });
    }
  };

  const runRemove = async (connection: Connection) => {
    try {
      await removeConnection({ connectionId: connection._id });
      if (String(waitingConnectionId) === String(connection._id)) {
        setWaitingConnectionId(undefined);
        setLocalPhase("idle");
      }
      toast.success("Linear アカウントを削除しました");
    } catch (error: unknown) {
      toast.error("削除に失敗しました", {
        description: errorSummary(error),
      });
    }
  };

  const runCancelWait = async (connection: Connection) => {
    setLocalPhase("idle");
    setConfirming(false);
    setWaitingConnectionId(undefined);
    if (isPendingConnectorAccountId(connection.connectedAccountId)) {
      try {
        await removeConnection({ connectionId: connection._id });
      } catch (error: unknown) {
        toast.error("キャンセルに失敗しました", {
          description: errorSummary(error),
        });
      }
    }
  };

  return (
    <div className="flex flex-col gap-2">
      {connections === undefined ? (
        <div className="px-0 py-2 text-[13px]">
          <Shimmer>コネクタを読み込んでいます</Shimmer>
        </div>
      ) : null}

      {connections !== undefined && variant === "marketplace" ? (
        <div className="connector-marketplace grid grid-cols-1 gap-x-12 md:grid-cols-2">
          <ConnectorMarketplaceRow
            catalog={LINEAR_CONNECTOR}
            connections={linearConnections}
            onOpen={() => {
              if (shouldStartOauthFromMarketplace(linearConnections)) {
                void runStart(isAdmin ? "org" : "user");
                return;
              }
              setDetailOpen(true);
            }}
          />
        </div>
      ) : null}

      {connections !== undefined && variant === "chat" ? (
        <ConnectorChatRow
          canAdd={canAddPreferred}
          catalog={LINEAR_CONNECTOR}
          connections={linearConnections}
          localPhase={localPhase}
          preferredScope={preferredScope}
          onAdd={() => {
            void runStart(preferredScope);
          }}
          onAuthorize={() => {
            const target = linearConnections.find((connection) => {
              if (connection.scope !== preferredScope) {
                return false;
              }
              if (connection.status === "connected") {
                return false;
              }
              return isAdmin || String(connection.userId) === String(me._id);
            });
            if (target) {
              void runStart(target.scope, target._id);
              return;
            }
            if (canAddPreferred) {
              void runStart(preferredScope);
              return;
            }
            setDetailOpen(true);
          }}
          onOpen={() => {
            setDetailOpen(true);
          }}
          onReopen={() => {
            if (waitingConnectionId) {
              const waiting = linearConnections.find(
                (connection) =>
                  String(connection._id) === String(waitingConnectionId)
              );
              void runStart(
                waiting?.scope ?? preferredScope,
                waitingConnectionId
              );
              return;
            }
            void runStart(preferredScope);
          }}
        />
      ) : null}

      <ConnectorDetailDialog
        actorUserId={me._id}
        catalog={LINEAR_CONNECTOR}
        confirming={confirming}
        connections={linearConnections}
        isAdmin={isAdmin}
        localPhase={localPhase}
        open={detailOpen}
        waitingConnectionId={waitingConnectionId}
        onAddAccount={(scope) => {
          void runStart(scope);
        }}
        onAuthorize={(connection) => {
          void runStart(connection.scope, connection._id);
        }}
        onCancelWait={(connection) => {
          void runCancelWait(connection);
        }}
        onOpenChange={setDetailOpen}
        onRemove={(connection) => {
          void runRemove(connection);
        }}
        onRename={runRename}
        onReopen={(connection) => {
          void runStart(connection.scope, connection._id);
        }}
      />

      {variant === "marketplace" && !isAdmin ? (
        <Notice
          tone="locked"
          title="Org 連携の追加と切断は Owner / Admin の操作です"
        >
          あなたは Member です。接続状態は見られますが、Team
          連携の認証はできません。
        </Notice>
      ) : null}
      {variant === "chat" && !canAddPreferred ? (
        <p className="text-ink-3 px-1 text-[11px] leading-snug">
          {CONNECTOR_CARD_COPY.chatMemberHint}
        </p>
      ) : null}
    </div>
  );
}
