/**
 * Who played, who won, and where the game sits in the season.
 *
 * The two teams face each other across a VS, as `MatchDetail`'s series header does, and for the same
 * reason: a reader arriving from a Discord embed wants "who won" before any number. Each side is the
 * team (badge and name, linking to its page) with the result word beneath it, large and bold, green
 * for the winner and muted for the loser. Below that, the captions: league, phase, the game's place in
 * its best-of (linking back to the series page), date, patch and the Riot id.
 *
 * Which side of the map a team started on is not said here. The scoreboard's row borders carry it, and
 * "Blue side" beside a team name read as a second team.
 *
 * Everything league-shaped comes off `GET /m/:matchId/context` and degrades when that is absent: a
 * side with no team shows its result word alone, and the caption row shrinks to date, patch and id.
 * `seasonDay` is never shown (`CLAUDE.md`); the phase label follows the rule the profile's match
 * history uses, round number first, then the operator's round name, then "Day n of m".
 */

import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import type { TeamMetadata } from "../../lib/api";
import { fmtSec, placementLabel } from "../../lib/api";
import { cn } from "../../lib/cn";
import { accentHex } from "../../lib/teamStyle";
import { fmtDay } from "../../lib/utils";
import { patchOf, type RiotTeamId } from "../../lib/riot/matchV5";
import { sideTeamCode } from "../../lib/game/participants";
import { TeamBadge } from "../TeamBadge";
import { TeamLink } from "../league/TeamLink";
import { useGameView } from "./GameView";

export function GameHeader() {
  const { matchId, match, context, durationSeconds } = useGameView();
  const info = match.info;
  const created = typeof info.gameCreation === "number" ? new Date(info.gameCreation).toISOString() : null;
  const patch = patchOf(info);
  const seriesHref = context?.scheduleMatchId != null ? `/match/${context.scheduleMatchId}` : null;

  return (
    <div className="mb-6 rounded-lg border border-border bg-bg2 p-5">
      <div className="flex items-center justify-center gap-4 md:gap-8">
        <Side teamId={100} align="left" />
        <div className="flex min-w-[70px] shrink-0 flex-col items-center gap-1">
          <span className="rounded bg-bg-input px-3 py-1 font-display text-base text-text-dim">vs</span>
          <span className="font-mono text-[11px] text-text-dim">{fmtSec(durationSeconds)}</span>
        </div>
        <Side teamId={200} align="right" />
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 font-heading text-[11px] text-text-muted">
        {context && <Caption>{context.codename ?? context.league}</Caption>}
        {context?.phase && <Caption>{placementLabel(context.phase, 0)}</Caption>}
        {context?.game != null && (
          <Caption>
            {seriesHref ? (
              <Link to={seriesHref} className="text-brand no-underline hover:underline">
                Game {context.game}
                {context.bestOf ? ` of ${context.bestOf}` : ""} &rarr;
              </Link>
            ) : (
              <>Game {context.game}</>
            )}
          </Caption>
        )}
        {created && <Caption>{fmtDay(created)}</Caption>}
        {patch && <Caption>Patch {patch}</Caption>}
        <Caption>
          <span className="font-mono text-text-dim">{matchId}</span>
        </Caption>
      </div>
    </div>
  );
}

/** Caption items are separated by a dot, and the separator belongs to the item that follows one. */
function Caption({ children }: { children: ReactNode }) {
  return (
    <>
      <span className="text-text-subtle first:hidden">·</span>
      <span>{children}</span>
    </>
  );
}

/** One side of the VS: the team when the context knows it, then the result word beneath. */
function Side({ teamId, align }: { teamId: RiotTeamId; align: "left" | "right" }) {
  const { match, context, participants } = useGameView();
  const win = match.info.teams.find(t => t.teamId === teamId)?.win;
  const code = sideTeamCode(participants, teamId);
  const team: TeamMetadata | null = code !== null ? context?.teams[code] ?? null : null;
  const left = align === "left";

  const result =
    win === undefined ? null : (
      <span className={cn("font-display text-2xl font-bold leading-none md:text-3xl", win ? "text-ccs-green" : "text-text-muted")}>
        {win ? "Victory" : "Defeat"}
      </span>
    );

  return (
    <div className={cn("flex min-w-0 flex-1 flex-col gap-2", left ? "items-end text-right" : "items-start")}>
      {team ? (
        <TeamLink
          conf={team.conf ?? context?.conf}
          code={team.code}
          className={cn("group flex min-w-0 items-center gap-3 no-underline", left && "flex-row-reverse")}
        >
          <TeamBadge
            team={{ name: team.name, color_primary: team.colorHex, color_accent: accentHex(team), logo_url: team.logo }}
            size={44}
          />
          <span className="truncate font-heading text-base font-semibold text-text-bright group-hover:text-brand group-hover:underline md:text-lg">
            <span className="hidden md:inline">{team.name}</span>
            <span className="md:hidden">{team.code}</span>
          </span>
        </TeamLink>
      ) : code !== null ? (
        <span className="font-heading text-lg font-semibold text-text-bright">{code}</span>
      ) : null}
      {result}
    </div>
  );
}
