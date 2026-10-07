/**
 * Provision submission and which job the Discord panel follows.
 *
 * Every click sends a new `requestId`. Until an answer arrives the request stays in memory and in
 * `sessionStorage`; after a lost response (no answer, or a gateway failure that may hide one) the
 * panel offers an explicit resend of the same id and selection, which answers the job it created
 * rather than queuing the work twice. Other Provision starts wait until that request resolves.
 * Any 2xx or 4xx, or a 503 (nothing was changed), resolves it. A request whose job appears in the
 * recent jobs list has also arrived.
 *
 * The followed job is the `?job=` selection, so a link to it survives refresh and can be shared,
 * otherwise the newest unfinished job, kept after it finishes. Starting Provision follows the job it
 * answers.
 */

import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { queries } from "../../../lib/queries";
import { activeProvisionJob, ApiError, provisionTeamDiscord, SaveRejected } from "../../../lib/api";
import { teamCountText } from "./discordLabels";
import {
  clearProvisionRequest,
  newProvisionRequest,
  storedProvisionRequest,
  storeProvisionRequest,
  type ProvisionRequest,
} from "./provisionRequest";

const JOB_PARAM = "job";

/** A response that settles whether the request was stored. */
const answered = (error: unknown) =>
  error instanceof SaveRejected || (error instanceof ApiError && (error.status < 500 || error.status === 503));

export function useProvisionJobs(conf: string, viewerId: number | null) {
  const qc = useQueryClient();
  const jobs = useQuery(queries.teamDiscordProvisionJobs(conf, viewerId));
  const [params, setParams] = useSearchParams();
  const param = params.get(JOB_PARAM);
  const selectedJobId = param && /^\d+$/.test(param) && Number(param) > 0 ? Number(param) : null;
  const follow = (jobId: number | null) => setParams(current => {
    const next = new URLSearchParams(current);
    if (jobId === null) next.delete(JOB_PARAM);
    else next.set(JOB_PARAM, String(jobId));
    return next;
  }, { replace: true });

  const [unanswered, setUnanswered] = useState<ProvisionRequest | null>(() => storedProvisionRequest(conf, viewerId));
  const submit = useMutation({
    mutationFn: (request: ProvisionRequest) => provisionTeamDiscord(conf, request),
    // Only an explicit resend repeats a request, and it reuses the same id.
    retry: false,
    onMutate: request => {
      storeProvisionRequest(conf, viewerId, request);
      setUnanswered(request);
    },
    onSuccess: (job, request) => {
      clearProvisionRequest(conf, viewerId, request.requestId);
      setUnanswered(null);
      qc.setQueryData(queries.teamDiscordProvisionJob(conf, viewerId, job.id).queryKey, job);
      follow(job.id);
      toast(`Provision queued for ${teamCountText(job.counts.total)}.`);
    },
    onError: (error, request) => {
      if (!answered(error)) return;
      clearProvisionRequest(conf, viewerId, request.requestId);
      setUnanswered(null);
    },
    // Refreshes status, the jobs list and the job under the status key.
    onSettled: () => qc.invalidateQueries({ queryKey: queries.teamDiscord(conf, viewerId).queryKey }),
  });

  const arrived = unanswered !== null && (jobs.data ?? []).some(job => job.requestId === unanswered.requestId);
  useEffect(() => {
    if (arrived && unanswered) clearProvisionRequest(conf, viewerId, unanswered.requestId);
  }, [arrived, unanswered, conf, viewerId]);
  /** The request that may not have arrived, once nothing is in flight. */
  const uncertain = !submit.isPending && !arrived ? unanswered : null;

  // A resumed job stays followed once it finishes, so its outcome and the final toast's problem
  // link remain on screen until the admin hides it.
  const activeJobId = activeProvisionJob(jobs.data ?? [])?.id ?? null;
  const [resumedJobId, setResumedJobId] = useState<number | null>(null);
  if (activeJobId !== null && activeJobId !== resumedJobId) setResumedJobId(activeJobId);
  const followedJobId = selectedJobId ?? activeJobId ?? resumedJobId;

  return {
    jobs,
    followedJobId,
    follow,
    /** Back to the newest unfinished job, otherwise the collapsed last provision. */
    unfollow: () => {
      setResumedJobId(null);
      follow(null);
    },
    /** Disables every Provision start: one is in flight or unanswered. */
    blocked: submit.isPending || uncertain !== null,
    submitting: submit.isPending ? submit.variables : null,
    submitError: submit.error,
    uncertain,
    start: (teamIds: readonly number[] | null) => {
      if (submit.isPending || uncertain) return;
      submit.mutate(newProvisionRequest(teamIds));
    },
    resend: () => {
      if (submit.isPending || !uncertain) return;
      submit.mutate(uncertain);
    },
  };
}

export type ProvisionJobs = ReturnType<typeof useProvisionJobs>;
