/**
 * A followed Provision job: what was accepted, progress by each team's latest attempt, why queued
 * teams wait, per-team stages and history, and retries.
 *
 * Acceptance and completion are separate messages. The final toast fires only when this view sees
 * the job change to `finished` (including after a retry), never when it opens an already finished
 * job. While the job runs the page title shows progress, so a background tab can be read at a glance.
 * Elapsed time ticks from the served `now`; there is deliberately no estimate of what remains.
 *
 * Retry is not idempotent upstream, so it is never repeated automatically; after any answer or lost
 * response the job is reread, which shows whether the retry was queued.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Clock, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { ErrorLine } from "../../admin/adminUi";
import { PlayerIdentity } from "../../players/PlayerIdentity";
import { usePageMetadata } from "../../seo/MetadataProvider";
import { useServerClock } from "../../../hooks/useServerClock";
import { queries } from "../../../lib/queries";
import { fmtLocalDateTime } from "../../../lib/utils";
import {
  errorMessage,
  retryTeamDiscordProvision,
  teamDiscordRefusal,
  type TeamDiscordJobState,
  type TeamDiscordProvisionJob,
} from "../../../lib/api";
import { elapsedText, PROVISION_RETRY_GUIDANCE, provisionCountsText, teamCountText } from "./discordLabels";
import { IssueList, type RosterNames } from "./discordIssues";
import { provisionRowId, ProvisionTeamRow } from "./ProvisionTeamRow";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

/** These mean nothing moves until the bot reconnects. */
const STALLED = new Set(["discord_unavailable", "notifications_unavailable"]);

const isActive = (state: TeamDiscordJobState | null | undefined) => state === "queued" || state === "running";

export function ProvisionJobView({ conf, viewerId, jobId, canRetry, people, onClose }: {
  conf: string;
  viewerId: number | null;
  jobId: number;
  /** League admin scope and a connected Discord. */
  canRetry: boolean;
  people: RosterNames;
  /** Stops following this job; offered once it is not running. */
  onClose: (() => void) | null;
}) {
  const qc = useQueryClient();
  const options = queries.teamDiscordProvisionJob(conf, viewerId, jobId);
  const read = useQuery(options);
  const job = read.data;
  const active = isActive(job?.state);
  const clock = Date.parse(useServerClock(job?.now ?? null, active ? 1000 : null));
  const served = job?.now ? Date.parse(job.now) : NaN;
  const elapsed = job ? job.elapsedMs + (active && Number.isFinite(served) ? Math.max(0, clock - served) : 0) : 0;
  const [openTeams, setOpenTeams] = useState<ReadonlySet<number>>(() => new Set());

  const toggle = (teamId: number) => setOpenTeams(current => {
    const next = new Set(current);
    if (!next.delete(teamId)) next.add(teamId);
    return next;
  });
  const showTeam = useCallback((teamId: number) => {
    setOpenTeams(current => new Set(current).add(teamId));
    requestAnimationFrame(() => {
      const row = document.getElementById(provisionRowId(jobId, teamId));
      row?.scrollIntoView({ block: "nearest" });
      row?.querySelector("button")?.focus({ preventScroll: true });
    });
  }, [jobId]);

  const finishedTeams = job ? job.counts.total - job.counts.queued - job.counts.running : 0;
  usePageMetadata({ title: `(${finishedTeams}/${job?.counts.total ?? 0}) Provisioning | CCS` }, active);

  // The first state seen is the baseline: the accepted response seeds it for a job followed from
  // its start, and a job opened already finished never announces. Rerunning on the same state is inert.
  const seen = useRef<TeamDiscordJobState | null | undefined>(undefined);
  useEffect(() => {
    if (!job) return;
    const previous = seen.current;
    seen.current = job.state;
    if (previous === undefined || !isActive(previous) || job.state !== "finished") return;
    announceFinished(job, showTeam);
    void qc.invalidateQueries({ queryKey: queries.teamDiscord(conf, viewerId).queryKey });
  }, [job, showTeam, qc, conf, viewerId]);

  const retry = useMutation({
    mutationFn: (teamIds: number[] | null) => retryTeamDiscordProvision(conf, jobId, teamIds ?? undefined),
    retry: false,
    onSuccess: next => {
      qc.setQueryData(options.queryKey, next);
      toast("Retry queued.");
    },
    onSettled: () => qc.invalidateQueries({ queryKey: queries.teamDiscord(conf, viewerId).queryKey }),
  });

  if (!job) {
    if (read.isPending) return <p role="status" className="text-sm text-text-dim">Loading the provision job…</p>;
    return (
      <div className="flex flex-col gap-2">
        <ErrorLine message={read.error ? errorMessage(read.error) : "This provision job is unavailable."} />
        {onClose && <div><Button variant="outline" size="sm" type="button" onClick={onClose}>Show the latest provision</Button></div>}
      </div>
    );
  }

  const { counts } = job;
  const retryOpen = canRetry && !job.supersededAt;
  const retryable = job.teams.filter(team => team.retryable);
  const needsDecision = retryable.some(team => team.errorCode && PROVISION_RETRY_GUIDANCE[team.errorCode]);
  const refusal = teamDiscordRefusal(retry.error);
  const stalled = job.waiting?.code ? STALLED.has(job.waiting.code) : false;

  return (
    <section aria-labelledby={`provision-job-${job.id}`} aria-busy={active} className="flex flex-col gap-3 rounded-lg border border-border bg-bg2 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 id={`provision-job-${job.id}`} className="font-heading text-sm text-text-bright">{jobHeading(job)}</h4>
          <p className="text-xs text-text-secondary">
            {job.acceptedAt && <>Requested {fmtLocalDateTime(job.acceptedAt)}</>}
            {job.requestedByProfile && <> by <PlayerIdentity player={job.requestedByProfile} small /></>}
          </p>
        </div>
        {onClose && !active && <Button variant="outline" size="sm" type="button" onClick={onClose}>Hide details</Button>}
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
          <p aria-live="polite" className="text-text">{provisionCountsText(counts)}</p>
          <p className="text-xs text-text-secondary">
            {active ? <>Elapsed {elapsedText(elapsed)}</> : <>Took {elapsedText(job.elapsedMs)}{job.finishedAt && <> · Finished {fmtLocalDateTime(job.finishedAt)}</>}</>}
          </p>
        </div>
        <Progress value={counts.total > 0 ? (finishedTeams / counts.total) * 100 : 0} aria-label="Teams finished" />
      </div>

      {job.waiting && (
        <Alert variant={stalled ? "warning" : "default"}>
          {stalled ? <TriangleAlert aria-hidden="true" /> : <Clock aria-hidden="true" />}
          <AlertTitle>{job.waiting.message}</AlertTitle>
          {(stalled || (job.waiting.ahead ?? 0) > 0) && (
            <AlertDescription>
              {(job.waiting.ahead ?? 0) > 0 && <p>{teamCountText(job.waiting.ahead ?? 0)} from earlier requests {job.waiting.ahead === 1 ? "is" : "are"} ahead of this job.</p>}
              {stalled && <p>Queued teams will not start until the bot reconnects.</p>}
            </AlertDescription>
          )}
        </Alert>
      )}

      <IssueList title="Warnings when queued" issues={job.warnings} tone="warning" people={people} />

      {job.supersededAt && (
        <p className="text-xs text-text-dim">
          Teardown closed this job to retries on {fmtLocalDateTime(job.supersededAt)}. Start a new Provision to set teams up again.
        </p>
      )}

      {retryOpen && retryable.length > 0 && (
        <div className="flex flex-col gap-1">
          <div>
            <Button variant="outline" size="sm" type="button" disabled={retry.isPending} onClick={() => retry.mutate(null)}>
              {retry.isPending ? "Queuing retry…" : "Retry failed teams"}
            </Button>
          </div>
          {needsDecision && (
            <p className="text-xs text-text-dim">Some of these teams need a decision before a retry can settle them. Open each one for details.</p>
          )}
        </div>
      )}
      {refusal?.status === "superseded" ? (
        <Alert variant="warning">
          <TriangleAlert aria-hidden="true" />
          <AlertTitle>Teardown replaced this job</AlertTitle>
          <AlertDescription><p>Start a new Provision to set teams up again.</p></AlertDescription>
        </Alert>
      ) : refusal && refusal.issues.length > 0 ? (
        <IssueList title={refusal.error} issues={refusal.issues} tone="destructive" people={people} />
      ) : <ErrorLine message={retry.error ? errorMessage(retry.error) : null} />}

      {job.teams.length === 0 ? (
        <p className="text-sm text-text-dim">This job has no teams.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {job.teams.map(team => (
            <ProvisionTeamRow
              key={team.teamId}
              jobId={job.id}
              team={team}
              nowMs={clock}
              people={people}
              open={openTeams.has(team.teamId)}
              onToggle={() => toggle(team.teamId)}
              onRetry={retryOpen ? () => retry.mutate([team.teamId]) : null}
              retrying={retry.isPending}
            />
          ))}
        </ul>
      )}
      <ErrorLine message={read.error ? errorMessage(read.error) : null} />
    </section>
  );
}

function jobHeading(job: TeamDiscordProvisionJob): string {
  const teams = teamCountText(job.counts.total);
  if (job.state === "queued") return `Provision queued for ${teams}`;
  if (job.state === "running") return `Provisioning ${teams}`;
  if (job.state === "finished") {
    return job.counts.total > 0 && job.counts.superseded === job.counts.total ? "Provision cancelled by teardown" : `Provision finished for ${teams}`;
  }
  return `Provision for ${teams}`;
}

function announceFinished(job: TeamDiscordProvisionJob, showTeam: (teamId: number) => void) {
  const { counts } = job;
  const problem = job.teams.find(team => team.status === "failed" || team.status === "needs_attention");
  if (counts.total > 0 && counts.succeeded === counts.total) {
    toast.success(`Provision finished: ${teamCountText(counts.total)} set up in ${elapsedText(job.elapsedMs)}.`);
  } else if (counts.failed + counts.needsAttention > 0) {
    toast.warning(`Provision finished: ${provisionCountsText(counts)}.`, problem ? {
      action: { label: "Show first problem", onClick: () => showTeam(problem.teamId) },
    } : undefined);
  } else if (counts.total > 0 && counts.superseded === counts.total) {
    toast("Provision cancelled by teardown.");
  } else {
    toast(`Provision finished: ${provisionCountsText(counts)}.`);
  }
}
