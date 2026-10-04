import { ErrorLine } from "../../admin/adminUi";
import type { TeamDiscordProvisionReport, TeamDiscordRoleResyncReport } from "../../../lib/api";
import { PROVISION_LABEL, RESOURCE_LABEL, ROLE_RESYNC_LABEL } from "./discordLabels";
import { IssueList, IssueText, type RosterNames } from "./discordIssues";

export type DiscordOperationResult =
  | { kind: "provision"; report: TeamDiscordProvisionReport }
  | { kind: "roles"; report: TeamDiscordRoleResyncReport };

export function DiscordOperationReport({ result, people }: { result: DiscordOperationResult; people: RosterNames }) {
  const { report } = result;
  return (
    <div className="space-y-2" aria-live="polite">
      <h4 className="font-heading text-sm text-text-bright">{result.kind === "provision" ? "Provision report" : "Role resync report"}</h4>
      <IssueList title="Warnings" issues={report.warnings} tone="warning" people={people} />
      {report.teams.length === 0 && <p className="text-sm text-text-dim">No teams were processed.</p>}
      <ul className="space-y-2">
        {report.teams.map(team => {
          const status = "created" in team
            ? team.status && PROVISION_LABEL[team.status]
            : team.status && ROLE_RESYNC_LABEL[team.status];
          return (
            <li key={team.teamId} className="rounded-md border border-border bg-bg2 p-3 text-sm">
              <span className="text-text-bright">{team.name || team.code}</span>
              {status && <> · {status}</>}
              {"created" in team && team.created.length > 0 && (
                <span className="text-text-secondary"> · Created {team.created.map(kind => RESOURCE_LABEL[kind].toLowerCase()).join(", ")}</span>
              )}
              {(team.granted !== null || team.revoked !== null) && (
                <p className="text-xs text-text-secondary">
                  {team.granted !== null && <>{team.granted} role {team.granted === 1 ? "grant" : "grants"}</>}
                  {team.granted !== null && team.revoked !== null && " · "}
                  {team.revoked !== null && <>{team.revoked} role {team.revoked === 1 ? "revocation" : "revocations"}</>}
                </p>
              )}
              {"membershipError" in team && team.membershipError && (
                <div><p className="text-xs text-text-secondary">Membership sync</p><ErrorLine message={team.membershipError} /></div>
              )}
              {"resourceError" in team && team.resourceError && (
                <div><p className="text-xs text-text-secondary">Roles and channels</p><ErrorLine message={team.resourceError} /></div>
              )}
              {team.error && (!("membershipError" in team) || (team.error !== team.membershipError && team.error !== team.resourceError)) && <ErrorLine message={team.error} />}
              {team.warnings.length > 0 && (
                <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs text-text-secondary">
                  {team.warnings.map((warning, index) => (
                    <li key={`${warning.code}-${index}`}><IssueText issue={warning} people={people} /></li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
      <p className="text-xs text-text-dim">Queued work retries in the background. Check the team status for pending work and errors.</p>
    </div>
  );
}
