/** Local preview state never enters the query cache or persistent browser storage. */
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ApiError, errorMessage, previewScoreboard, resendScoreboard, scoreboardPreviewImage,
  scoreboardRefusal, type ScoreboardDestination, type ScoreboardPreview, type ScoreboardResendStatus,
} from "../../lib/api";
import { queries, queryRoots } from "../../lib/queries";

type Phase = "idle" | "generating" | "preview_loading" | "preview_ready" | "preview_unavailable" |
  "preview_expired" | "sending" | "sent" | "unresolved" | "failed" | "refused";
interface RecoveryState {
  phase: Phase;
  preview: ScoreboardPreview | null;
  imageUrl: string | null;
  imageLoaded: boolean;
  // A send identity survives independently of the expiring display image.
  attemptPreviewId: string | null;
  message: string | null;
  inspectedDiscord: boolean;
}
const INITIAL: RecoveryState = {
  phase: "idle", preview: null, imageUrl: null, imageLoaded: false,
  attemptPreviewId: null, message: null, inspectedDiscord: false,
};
const FRESH_PREVIEW_CODES = ["preview_expired", "stale_preview", "stale_destination", "stale_revision", "not_configured"];
function sameDestination(current: ScoreboardDestination | null, pinned: ScoreboardDestination): boolean {
  return !!current && current.conf === pinned.conf && current.revision === pinned.revision &&
    current.webhookId === pinned.webhookId && current.guildId === pinned.guildId && current.channelId === pinned.channelId;
}
const OUTCOME_TEXT: Record<ScoreboardResendStatus, string> = {
  sent: "New scoreboard embed sent. The original message remains visible.",
  already_sent: "This preview was already delivered. The original message remains visible.",
  failed: "No message was definitively delivered. Retry this preview while it is valid, or generate and review another.",
  unknown: "Delivery unresolved. Inspect Discord before authorizing another embed. You can retry the exact request or refresh status.",
  in_progress: "Delivery unresolved. Inspect Discord before authorizing another embed. You can retry the exact request or refresh status.",
  preview_expired: "Preview expired or unavailable. Generate and review a fresh preview.",
  stale_preview: "Result or embed evidence changed. Generate and review a fresh preview.",
  stale_destination: "The results destination changed. Check its settings, then generate and review a fresh preview.",
  original_not_sent: "The original announcement is not recorded as successfully sent. Recovery is blocked.",
};

export function useScoreboardRecovery(matchId: number, viewerId: number) {
  const qc = useQueryClient();
  const status = useQuery(queries.scoreboardStatus(matchId, viewerId));
  const [state, setState] = useState<RecoveryState>(INITIAL);
  const active = useRef(true);
  const locked = useRef(false);
  const imageRequest = useRef<AbortController | null>(null);

  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      imageRequest.current?.abort();
    };
  }, []);
  useEffect(() => {
    const url = state.imageUrl;
    return () => { if (url) URL.revokeObjectURL(url); };
  }, [state.imageUrl]);
  useEffect(() => {
    const expiresAt = state.preview?.expiresAt;
    if (!expiresAt) return;
    // Recheck wall-clock time after background throttling, rather than decrementing a counter.
    const expire = () => {
      if (Date.now() < Date.parse(expiresAt)) return;
      setState(current => current.preview?.expiresAt !== expiresAt ? current : {
        ...current, preview: null, imageUrl: null, imageLoaded: false,
        phase: current.phase === "preview_ready" || current.phase === "preview_loading" ? "preview_expired" : current.phase,
      });
    };
    expire();
    const timer = setInterval(expire, 1000);
    window.addEventListener("focus", expire);
    return () => { clearInterval(timer); window.removeEventListener("focus", expire); };
  }, [state.preview?.expiresAt]);

  useEffect(() => {
    if (!state.preview || !status.data || status.isError || status.isFetching) return;
    if (sameDestination(status.data.destination, state.preview.destination)) return;
    setState(value => ({ ...value, preview: null, imageUrl: null, imageLoaded: false,
      // A status read never replaces the identity or outcome of an already-started send.
      phase: value.phase === "sending" || value.phase === "unresolved" || value.phase === "sent" ? value.phase : "refused",
      message: value.phase === "sending" || value.phase === "unresolved" || value.phase === "sent" ? value.message : OUTCOME_TEXT.stale_destination,
    }));
  }, [state.preview, status.data, status.isError, status.isFetching]);

  const refresh = () => qc.invalidateQueries({ queryKey: queryRoots.schedule });
  const applyOutcome = (outcome: ScoreboardResendStatus, error?: unknown) => {
    if (!active.current) return;
    const success = outcome === "sent" || outcome === "already_sent";
    const unresolved = outcome === "unknown" || outcome === "in_progress";
    const discard = FRESH_PREVIEW_CODES.includes(outcome) || outcome === "original_not_sent";
    setState(current => ({
      ...current,
      phase: success ? "sent" : unresolved ? "unresolved" : outcome === "failed" ? "failed" :
        outcome === "preview_expired" ? "preview_expired" : "refused",
      message: error ? `${errorMessage(error)}. ${OUTCOME_TEXT[outcome]}` : OUTCOME_TEXT[outcome],
      ...(discard ? { preview: null, imageUrl: null, imageLoaded: false } : {}),
      ...(unresolved ? { inspectedDiscord: false } : {}),
    }));
    if (success) toast.success(OUTCOME_TEXT[outcome]);
  };

  const generation = useMutation({
    mutationFn: async () => {
      const preview = await previewScoreboard(matchId);
      if (!active.current) return null;
      const controller = new AbortController();
      imageRequest.current = controller;
      const blob = await scoreboardPreviewImage(matchId, preview, { signal: controller.signal });
      return { preview, blob };
    },
    retry: false,
    gcTime: 0,
    onSuccess: result => {
      if (!active.current || !result) return;
      if (Date.now() >= Date.parse(result.preview.expiresAt)) {
        setState(current => ({ ...current, phase: "preview_expired" }));
        return;
      }
      const imageUrl = URL.createObjectURL(result.blob);
      setState(current => ({ ...current, phase: "preview_loading", preview: result.preview, imageUrl }));
    },
    onError: error => {
      if (!active.current) return;
      setState(current => ({ ...current, phase: "preview_unavailable", preview: null,
        imageUrl: null, imageLoaded: false, message: errorMessage(error) }));
    },
    onSettled: async () => {
      try { if (active.current) await refresh(); }
      finally { locked.current = false; }
    },
  });
  const delivery = useMutation({
    mutationFn: (previewId: string) => resendScoreboard(matchId, previewId),
    retry: false,
    gcTime: 0,
    onSuccess: outcome => applyOutcome(outcome),
    onError: error => {
      if (!active.current) return;
      const code = scoreboardRefusal(error);
      if (code === "failed" || code === "unknown" || code === "in_progress" ||
          code === "preview_expired" || code === "stale_preview" || code === "stale_destination" || code === "original_not_sent") {
        applyOutcome(code, error);
      } else if (code === "stale_revision" || code === "not_configured") {
        applyOutcome("stale_destination", error);
      } else if (error instanceof ApiError && error.status >= 400 && error.status < 500) {
        setState(current => ({ ...current, phase: "refused", preview: null, imageUrl: null,
          imageLoaded: false, message: errorMessage(error) }));
      } else {
        // Lost/aborted/invalid responses and generic 5xx cannot establish whether Discord delivered.
        applyOutcome("unknown", error);
      }
    },
    onSettled: async () => {
      try { if (active.current) await refresh(); }
      finally { locked.current = false; }
    },
  });

  // The history schema leaves status open-ended; unreadable/unknown outcomes need inspection too.
  const historyUnresolved = status.data?.resends.some(row => row.status !== "sent" && row.status !== "failed") ?? false;
  const needsInspection = (state.phase === "unresolved" || historyUnresolved) && !state.inspectedDiscord;
  const busy = generation.isPending || delivery.isPending;
  const currentStatus = !!status.data && !status.isError && !status.isFetching;
  const canGenerate = currentStatus && status.data?.eligibility === "ready" &&
    !!status.data.destination && status.data.browserConfigured === true && !busy && !needsInspection;
  const liveImage = !!state.preview && !!state.imageUrl && state.imageLoaded && Date.now() < Date.parse(state.preview.expiresAt);
  const canSend = currentStatus && status.data?.eligibility === "ready" && status.data.originalDelivery === "sent" &&
    liveImage && !!state.preview && sameDestination(status.data.destination, state.preview.destination) &&
    (state.phase === "preview_ready" || state.phase === "failed") && !busy;
  // An uncertain retry only asks about the original durable identity, even when its PNG has expired.
  const accessDenied = status.error instanceof ApiError && (status.error.status === 401 || status.error.status === 403);
  const canRetryUnresolved = state.phase === "unresolved" && !!state.attemptPreviewId && !busy && !accessDenied;

  return {
    state, status, busy, needsInspection, canGenerate, canSend, canRetryUnresolved,
    refresh,
    inspectDiscord: (checked: boolean) => setState(current => ({ ...current, inspectedDiscord: checked })),
    generate: () => {
      if (!canGenerate || locked.current) return;
      locked.current = true;
      setState(current => ({ ...INITIAL, inspectedDiscord: current.inspectedDiscord, phase: "generating" }));
      generation.mutate();
    },
    send: () => {
      if (!canSend || locked.current || !state.preview || Date.now() >= Date.parse(state.preview.expiresAt)) return;
      const previewId = state.attemptPreviewId ?? state.preview.previewId;
      locked.current = true;
      setState(current => ({ ...current, phase: "sending", attemptPreviewId: previewId, message: null }));
      delivery.mutate(previewId);
    },
    retryUnresolved: () => {
      if (!canRetryUnresolved || locked.current || !state.attemptPreviewId) return;
      locked.current = true;
      setState(current => ({ ...current, phase: "sending", message: null }));
      delivery.mutate(state.attemptPreviewId);
    },
    imageLoaded: (url: string) => setState(current => current.imageUrl !== url ? current : {
      ...current, imageLoaded: true, phase: current.phase === "preview_loading" ? "preview_ready" : current.phase,
    }),
    imageFailed: (url: string) => setState(current => current.imageUrl !== url ? current : {
      ...current, imageUrl: null, imageLoaded: false,
      phase: current.phase === "sending" || current.phase === "unresolved" || current.phase === "sent" ? current.phase : "preview_unavailable",
      message: "The scoreboard image could not load. Generate and review another preview before a new send.",
    }),
  };
}
