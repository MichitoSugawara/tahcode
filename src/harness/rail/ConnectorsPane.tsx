import { useAction, useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { Check } from "lucide-react";
import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { Button } from "@/components/atoms/Button";
import { Shimmer } from "@/components/atoms/Shimmer";
import { StatusPill } from "@/components/atoms/StatusPill";
import { useOrg } from "@/harness/OrgContext";
import { Dialog, SectionLabel, Well } from "@/harness/ui/Dialog";
import { Notice } from "@/harness/ui/Notice";
import type {
  ConnectorCardLocalPhase,
  ConnectorCatalogEntry,
  ConnectorScope,
} from "@/lib/connectorCard";
import {
  CONNECTOR_CARD_COPY,
  CONNECTOR_CATALOG,
  LINEAR_CONNECTOR,
  connectorAccountCountLabel,
  connectorAccountLabel,
  connectorStatusLabel,
  connectorStatusTone,
  connectionsForProvider,
  filterConnectorCatalog,
  linearConnectReturnScope,
  marketplaceConnectorPhase,
  providerIconSource,
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

function useLinearConnectReturn({
  enabled,
  orgId,
  scope,
  setConfirming,
  setDetailOpen,
  setLocalPhase,
}: {
  enabled: boolean;
  orgId: Id<"orgs">;
  scope: ConnectorScope;
  setConfirming: (value: boolean) => void;
  setDetailOpen: (open: boolean) => void;
  setLocalPhase: (phase: ConnectorCardLocalPhase) => void;
}) {
  const completeConnect = useAction(api.connectorConnect.completeLinearConnect);
  const location = useLocation();
  const navigate = useNavigate();
  const returningScope = linearConnectReturnScope(location.search);

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
    const run = async () => {
      setConfirming(true);
      setLocalPhase("waiting");
      try {
        const result = await completeConnect({ orgId, scope });
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
    returningScope,
    scope,
    setConfirming,
    setDetailOpen,
    setLocalPhase,
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

function ConnectorDetailDialog({
  actorUserId,
  catalog,
  confirming,
  connections,
  isAdmin,
  localPhase,
  onAddAccount,
  onAuthorize,
  onOpenChange,
  open,
}: {
  actorUserId: Id<"users">;
  catalog: ConnectorCatalogEntry;
  confirming: boolean;
  connections: Connection[];
  isAdmin: boolean;
  localPhase: ConnectorCardLocalPhase;
  onAddAccount: (scope: ConnectorScope) => void;
  onAuthorize: (connection: Connection) => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [pendingDisconnect, setPendingDisconnect] = useState<Connection | null>(
    null
  );
  const disconnect = useMutation(api.connectorConnections.disconnect);
  const waiting = localPhase === "waiting";
  const failed = localPhase === "failed";

  const runDisconnect = async () => {
    if (!pendingDisconnect || busy) {
      return;
    }
    setBusy(true);
    try {
      await disconnect({ connectionId: pendingDisconnect._id });
      setPendingDisconnect(null);
      toast.success("Linear を切断しました");
    } catch (error: unknown) {
      toast.error("切断に失敗しました", {
        description: errorSummary(error),
      });
    } finally {
      setBusy(false);
    }
  };

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
              const label = connectorAccountLabel(connection.displayLabel);
              const canManageRow =
                isAdmin || String(connection.userId) === String(actorUserId);
              const showAuthorize =
                canManageRow && connection.status !== "connected";
              const showDisconnect =
                canManageRow && connection.status !== "disconnected";
              return (
                <div
                  key={String(connection._id)}
                  className="border-line flex items-center gap-3 border-b px-3 py-2.5 last:border-b-0"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-ink flex items-center gap-1.5 text-[13px] font-medium">
                      <span className="truncate">{label}</span>
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
                  </div>
                  <StatusPill tone={connectorStatusTone(connection.status)}>
                    {connectorStatusLabel(connection.status)}
                  </StatusPill>
                  {showAuthorize ? (
                    <Button
                      type="button"
                      size="xs"
                      variant="accent"
                      disabled={busy || waiting}
                      onClick={() => {
                        onAuthorize(connection);
                      }}
                    >
                      {CONNECTOR_CARD_COPY.authorize}
                    </Button>
                  ) : null}
                  {showDisconnect ? (
                    <Button
                      type="button"
                      size="xs"
                      variant="quiet"
                      disabled={busy}
                      onClick={() => {
                        setPendingDisconnect(connection);
                      }}
                    >
                      {CONNECTOR_CARD_COPY.disconnect}
                    </Button>
                  ) : null}
                </div>
              );
            })}
            {isAdmin ? (
              <div className="px-3 py-2.5">
                <button
                  type="button"
                  className="text-ink-2 hover:text-ink text-[13px] disabled:opacity-50"
                  disabled={busy || waiting}
                  onClick={() => {
                    onAddAccount(isAdmin ? "org" : "user");
                  }}
                >
                  {CONNECTOR_CARD_COPY.addAnotherAccount}
                </button>
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
            ) : null}
          </Well>
        </section>
      </Dialog>

      <Dialog
        open={pendingDisconnect !== null}
        onOpenChange={(next) => {
          if (!next) {
            setPendingDisconnect(null);
          }
        }}
        title={`${catalog.displayName} を切断しますか？`}
        description={
          pendingDisconnect?.scope === "org"
            ? "この org の Linear 連携を切断します。状態は「切断済み」になり、再認証できます。"
            : "あなたの Linear 連携を切断します。状態は「切断済み」になり、再認証できます。"
        }
        footer={
          <>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => {
                setPendingDisconnect(null);
              }}
            >
              キャンセル
            </Button>
            <Button
              type="button"
              size="sm"
              variant="danger"
              disabled={busy}
              onClick={() => {
                void runDisconnect();
              }}
            >
              {CONNECTOR_CARD_COPY.disconnect}
            </Button>
          </>
        }
      >
        <p className="text-ink-2 text-[13px] leading-relaxed">
          {pendingDisconnect
            ? `${connectorAccountLabel(pendingDisconnect.displayLabel)} — ${CONNECTOR_CARD_COPY.disconnectDetail}`
            : CONNECTOR_CARD_COPY.disconnectDetail}
        </p>
      </Dialog>
    </>
  );
}

export function ConnectorsPane({ query = "" }: { query?: string }) {
  const { org, isAdmin, me } = useOrg();
  const connections = useQuery(api.connectorConnections.listByOrg, {
    orgId: org._id,
    provider: LINEAR_CONNECTOR.provider,
  });
  const linearConnections = connectionsForProvider(
    connections ?? [],
    LINEAR_CONNECTOR.provider
  );
  const visibleCatalog = filterConnectorCatalog(CONNECTOR_CATALOG, query);
  const showLinear = visibleCatalog.some(
    (entry) => entry.provider === LINEAR_CONNECTOR.provider
  );
  const location = useLocation();
  const returningScope = linearConnectReturnScope(location.search);
  const [detailOpen, setDetailOpen] = useState(false);
  const [localPhase, setLocalPhase] = useState<ConnectorCardLocalPhase>("idle");
  const [confirming, setConfirming] = useState(false);
  const startConnect = useAction(api.connectorConnect.startLinearConnect);

  useLinearConnectReturn({
    enabled: returningScope !== null,
    orgId: org._id,
    scope: returningScope ?? "org",
    setConfirming,
    setDetailOpen,
    setLocalPhase,
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
      const result = await startConnect({
        connectionId,
        orgId: org._id,
        scope,
      });
      if (result.ready && result.authorizeUrl) {
        window.location.assign(result.authorizeUrl);
        return;
      }
      setLocalPhase("failed");
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

  return (
    <div className="flex flex-col gap-2">
      {connections === undefined ? (
        <div className="px-0 py-2 text-[13px]">
          <Shimmer>コネクタを読み込んでいます</Shimmer>
        </div>
      ) : null}

      {connections !== undefined && visibleCatalog.length === 0 ? (
        <p className="text-ink-3 py-6 text-center text-[13px]">
          {CONNECTOR_CARD_COPY.emptySearch}
        </p>
      ) : null}

      {connections !== undefined && showLinear ? (
        <div className="connector-marketplace grid grid-cols-1 gap-x-12 md:grid-cols-2">
          <ConnectorMarketplaceRow
            catalog={LINEAR_CONNECTOR}
            connections={linearConnections}
            onOpen={() => {
              setDetailOpen(true);
            }}
          />
        </div>
      ) : null}

      <ConnectorDetailDialog
        actorUserId={me._id}
        catalog={LINEAR_CONNECTOR}
        confirming={confirming}
        connections={linearConnections}
        isAdmin={isAdmin}
        localPhase={localPhase}
        open={detailOpen}
        onAddAccount={(scope) => {
          void runStart(scope);
        }}
        onAuthorize={(connection) => {
          void runStart(connection.scope, connection._id);
        }}
        onOpenChange={setDetailOpen}
      />

      {isAdmin ? null : (
        <Notice
          tone="locked"
          title="Org 連携の追加と切断は Owner / Admin の操作です"
        >
          あなたは Member です。接続状態は見られますが、Team
          連携の認証はできません。
        </Notice>
      )}
    </div>
  );
}
