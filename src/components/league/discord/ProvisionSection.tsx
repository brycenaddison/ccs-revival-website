/**
 * League Admin > Discord > Provisioning: what Provision does, preflight blockers and warnings,
 * category adoption, the start control, and the followed job.
 *
 * Provision answers as soon as its job is queued, and the worker runs it in the background, so this
 * section follows a job rather than showing a report. A reopened page follows the newest unfinished
 * job (or the `?job=` link); otherwise the newest finished one stays collapsed as Last provision.
 * A second Provision while one runs is a separate job, so it is allowed, with the running ones
 * listed for whoever starts it.
 */

import { Info, TriangleAlert } from "lucide-react";
import { ErrorLine } from "../../admin/adminUi";
import { fmtLocalDateTime } from "../../../lib/utils";
import { errorMessage, teamDiscordRefusal, type TeamDiscordStatus } from "../../../lib/api";
import { CategoryAdoption } from "./CategoryAdoption";
import { IssueList, type RosterNames } from "./discordIssues";
import { provisionCountsText, teamCountText } from "./discordLabels";
import { ProvisionJobView } from "./ProvisionJobView";
import type { ProvisionJobs } from "./useProvisionJobs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export function ProvisionSection({ conf, viewerId, status, canAdmin, people, provisioning, onRefresh }: {
  conf: string;
  viewerId: number | null;
  status: TeamDiscordStatus;
  canAdmin: boolean;
  people: RosterNames;
  provisioning: ProvisionJobs;
  onRefresh: () => Promise<unknown>;
}) {
  const { jobs, followedJobId, follow, uncertain, submitting, submitError } = provisioning;
  const blockers = status.preflight?.blockers ?? [];
  const canWrite = canAdmin && status.available;
  const canStart = canWrite && blockers.length === 0 && !provisioning.blocked && status.teams.length > 0;
  const recent = jobs.data ?? [];
  const running = recent.filter(job => job.state === "queued" || job.state === "running");
  const others = running.filter(job => job.id !== followedJobId);
  const last = followedJobId === null ? recent[0] ?? null : null;
  const refusal = teamDiscordRefusal(submitError);

  return (
    <section aria-labelledby="discord-provision" className="flex flex-col gap-3">
      <h3 id="discord-provision" className="font-heading text-sm text-text-bright">Provisioning</h3>
      <p className="text-sm text-text-secondary">
        Creates missing team roles and private text and voice channels. New roles use the team&apos;s
        name, color and logo where supported; both channels use the team&apos;s name. Players,
        substitutes, the owner and contacts with a Discord account get the role. Roster changes and
        Discord account links automatically update existing role membership.
      </p>
      <p className="text-sm text-text-secondary">
        Existing roles and channels keep their names, colors, icons, placement, IDs and messages.
        Missing channels reuse the shared placement of this league&apos;s surviving channels, with
        categories created only as needed. Mixed placements must be resolved in Discord before
        adding channels. Provisioning never deletes resources.
      </p>
      <p className="text-sm text-text-secondary">
        Provision queues the work and the bot sets each team up in the background. Progress appears
        here and continues if you leave this page. Teams that fail or need attention wait for a retry.
      </p>
      <IssueList title="Provisioning is blocked" issues={blockers} tone="destructive" people={people} />
      <IssueList title="Warnings" issues={status.preflight?.warnings ?? []} tone="warning" people={people} />
      {canWrite && <CategoryAdoption conf={conf} status={status} onDone={onRefresh} />}

      {canAdmin && (
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" disabled={!canStart} onClick={() => provisioning.start(null)}>
            {submitting?.teamIds === null ? "Queuing…" : "Provision all teams"}
          </Button>
          {running.length > 0 && (
            <p className="text-xs text-text-dim">A Provision is already in progress. Starting another queues a separate job.</p>
          )}
        </div>
      )}

      {uncertain && (
        <Alert variant="warning">
          <TriangleAlert aria-hidden="true" />
          <AlertTitle>The last Provision request may not have arrived</AlertTitle>
          <AlertDescription>
            <p>
              No answer came back for {uncertain.teamIds ? teamCountText(uncertain.teamIds.length) : "all teams"}.
              Checking resends the same request: if it was queued, you get that job; otherwise it is queued now.
            </p>
            {canWrite && (
              <div className="mt-2">
                <Button variant="outline" size="sm" type="button" onClick={provisioning.resend}>Check the request</Button>
              </div>
            )}
          </AlertDescription>
        </Alert>
      )}
      {refusal && refusal.issues.length > 0 ? (
        <IssueList title={refusal.error} issues={refusal.issues} tone="destructive" people={people} />
      ) : <ErrorLine message={submitError ? errorMessage(submitError) : null} />}
      {refusal?.status === "request_conflict" && (
        <p className="text-xs text-text-dim">Nothing was queued. Start Provision again to send a new request.</p>
      )}

      {others.length > 0 && (
        <Alert>
          <Info aria-hidden="true" />
          <AlertTitle>{others.length === 1 ? "Another Provision is in progress" : `${others.length} other Provisions are in progress`}</AlertTitle>
          <AlertDescription>
            <ul className="flex flex-col gap-2">
              {others.map(job => (
                <li key={job.id} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span>
                    {teamCountText(job.counts.total)}: {provisionCountsText(job.counts)}
                    {job.acceptedAt && <>, requested {fmtLocalDateTime(job.acceptedAt)}</>}
                  </span>
                  <Button variant="outline" size="sm" type="button" onClick={() => follow(job.id)}>View it</Button>
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {followedJobId !== null ? (
        <ProvisionJobView
          key={followedJobId}
          conf={conf}
          viewerId={viewerId}
          jobId={followedJobId}
          canRetry={canWrite}
          people={people}
          onClose={provisioning.unfollow}
        />
      ) : last ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-bg2 p-4">
          <div className="min-w-0">
            <p className="font-heading text-sm text-text-bright">Last provision</p>
            <p className="text-sm text-text-secondary">
              {teamCountText(last.counts.total)}: {provisionCountsText(last.counts)}
              {last.finishedAt && <> · Finished {fmtLocalDateTime(last.finishedAt)}</>}
            </p>
          </div>
          <Button variant="outline" size="sm" type="button" onClick={() => follow(last.id)}>Show details</Button>
        </div>
      ) : null}
      <ErrorLine message={jobs.error ? errorMessage(jobs.error) : null} />

      {status.provisioned && (
        <p className="text-xs text-text-dim">
          Use Provision for missing resources or new teams and Resync roles for membership.
          Uncertain creates need inspection before they can continue.
        </p>
      )}
    </section>
  );
}
