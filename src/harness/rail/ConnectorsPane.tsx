import { useAction, useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/atoms/Button";
import { Shimmer } from "@/components/atoms/Shimmer";
import { StatusPill } from "@/components/atoms/StatusPill";
import { useOrg } from "@/harness/OrgContext";
import { Dialog } from "@/harness/ui/Dialog";
import { Notice } from "@/harness/ui/Notice";
import type {
  ConnectorCardLocalPhase,
  ConnectorScope,
} from "@/lib/connectorCard";
import {
  CONNECTOR_CARD_COPY,
  LINEAR_CONNECTOR,
  connectionMeta,
  connectorStatusLabel,
  connectorStatusTone,
  partitionConnectorConnections,
  resolveConnectorCardPhase,
} from "@/lib/connectorCard";
import { errorSummary, relativeTime } from "@/lib/format";

import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

type Connection = FunctionReturnType<
  typeof api.connectorConnections.listByOrg
>[number];

function LinearMark() {
  return (
    <span
      aria-hidden
      className="flex size-8 shrink-0 items-center justify-center rounded-[8px]"
      style={{ background: "#5E6AD2" }}
    >
      <svg
        className="size-4 text-white"
        fill="none"
        viewBox="0 0 16 16"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M3.2 10.4 10.4 3.2c.7-.7 1.9-.2 1.9.8v6.4c0 .4-.4.8-.8.8H5.1c-1 0-1.5-1.2-.8-1.9Z"
          fill="currentColor"
        />
      </svg>
    </span>
  );
}

function ConnectorCard({
  canManage,
  connection,
  now,
  orgId,
  scope,
}: {
  canManage: boolean;
  connection?: Connection;
  now: number;
  orgId: Id<"orgs">;
  scope: ConnectorScope;
}) {
  const startConnect = useAction(api.connectorConnect.startLinearConnect);
  const disconnect = useMutation(api.connectorConnections.disconnect);
  const [localPhase, setLocalPhase] = useState<ConnectorCardLocalPhase>("idle");
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  useEffect(() => {
    if (connection?.status === "connected") {
      setLocalPhase("idle");
    }
  }, [connection?.status]);
  const phase = resolveConnectorCardPhase({
    hasConnection: connection !== undefined,
    localPhase,
    status: connection?.status,
  });
  const catalog = LINEAR_CONNECTOR;
  const team = scope === "org";
  const meta = connection ? connectionMeta(connection) : "";
  const verified =
    connection?.lastVerifiedAt === undefined
      ? undefined
      : relativeTime(connection.lastVerifiedAt, now);

  const runStart = async () => {
    if (!canManage || busy) {
      return;
    }
    setBusy(true);
    setLocalPhase("waiting");
    try {
      const result = await startConnect({ orgId, scope });
      if (result.ready && result.authorizeUrl) {
        window.open(result.authorizeUrl, "_blank", "noopener,noreferrer");
        return;
      }
      setLocalPhase("failed");
      toast.message(
        result.reason === "oauth_not_configured"
          ? CONNECTOR_CARD_COPY.notConfigured
          : CONNECTOR_CARD_COPY.oauthPending
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
    <article className="rounded-card bg-surface shadow-card overflow-hidden">
      <div className="primitive-card-bar border-line flex items-start gap-3 border-b">
        <LinearMark />
        <div className="min-w-0 flex-1">
          <div className="text-ink flex flex-wrap items-center gap-1.5 text-[13px] font-medium">
            <h3 className="truncate">{catalog.displayName}</h3>
            {team ? (
              <span className="bg-inset text-ink-3 shrink-0 rounded-[4px] px-1 text-[10.5px] font-medium">
                {CONNECTOR_CARD_COPY.team}
              </span>
            ) : null}
            {connection ? (
              <StatusPill tone={connectorStatusTone(connection.status)}>
                {connectorStatusLabel(connection.status)}
              </StatusPill>
            ) : null}
          </div>
          <p className="text-ink-3 mt-0.5 text-[12px] leading-relaxed">
            {catalog.description}
          </p>
          {meta || verified ? (
            <p className="text-ink-3 mt-1 text-[11.5px]">
              {meta}
              {meta && verified ? " · " : ""}
              {verified ? `確認 ${verified}` : ""}
            </p>
          ) : null}
        </div>
      </div>

      {canManage && (phase !== "connected" || showDisconnect) ? (
        <div className="flex flex-col gap-2 px-3 py-2.5">
          {phase === "connected" && showDisconnect ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                size="xs"
                variant="quiet"
                disabled={busy}
                onClick={() => setConfirmOpen(true)}
              >
                {CONNECTOR_CARD_COPY.disconnect}
              </Button>
            </div>
          ) : null}

          {phase === "waiting" ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-ink-2 text-[12.5px]">
                {CONNECTOR_CARD_COPY.waiting(catalog.displayName)}
              </span>
              <Button
                type="button"
                size="xs"
                variant="secondary"
                disabled={busy}
                onClick={() => {
                  void runStart();
                }}
              >
                {CONNECTOR_CARD_COPY.reopen}
              </Button>
            </div>
          ) : null}

          {phase === "retry" ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-ink-2 text-[12.5px]">
                {CONNECTOR_CARD_COPY.retryHint(catalog.displayName)}
              </span>
              <Button
                type="button"
                size="xs"
                variant="accent"
                disabled={busy}
                onClick={() => {
                  void runStart();
                }}
              >
                {CONNECTOR_CARD_COPY.retry}
              </Button>
              {showDisconnect ? (
                <Button
                  type="button"
                  size="xs"
                  variant="quiet"
                  disabled={busy}
                  onClick={() => setConfirmOpen(true)}
                >
                  {CONNECTOR_CARD_COPY.disconnect}
                </Button>
              ) : null}
            </div>
          ) : null}

          {phase === "add" || phase === "authorize" ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                size="xs"
                variant="accent"
                disabled={busy}
                aria-busy={busy}
                onClick={() => {
                  void runStart();
                }}
              >
                {phase === "add"
                  ? CONNECTOR_CARD_COPY.add
                  : CONNECTOR_CARD_COPY.authorize}
              </Button>
              {showDisconnect ? (
                <Button
                  type="button"
                  size="xs"
                  variant="quiet"
                  disabled={busy}
                  onClick={() => setConfirmOpen(true)}
                >
                  {CONNECTOR_CARD_COPY.disconnect}
                </Button>
              ) : null}
            </div>
          ) : null}

          {phase === "connected" ? null : (
            <p className="text-ink-3 text-[11.5px] leading-relaxed">
              {CONNECTOR_CARD_COPY.oauthPending}
            </p>
          )}
        </div>
      ) : null}

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

export function ConnectorsPane() {
  const { org, isAdmin, now, me } = useOrg();
  const connections = useQuery(api.connectorConnections.listByOrg, {
    orgId: org._id,
    provider: LINEAR_CONNECTOR.provider,
  });
  const { extras, primary } = partitionConnectorConnections(
    connections ?? [],
    LINEAR_CONNECTOR.provider
  );

  return (
    <div className="flex flex-col gap-3">
      {connections === undefined ? (
        <div className="rounded-card bg-surface shadow-card px-3 py-3 text-[13px]">
          <Shimmer>コネクタを読み込んでいます</Shimmer>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <ConnectorCard
            canManage={isAdmin}
            connection={primary}
            now={now}
            orgId={org._id}
            scope="org"
          />
          {extras.map((connection) => (
            <ConnectorCard
              key={String(connection._id)}
              canManage={
                isAdmin || String(connection.userId) === String(me._id)
              }
              connection={connection}
              now={now}
              orgId={org._id}
              scope="user"
            />
          ))}
        </div>
      )}

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
