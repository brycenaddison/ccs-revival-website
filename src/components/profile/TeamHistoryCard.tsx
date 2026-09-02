/**
 * Every team the player has appeared for, in served order — most games first.
 *
 * The rows carry `teamCode` plus a hydrated `team`; the code is the label of last resort, used only
 * when a historical stats row names a team whose metadata is gone. The league is named in full,
 * because `3sx` is a database key and means nothing to a reader.
 */

import { fmtPct, type ProfileTeamBreakdown } from "../../lib/api";
import { int } from "../../lib/statFormat";
import { fmtMonth } from "../../lib/utils";
import { TeamLink } from "../league/TeamLink";
import { metricText, RailCard, TeamLogo, useConfLabel } from "./profileUi";

export function TeamHistoryCard({ teams }: { teams: readonly ProfileTeamBreakdown[] }) {
  const confLabel = useConfLabel();

  return (
    <RailCard title="Team history">
      {teams.length === 0 ? (
        <p className="px-3 py-4 text-xs text-text-dim">No recorded games.</p>
      ) : (
        <ul className="divide-y divide-border">
          {teams.map(row => {
            const winPercent = row.games > 0 ? row.wins / row.games : null;
            return (
              <li key={`${row.conf}:${row.teamCode}`}>
                <TeamLink
                  conf={row.conf}
                  code={row.teamCode}
                  className="flex items-start gap-2.5 px-3 py-2.5 no-underline hover:bg-bg3"
                >
                  <TeamLogo team={row.team} code={row.teamCode} size={28} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-heading text-sm text-text-bright">
                      {row.team?.name ?? row.teamCode}
                    </span>
                    <span className="block truncate text-[11px] text-text-secondary">
                      {confLabel(row.conf).name}
                    </span>
                    {/* Every cell can shrink and the date truncates. Previously all three were
                        `whitespace-nowrap` with the date `shrink-0`, so nothing could give and a
                        long stint ("Mar 2025 – Aug 2025") simply ran off the side of the rail. */}
                    <span className="mt-1 flex min-w-0 items-baseline gap-x-1.5 font-mono text-[10px] text-text-dim">
                      <span className="shrink-0 whitespace-nowrap">
                        {int(row.games)} {row.games === 1 ? "game" : "games"}
                      </span>
                      <span className="shrink-0" aria-hidden="true">·</span>
                      <span className="shrink-0 whitespace-nowrap">
                        {metricText(winPercent, fmtPct)} winrate
                      </span>
                      {/* Pushed to the far edge so the stints line up as a column down the card,
                          which is the only way to compare them at a glance. */}
                      <span className="ml-auto min-w-0 truncate">
                        {playedRange(row.firstPlayed, row.lastPlayed)}
                      </span>
                    </span>
                  </span>
                </TeamLink>
              </li>
            );
          })}
        </ul>
      )}
    </RailCard>
  );
}

/** A stint inside one month is a month, not a range that repeats itself. */
function playedRange(first: string | null, last: string | null): string {
  const from = fmtMonth(first);
  const to = fmtMonth(last);
  if (!from && !to) return "";
  if (!from || !to || from === to) return from || to;
  return `${from} – ${to}`;
}
