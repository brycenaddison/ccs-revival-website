/**
 * One team in a Provision job: its latest attempt's status and stage, then on expansion every stage's
 * outcome, the attempt's error and warnings, and earlier attempts. Partial success stays visible: a
 * failed team still lists the channel stages that succeeded. Times count from the job's server clock.
 */

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { ErrorLine } from "../../admin/adminUi";
import {
  TEAM_DISCORD_STAGES,
  type TeamDiscordAttemptStatus,
  type TeamDiscordProvisionStage,
  type TeamDiscordProvisionTeam,
  type TeamDiscordStage,
} from "../../../lib/api";
import { fmtLocalDateTime } from "../../../lib/utils";
import {
  ATTEMPT_STATUS_LABEL,
  PROVISION_RETRY_GUIDANCE,
  STAGE_LABEL,
  STAGE_STATUS_LABEL,
  elapsedText,
  provisionProblemText,
} from "./discordLabels";
import { IssueText, type RosterNames } from "./discordIssues";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

/** The row's element id, so a finished-job toast can bring the first problem into view. */
export const provisionRowId = (jobId: number, teamId: number) => `provision-job-${jobId}-team-${teamId}`;

const STATUS_VARIANT: Record<TeamDiscordAttemptStatus, "default" | "muted" | "secondary" | "destructive"> = {
  queued: "muted",
  running: "secondary",
  succeeded: "default",
  failed: "destructive",
  needs_attention: "destructive",
  superseded: "muted",
};

export function AttemptStatusBadge({ status }: { status: TeamDiscordAttemptStatus | null }) {
  return status
    ? <Badge variant={STATUS_VARIANT[status]}>{ATTEMPT_STATUS_LABEL[status]}</Badge>
    : <Badge variant="muted">Unknown status</Badge>;
}

const elapsedSince = (instant: string | null, nowMs: number): string | null => {
  const at = instant ? Date.parse(instant) : NaN;
  return Number.isFinite(at) ? elapsedText(nowMs - at) : null;
};

export function ProvisionTeamRow({ jobId, team, nowMs, people, open, onToggle, onRetry, retrying }: {
  jobId: number;
  team: TeamDiscordProvisionTeam;
  /** The job's server clock, advanced locally between reads. */
  nowMs: number;
  people: RosterNames;
  open: boolean;
  onToggle: () => void;
  /** Null when this viewer cannot retry the team right now. */
  onRetry: (() => void) | null;
  retrying: boolean;
}) {
  const [historyOpen, setHistoryOpen] = useState(false);
  const stopped = team.status === "failed" || team.status === "needs_attention";
  const running = team.status === "running" && team.stage
    ? [STAGE_LABEL[team.stage], elapsedSince(team.stageStartedAt, nowMs)].filter(Boolean).join(" · ")
    : null;
  const problem = stopped && team.errorCode ? provisionProblemText(team.errorCode) : null;
  const guidance = stopped && team.errorCode ? PROVISION_RETRY_GUIDANCE[team.errorCode] : undefined;

  return (
    <li id={provisionRowId(jobId, team.teamId)} className="rounded-md border border-border bg-bg2">
      <button
        type="button"
        aria-expanded={open}
        onClick={onToggle}
        className="flex w-full min-w-0 cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 border-none bg-transparent p-3 text-left hover:bg-accent focus-visible:outline-2 focus-visible:outline-brand"
      >
        {open ? <ChevronDown size={15} aria-hidden="true" /> : <ChevronRight size={15} aria-hidden="true" />}
        <span className="font-mono text-xs text-text-secondary">{team.code}</span>
        <span className="min-w-0 flex-1 truncate text-sm text-text-bright">{team.name || team.code}</span>
        {(running ?? problem) && <span className="text-xs text-text-secondary">{running ?? problem}</span>}
        {team.history.length > 0 && (
          <span className="text-xs text-text-dim">Attempt {team.attempt} of {team.history.length + 1}</span>
        )}
        <AttemptStatusBadge status={team.status} />
      </button>

      {open && (
        <div className="flex flex-col gap-3 border-t border-border p-3">
          {guidance && <p className="text-xs text-text-dim">{guidance}</p>}
          <ErrorLine message={team.error} />
          <StageList stages={team.stages} />
          {team.warnings.length > 0 && (
            <ul className="list-disc space-y-0.5 pl-5 text-sm text-ccs-gold">
              {team.warnings.map((warning, index) => (
                <li key={`${warning.code}-${index}`}><IssueText issue={warning} people={people} /></li>
              ))}
            </ul>
          )}
          {onRetry && team.retryable && (
            <div>
              <Button variant="outline" size="sm" type="button" disabled={retrying} onClick={onRetry}>Retry this team</Button>
            </div>
          )}
          {team.history.length > 0 && (
            <div>
              <Button variant="ghost" size="sm" type="button" aria-expanded={historyOpen} onClick={() => setHistoryOpen(value => !value)}>
                {historyOpen ? "Hide earlier attempts" : `Show earlier attempts (${team.history.length})`}
              </Button>
              {historyOpen && (
                <ol className="mt-2 space-y-2">
                  {team.history.map(attempt => (
                    <li key={attempt.attempt} className="text-sm text-text-secondary">
                      <span className="text-text">Attempt {attempt.attempt}</span>
                      {" · "}{attempt.status ? ATTEMPT_STATUS_LABEL[attempt.status] : "Unknown status"}
                      {attempt.errorCode && <> · {provisionProblemText(attempt.errorCode)}</>}
                      {attempt.finishedAt && <> · {fmtLocalDateTime(attempt.finishedAt)}</>}
                      <ErrorLine message={attempt.error} />
                    </li>
                  ))}
                </ol>
              )}
            </div>
          )}
        </div>
      )}
    </li>
  );
}

function StageList({ stages }: { stages: Record<TeamDiscordStage, TeamDiscordProvisionStage | null> }) {
  return (
    <ul className="flex flex-col gap-2">
      {TEAM_DISCORD_STAGES.map(kind => {
        const stage = stages[kind];
        return (
          <li key={kind} className="text-sm">
            <span className="text-text-bright">{STAGE_LABEL[kind]}</span>
            {": "}
            {stage ? <StageOutcome kind={kind} stage={stage} /> : <span className="text-text-dim">Not reached</span>}
          </li>
        );
      })}
    </ul>
  );
}

function StageOutcome({ kind, stage }: { kind: TeamDiscordStage; stage: TeamDiscordProvisionStage }) {
  const facts: string[] = [];
  if (kind !== "membership" && stage.status === "succeeded") {
    facts.push(stage.adopted ? "Recovered from an interrupted create" : stage.created ? "Created" : "Already existed");
  }
  if (stage.updated) facts.push("Access updated");
  if (stage.granted !== null) facts.push(`${stage.granted} role ${stage.granted === 1 ? "grant" : "grants"}`);
  if (stage.revoked !== null) facts.push(`${stage.revoked} role ${stage.revoked === 1 ? "revocation" : "revocations"}`);
  if (stage.code) facts.push(provisionProblemText(stage.code));
  return (
    <>
      <span className={stage.status === "skipped" ? "text-text-dim" : stage.status === "succeeded" ? "text-text" : stage.status === "running" ? "text-text-secondary" : "text-ccs-red"}>
        {STAGE_STATUS_LABEL[stage.status]}
      </span>
      {facts.length > 0 && <span className="text-text-secondary"> · {facts.join(" · ")}</span>}
      {stage.snowflake && <span className="text-text-dim"> · ID <span className="font-mono">{stage.snowflake}</span></span>}
      <ErrorLine message={stage.error} />
    </>
  );
}
