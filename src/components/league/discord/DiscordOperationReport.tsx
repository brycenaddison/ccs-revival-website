import { ErrorLine } from "../../admin/adminUi";
import type { TeamDiscordRoleResyncReport } from "../../../lib/api";
import { MEMBERSHIP_RETRY_GUIDANCE, ROLE_RESYNC_LABEL } from "./discordLabels";
import { IssueList, IssueText, type RosterNames } from "./discordIssues";

/** A role resync's per-team report. Provision answers a job instead, which `ProvisionJobView` follows. */
export function DiscordOperationReport({ report, people }: { report: TeamDiscordRoleResyncReport; people: RosterNames }) {
  return (
    <div className="space-y-2" aria-live="polite">
      <h4 className="font-heading text-sm text-text-bright">Role resync report</h4>
      <IssueList title="Warnings" issues={report.warnings} tone="warning" people={people} />
      {report.teams.length === 0 && <p className="text-sm text-text-dim">No teams were processed.</p>}
      <ul className="space-y-2">
        {report.teams.map(team => (
          <li key={team.teamId} className="rounded-md border border-border bg-bg2 p-3 text-sm">
            <span className="text-text-bright">{team.name || team.code}</span>
            {team.status && <> · {ROLE_RESYNC_LABEL[team.status]}</>}
            {(team.granted !== null || team.revoked !== null) && (
              <p className="text-xs text-text-secondary">
                {team.granted !== null && <>{team.granted} role {team.granted === 1 ? "grant" : "grants"}</>}
                {team.granted !== null && team.revoked !== null && " · "}
                {team.revoked !== null && <>{team.revoked} role {team.revoked === 1 ? "revocation" : "revocations"}</>}
              </p>
            )}
            <ErrorLine message={team.error} />
            {team.warnings.length > 0 && (
              <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs text-text-secondary">
                {team.warnings.map((warning, index) => (
                  <li key={`${warning.code}-${index}`}><IssueText issue={warning} people={people} /></li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
      <p className="text-xs text-text-dim">
        Queued work completes in the background. Failed work does not retry automatically.
        {" "}{MEMBERSHIP_RETRY_GUIDANCE}
        {" "}Check the team status for pending work and errors.
      </p>
    </div>
  );
}
