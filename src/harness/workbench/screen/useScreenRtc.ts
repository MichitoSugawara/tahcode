import {
  parseScreenRtcSdp,
  sanitizeScreenRtcIce,
  sanitizeScreenRtcPeerId,
  SCREEN_RTC_STUN_URLS,
} from "@shared/workbenchScreenRtc.ts";
import { useMutation, useQuery } from "convex/react";
import { useEffect, useRef, useState } from "react";

import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";

function newPeerId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `tah-${crypto.randomUUID()}`;
  }
  return `tah-${Math.random().toString(36).slice(2, 12)}`;
}

export function useScreenRtc(input: {
  enabled: boolean;
  sessionId: Id<"screenSessions"> | null;
}): {
  error?: string;
  rtcSessionId: Id<"screenRtcSessions"> | null;
  stream: MediaStream | null;
} {
  const openRtc = useMutation(api.workbenchScreenRtc.open);
  const closeRtc = useMutation(api.workbenchScreenRtc.close);
  const enqueueIce = useMutation(api.workbenchScreenRtc.enqueueIce);
  const [rtcSessionId, setRtcSessionId] =
    useState<Id<"screenRtcSessions"> | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [localError, setLocalError] = useState<string | undefined>();
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const seenIce = useRef(new Set<string>());
  const row = useQuery(
    api.workbenchScreenRtc.get,
    rtcSessionId ? { rtcSessionId } : "skip"
  );
  const remoteIce = useQuery(
    api.workbenchScreenRtc.listIce,
    rtcSessionId ? { rtcSessionId } : "skip"
  );

  useEffect(() => {
    const sessionId = input.sessionId;
    if (!input.enabled || !sessionId) {
      setRtcSessionId(null);
      setStream(null);
      setLocalError(undefined);
      return;
    }
    let cancelled = false;
    let openedId: Id<"screenRtcSessions"> | null = null;
    const peerId = sanitizeScreenRtcPeerId(newPeerId());
    if (!peerId) {
      setLocalError("ピア ID を作れませんでした。");
      return;
    }
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: [...SCREEN_RTC_STUN_URLS] }],
    });
    pcRef.current = pc;
    const seen = new Set<string>();
    seenIce.current = seen;
    pc.addTransceiver("video", { direction: "recvonly" });
    pc.ontrack = (event) => {
      const next = event.streams[0] ?? new MediaStream([event.track]);
      if (!cancelled) {
        setStream(next);
      }
    };
    const pendingIce: {
      candidate: string;
      sdpMLineIndex?: number;
      sdpMid?: string;
    }[] = [];
    pc.onicecandidate = (event) => {
      if (!event.candidate?.candidate) {
        return;
      }
      const clean = sanitizeScreenRtcIce({
        candidate: event.candidate.candidate,
        sdpMLineIndex: event.candidate.sdpMLineIndex ?? undefined,
        sdpMid: event.candidate.sdpMid ?? undefined,
      });
      if (!clean) {
        return;
      }
      pendingIce.push(clean);
    };

    void (async () => {
      try {
        const offer = await pc.createOffer();
        const offerSdp = parseScreenRtcSdp(offer.sdp ?? "");
        if (!offerSdp) {
          throw new Error("ブラウザが不正な offer を作りました。");
        }
        await pc.setLocalDescription(offer);
        const id = await openRtc({
          offerSdp,
          peerId,
          sessionId,
        });
        if (cancelled) {
          void closeRtc({ rtcSessionId: id });
          return;
        }
        openedId = id;
        setRtcSessionId(id);
        if (pendingIce.length > 0) {
          void enqueueIce({ events: pendingIce.splice(0), rtcSessionId: id });
        }
        pc.onicecandidate = (event) => {
          if (!event.candidate?.candidate) {
            return;
          }
          const clean = sanitizeScreenRtcIce({
            candidate: event.candidate.candidate,
            sdpMLineIndex: event.candidate.sdpMLineIndex ?? undefined,
            sdpMid: event.candidate.sdpMid ?? undefined,
          });
          if (!clean) {
            return;
          }
          void enqueueIce({ events: [clean], rtcSessionId: id });
        };
      } catch (error) {
        if (!cancelled) {
          setLocalError(error instanceof Error ? error.message : String(error));
        }
      }
    })();

    return () => {
      cancelled = true;
      pc.ontrack = null;
      pc.onicecandidate = null;
      pc.close();
      seen.clear();
      if (openedId) {
        void closeRtc({ rtcSessionId: openedId });
      }
    };
  }, [closeRtc, enqueueIce, input.enabled, input.sessionId, openRtc]);

  useEffect(() => {
    const pc = pcRef.current;
    const answerSdp = row?.answerSdp;
    if (!pc || !answerSdp || pc.remoteDescription) {
      return;
    }
    const parsed = parseScreenRtcSdp(answerSdp);
    if (!parsed) {
      return;
    }
    void pc.setRemoteDescription({ sdp: parsed, type: "answer" }).catch(() => {
      setLocalError("answer を適用できませんでした。");
    });
  }, [row?.answerSdp]);

  useEffect(() => {
    const pc = pcRef.current;
    if (!pc || !remoteIce) {
      return;
    }
    for (const item of remoteIce) {
      if (seenIce.current.has(item._id)) {
        continue;
      }
      seenIce.current.add(item._id);
      const clean = sanitizeScreenRtcIce({
        candidate: item.candidate,
        sdpMLineIndex: item.sdpMLineIndex,
        sdpMid: item.sdpMid,
      });
      if (!clean) {
        continue;
      }
      void pc.addIceCandidate({
        candidate: clean.candidate,
        sdpMLineIndex: clean.sdpMLineIndex,
        sdpMid: clean.sdpMid,
      });
    }
  }, [remoteIce]);

  return {
    error: localError ?? row?.error,
    rtcSessionId,
    stream,
  };
}
