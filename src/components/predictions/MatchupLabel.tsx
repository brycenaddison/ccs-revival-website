/**
 * One team, or two as "[A] Alpha vs [B] Bravo", with crests from `TeamBadge`.
 *
 * `linked` names go to the team page through `TeamLink`. Pass `linked={false}` when the whole label
 * already sits inside another link (a ledger row pointing at the prediction), because links must not
 * nest. A team missing from the wire reads "TBD".
 *
 * `OutcomeLabel` is any market's outcome: a match outcome is its `TeamLabel`; a custom outcome is
 * its label, beside the referenced team's crest (linked to the team) or profile's face (linked to
 * the player), or plain text when it references neither.
 */

import { TeamBadge } from "../TeamBadge";
import { TeamLink } from "../league/TeamLink";
import { PlayerAvatar } from "../players/PlayerIdentity";
import { PlayerLink } from "../profile/PlayerLink";
import { outcomeName } from "./outcomeLabels";
import type { PredictionEvent, PredictionOutcome, TeamMetadata } from "../../lib/api";
import { toBadge } from "../../lib/leagueAdapters";

const LINK_CLASS = "min-w-0 truncate no-underline hover:text-brand hover:underline";

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
        ? <TeamLink conf={team.conf ?? conf} code={team.code} className={LINK_CLASS}>{name}</TeamLink>
        : name}
    </span>
  );
}

export function OutcomeLabel({ event, outcome, linked = true, size = 20, className = "" }: {
  event: Pick<PredictionEvent, "kind" | "conf">;
  outcome: PredictionOutcome;
  linked?: boolean;
  size?: number;
  className?: string;
}) {
  if (event.kind === "match") return <TeamLabel team={outcome.team} conf={event.conf} linked={linked} size={size} className={className} />;
  const name = <span className="min-w-0 truncate">{outcomeName(event, outcome)}</span>;
  const { team, profile } = outcome;
  if (team) {
    return (
      <span className={`inline-flex min-w-0 items-center gap-1.5 ${className}`}>
        <TeamBadge team={toBadge(team)} size={size} />
        {linked ? <TeamLink conf={team.conf ?? event.conf} code={team.code} className={LINK_CLASS}>{name}</TeamLink> : name}
      </span>
    );
  }
  if (profile) {
    return (
      <span className={`inline-flex min-w-0 items-center gap-1.5 ${className}`}>
        <PlayerAvatar src={profile.avatar} size={size <= 22 ? "small" : size <= 28 ? "normal" : size <= 32 ? "medium" : "large"} />
        {linked ? <PlayerLink profileId={profile.profileId} className={LINK_CLASS}>{name}</PlayerLink> : name}
      </span>
    );
  }
  return <span className={`inline-flex min-w-0 items-center ${className}`}>{name}</span>;
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
