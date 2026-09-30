/**
 * One team, or two as "[A] Alpha vs [B] Bravo", with crests from `TeamBadge`.
 *
 * `linked` names go to the team page through `TeamLink`. Pass `linked={false}` when the whole label
 * already sits inside another link (a ledger row pointing at the prediction), because links must not
 * nest. A team missing from the wire reads "TBD".
 */

import { TeamBadge } from "../TeamBadge";
import { TeamLink } from "../league/TeamLink";
import type { TeamMetadata } from "../../lib/api";
import { toBadge } from "../../lib/leagueAdapters";

export function TeamLabel({ team, conf, linked = true, size = 20, className = "" }: {
  team: TeamMetadata | null;
  /** The event's conf, used when the team row carries none. */
  conf: string;
  linked?: boolean;
  size?: number;
  className?: string;
}) {
  if (team === null) return <span className={`font-heading italic text-text-dim ${className}`}>TBD</span>;
  const name = <span className="min-w-0 truncate" title={team.name}>{team.name}</span>;
  return (
    <span className={`inline-flex min-w-0 items-center gap-1.5 ${className}`}>
      <TeamBadge team={toBadge(team)} size={size} />
      {linked
        ? <TeamLink conf={team.conf ?? conf} code={team.code} className="min-w-0 truncate no-underline hover:text-brand hover:underline">{name}</TeamLink>
        : name}
    </span>
  );
}

export function MatchupLabel({ teamA, teamB, conf, linked = true, size = 20, picked }: {
  teamA: TeamMetadata | null;
  teamB: TeamMetadata | null;
  conf: string;
  linked?: boolean;
  size?: number;
  /** The viewer's picks by team ID. When given, the other team is muted so the pick stands out. */
  picked?: readonly number[];
}) {
  const tone = (team: TeamMetadata | null) =>
    picked && picked.length > 0 && !(team && picked.includes(team.id)) ? "text-text-muted" : "";
  return (
    <span className="inline-flex min-w-0 max-w-full items-center gap-2 font-heading text-sm text-text-bright">
      <TeamLabel team={teamA} conf={conf} linked={linked} size={size} className={tone(teamA)} />
      <span className="shrink-0 text-xs text-text-dim">vs</span>
      <TeamLabel team={teamB} conf={conf} linked={linked} size={size} className={tone(teamB)} />
    </span>
  );
}
