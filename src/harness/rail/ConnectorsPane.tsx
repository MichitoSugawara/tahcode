import { useAction, useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { Check } from "lucide-react";
import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { Button } from "@/components/atoms/Button";
import { Shimmer } from "@/components/atoms/Shimmer";
import { useOrg } from "@/harness/OrgContext";
import { Dialog } from "@/harness/ui/Dialog";
import { Notice } from "@/harness/ui/Notice";
import type {
  ConnectorCardLocalPhase,
  ConnectorCardPhase,
  ConnectorCatalogEntry,
  ConnectorScope,
} from "@/lib/connectorCard";
import {
  CONNECTOR_CARD_COPY,
  CONNECTOR_CATALOG,
  LINEAR_CONNECTOR,
  connectionMeta,
  filterConnectorCatalog,
  linearConnectReturnScope,
  partitionConnectorConnections,
  resolveConnectorCardPhase,
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

/** Official Linear logomark (perspective chevron). */
const LINEAR_MARK_PATH =
  "M1.22541 61.5228c-.2225-.9485.9463-1.4546 1.7022-.8004l39.3448 34.0541c.7837.678 1.9583.559 2.2459-.2481L83.639 5.425c.3163-.888-1.0114-1.49-1.716-1.0774L1.6906 60.1195c-.3904.2284-.5464.6602-.4652 1.4033z";

function useLinearConnectReturn({
  enabled,
  orgId,
  scope,
  setConfirming,
  setLocalPhase,
}: {
  enabled: boolean;
  orgId: Id<"orgs">;
  scope: ConnectorScope;
  setConfirming: (value: boolean) => void;
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
          toast.error("Linear の認可を確認できませんでした");
        }
        setConfirming(false);
        clearReturnQuery();
      } catch (error: unknown) {
        if (cancelled) {
          return;
        }
        setConfirming(false);
        setLocalPhase("failed");
        toast.error("Linear の認可を確認できませんでした", {
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
    setLocalPhase,
  ]);
}

function LinearMark() {
  return (
    <span
      aria-hidden
      className="flex size-9 shrink-0 items-center justify-center rounded-[10px]"
      style={{ background: "#5E6AD2" }}
    >
      <svg
        className="size-[18px] text-white"
        fill="currentColor"
        viewBox="0 0 100 100"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path d={LINEAR_MARK_PATH} />
      </svg>
    </span>
  );
}

/** Grok marketplace / `sand-connector-card__header`: action/status sits
 *  to the right of the text block, vertically centered on the row. */
function ConnectorRowActions({
  busy,
  canManage,
  confirming,
  displayName,
  onDisconnect,
  onStart,
  phase,
  showDisconnect,
}: {
  busy: boolean;
  canManage: boolean;
  confirming: boolean;
  displayName: string;
  onDisconnect: () => void;
  onStart: () => void;
  phase: ConnectorCardPhase;
  showDisconnect: boolean;
}) {
  const disconnectButton =
    canManage && showDisconnect ? (
      <Button
        type="button"
        size="xs"
        variant="quiet"
        disabled={busy}
        onClick={onDisconnect}
      >
        {CONNECTOR_CARD_COPY.disconnect}
      </Button>
    ) : null;

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
        {disconnectButton}
      </div>
    );
  }

  if (!canManage) {
    return null;
  }

  if (phase === "waiting") {
    return (
      <div className="connector-card-actions flex max-w-[15rem] shrink-0 flex-col items-end gap-1 text-right">
        <span className="text-ink-2 text-[12px] leading-snug" role="status">
          {confirming
            ? CONNECTOR_CARD_COPY.confirming(displayName)
            : CONNECTOR_CARD_COPY.waiting(displayName)}
        </span>
        <Button
          type="button"
          size="xs"
          variant="secondary"
          disabled={busy}
          onClick={onStart}
        >
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
        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="xs"
            variant="accent"
            disabled={busy}
            onClick={onStart}
          >
            {CONNECTOR_CARD_COPY.retry}
          </Button>
          {disconnectButton}
        </div>
      </div>
    );
  }

  return (
    <div className="connector-card-actions flex shrink-0 items-center gap-2">
      <Button
        type="button"
        size="xs"
        variant="accent"
        disabled={busy}
        aria-busy={busy}
        onClick={onStart}
      >
        {phase === "add"
          ? CONNECTOR_CARD_COPY.add
          : CONNECTOR_CARD_COPY.authorize}
      </Button>
      {disconnectButton}
    </div>
  );
}

function ConnectorRow({
  actorUserId,
  canManage,
  catalog,
  connection,
  orgId,
  scope,
}: {
  actorUserId: Id<"users">;
  canManage: boolean;
  catalog: ConnectorCatalogEntry;
  connection?: Connection;
  orgId: Id<"orgs">;
  scope: ConnectorScope;
}) {
  const startConnect = useAction(api.connectorConnect.startLinearConnect);
  const disconnect = useMutation(api.connectorConnections.disconnect);
  const [localPhase, setLocalPhase] = useState<ConnectorCardLocalPhase>("idle");
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  useLinearConnectReturn({
    enabled:
      canManage &&
      (scope === "org" || String(connection?.userId) === String(actorUserId)),
    orgId,
    scope,
    setConfirming,
    setLocalPhase,
  });
  useEffect(() => {
    if (connection?.status === "connected") {
      setLocalPhase("idle");
      setConfirming(false);
    }
  }, [connection?.status]);
  const phase = resolveConnectorCardPhase({
    hasConnection: connection !== undefined,
    localPhase,
    status: connection?.status,
  });
  const team = scope === "org";
  const meta = connection ? connectionMeta(connection) : "";
  const description = meta.length > 0 ? meta : catalog.description;

  const runStart = async () => {
    if (!canManage || busy) {
      return;
    }
    setBusy(true);
    setLocalPhase("waiting");
    try {
      const result = await startConnect({ orgId, scope });
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
    } finally {
      setBusy(false);
    }
  };

  const runDisconnect = async () => {
    if (!connection || !canManage || busy) {
      return;
    }
    setBusy(true);
    try {
      await disconnect({ connectionId: connection._id });
      setLocalPhase("idle");
      setConfirmOpen(false);
      toast.success("Linear を切断しました");
    } catch (error: unknown) {
      toast.error("切断に失敗しました", {
        description: errorSummary(error),
      });
    } finally {
      setBusy(false);
    }
  };

  const showDisconnect =
    canManage &&
    connection !== undefined &&
    connection.status !== "disconnected";

  return (
    <article className="connector-marketplace-row flex items-center gap-3 py-2.5">
      <LinearMark />
      <div className="connector-card-text min-w-0 flex-1">
        <div className="text-ink flex items-center gap-1.5 text-[13px] font-medium">
          <h3 className="truncate">{catalog.displayName}</h3>
          {team ? (
            <span className="bg-inset text-ink-3 shrink-0 rounded-[4px] px-1 text-[10.5px] font-medium">
              {CONNECTOR_CARD_COPY.team}
            </span>
          ) : null}
        </div>
        <p className="text-ink-3 mt-0.5 truncate text-[12px] leading-snug">
          {description}
        </p>
      </div>
      <ConnectorRowActions
        busy={busy}
        canManage={canManage}
        confirming={confirming}
        displayName={catalog.displayName}
        phase={phase}
        showDisconnect={showDisconnect}
        onDisconnect={() => setConfirmOpen(true)}
        onStart={() => {
          void runStart();
        }}
      />

      <Dialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={`${catalog.displayName} を切断しますか？`}
        description={
          team
            ? "この org の Linear 連携を切断します。状態は「切断済み」になり、再認可できます。"
            : "あなたの Linear 連携を切断します。状態は「切断済み」になり、再認可できます。"
        }
        footer={
          <>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => setConfirmOpen(false)}
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
          {CONNECTOR_CARD_COPY.disconnectDetail}
        </p>
      </Dialog>
    </article>
  );
}

export function ConnectorsPane({ query = "" }: { query?: string }) {
  const { org, isAdmin, me } = useOrg();
  const connections = useQuery(api.connectorConnections.listByOrg, {
    orgId: org._id,
    provider: LINEAR_CONNECTOR.provider,
  });
  const { extras, primary } = partitionConnectorConnections(
    connections ?? [],
    LINEAR_CONNECTOR.provider
  );
  const visibleCatalog = filterConnectorCatalog(CONNECTOR_CATALOG, query);
  const showLinear = visibleCatalog.some(
    (entry) => entry.provider === LINEAR_CONNECTOR.provider
  );

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
          <ConnectorRow
            actorUserId={me._id}
            canManage={isAdmin}
            catalog={LINEAR_CONNECTOR}
            connection={primary}
            orgId={org._id}
            scope="org"
          />
          {extras.map((connection) => (
            <ConnectorRow
              key={String(connection._id)}
              actorUserId={me._id}
              canManage={
                isAdmin || String(connection.userId) === String(me._id)
              }
              catalog={LINEAR_CONNECTOR}
              connection={connection}
              orgId={org._id}
              scope="user"
            />
          ))}
        </div>
      ) : null}

      {isAdmin ? null : (
        <Notice
          tone="locked"
          title="Org 連携の追加と切断は Owner / Admin の操作です"
        >
          あなたは Member です。接続状態は見られますが、Team
          連携の認可はできません。
        </Notice>
      )}
    </div>
  );
}
