/**
 * Preflight and sync issues, as served. A per-person warning also lists the roster profiles it
 * concerns, named from the conference's rosters so staff can see who has to link Discord or join the
 * server.
 */

import { Fragment } from "react";
import { TriangleAlert } from "lucide-react";
import { PlayerLink } from "../../profile/PlayerLink";
import type { TeamDiscordIssue } from "../../../lib/api";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

/** Roster display names by profileId, from `rosterNames`. */
export type RosterNames = ReadonlyMap<number, string>;

export function IssueText({ issue, people }: { issue: TeamDiscordIssue; people: RosterNames }) {
  return (
    <>
      {issue.message}
      {issue.profileIds.length > 0 && <> · </>}
      {issue.profileIds.map((id, index) => (
        <Fragment key={id}>
          {index > 0 && ", "}
          <PlayerLink profileId={id} className="text-brand hover:underline">{people.get(id) ?? "Unnamed player"}</PlayerLink>
        </Fragment>
      ))}
    </>
  );
}

export function IssueList({ title, issues, tone, people }: {
  title: string;
  issues: readonly TeamDiscordIssue[];
  tone: "destructive" | "warning";
  people: RosterNames;
}) {
  if (issues.length === 0) return null;
  return (
    <Alert variant={tone}>
      <TriangleAlert aria-hidden="true" />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>
        <ul className="list-disc space-y-1 pl-5">
          {issues.map((issue, index) => (
            <li key={`${issue.code}-${issue.teamId}-${index}`}><IssueText issue={issue} people={people} /></li>
          ))}
        </ul>
      </AlertDescription>
    </Alert>
  );
}
