/**
 * The viewer's prediction balance, plus the two wallet commands: enroll and claim the daily reward.
 *
 * Reads only `GET /predictions/me/summary`, so a header never loads holdings. Owned by the
 * component that outlives the request: the hub layout (which stays mounted across its tabs) and the
 * detail page. Commands start from user events only.
 *
 * A claim keeps its request ID until the outcome is known. An uncertain failure (network, 5xx)
 * keeps it so "Retry" repeats the same command, which the API answers with the saved receipt. A 4xx
 * is a definite answer, so the attempt is dropped and a 409 refreshes the state it disagreed with.
 */

import { useCallback, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../lib/authContext";
import { ApiError, claimPredictionReward, enrollPredictions } from "../../lib/api";
import { pointsText } from "../../lib/predictionPoints";
import { queries, queryRoots } from "../../lib/queries";

interface ClaimAttempt { requestId: string; periodId: number }

export function usePredictionWallet() {
  const { profile, loading, login, refresh } = useAuth();
  const viewerId = loading ? null : profile?.id ?? null;
  const summary = useQuery(queries.predictionSummary(viewerId));
  const qc = useQueryClient();
  const [notice, setNotice] = useState<string | null>(null);
  const [claimAttempt, setClaimAttempt] = useState<ClaimAttempt | null>(null);
  const invalidate = useCallback(() => qc.invalidateQueries({ queryKey: queryRoots.predictions }), [qc]);

  const enrollment = useMutation({
    mutationFn: enrollPredictions,
    onSuccess: async result => {
      await invalidate();
      setNotice(`You have ${pointsText(result.spendable)} starting points.`);
    },
    onError: async error => {
      if (error instanceof ApiError && error.status === 401) await refresh();
    },
  });

  const claiming = useMutation({
    mutationFn: (attempt: ClaimAttempt) => claimPredictionReward(attempt.requestId, attempt.periodId),
    onSuccess: async result => {
      setClaimAttempt(null);
      await invalidate();
      setNotice(result.alreadyClaimed ? "Today's points were already claimed." : `You claimed ${pointsText(result.awarded)} points.`);
    },
    onError: async error => {
      if (!(error instanceof ApiError) || error.status >= 500) return;
      setClaimAttempt(null);
      if (error.status === 401) await refresh();
      if (error.status === 409) await invalidate();
    },
  });

  const claim = () => {
    const periodId = claimAttempt?.periodId ?? summary.data?.rewards?.periodId ?? null;
    if (periodId === null || claiming.isPending) return;
    const attempt = claimAttempt ?? { requestId: crypto.randomUUID(), periodId };
    setClaimAttempt(attempt);
    claiming.mutate(attempt);
  };
  const clearNotice = useCallback(() => setNotice(null), []);

  return {
    viewerId,
    signedIn: profile !== null && profile !== undefined,
    authLoading: loading,
    login,
    summary,
    enroll: () => enrollment.mutate(),
    enrolling: enrollment.isPending,
    enrollError: enrollment.error,
    claim,
    claiming: claiming.isPending,
    claimError: claiming.error,
    /** An uncertain claim failure: the next press repeats the same request. */
    claimRetry: claimAttempt !== null && !claiming.isPending,
    notice,
    clearNotice,
  };
}

export type PredictionWallet = ReturnType<typeof usePredictionWallet>;
