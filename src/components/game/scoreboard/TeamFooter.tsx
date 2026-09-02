/**
 * A team block's footer: what the side did, beneath its five rows.
 *
 * Kills, deaths, assists and gold on the left; the objectives (towers, dragons, barons, heralds, grubs,
 * inhibitors) in the middle; the bans on the right as clipped tiles. It sat above the rows once and
 * read as a ticker fighting the switchers for the header; under the rows it is a summary line, which
 * is what it is.
 *
 * Zeroes stay in the objectives: on a game where nobody took a baron the absence is information, and a
 * line whose entries come and go can't be read across the two blocks.
 */

import { cn } from "../../../lib/cn";
import type { RiotObjectives, RiotTeamId } from "../../../lib/riot/matchV5";
import { sidePlayers } from "../../../lib/game/participants";
import { BanIcons } from "../../match/BanIcons";
import { useGameView } from "../GameView";
import type { Density } from "./density";
import { ScoreboardIcon } from "./ScoreboardIcon";

export function TeamFooter({ teamId, density, className }: { teamId: RiotTeamId; density: Density; className?: string }) {
  const { match, participants, lookups } = useGameView();
  const team = match.info.teams.find(t => t.teamId === teamId);
  const players = sidePlayers(participants, teamId);

  const totals = players.reduce(
    (acc, p) => ({
      kills: acc.kills + p.raw.kills,
      deaths: acc.deaths + p.raw.deaths,
      assists: acc.assists + p.raw.assists,
      gold: acc.gold + p.raw.goldEarned,
    }),
    { kills: 0, deaths: 0, assists: 0, gold: 0 },
  );

  return (
    <div className={cn("grid grid-cols-[1fr_auto_1fr] items-center gap-x-4 border-t border-border bg-bg3 px-3 py-2 text-text-muted", density.text, className)}>
      <span className="flex items-center gap-4">
        <span className="flex items-center gap-1.5">
          <ScoreboardIcon type="kda" className="h-[1.1em] w-[1.1em]" title="Kills / deaths / assists" />
          <span className="font-mono text-text">
            {totals.kills}/{totals.deaths}/{totals.assists}
          </span>
        </span>
        <span className="flex items-center gap-1.5">
          <ScoreboardIcon type="gold" className="h-[1.1em] w-[1.1em]" title="Gold earned" />
          <span className="font-mono text-text">{totals.gold.toLocaleString()}</span>
        </span>
      </span>

      {team ? <Objectives objectives={team.objectives} /> : <span />}

      <span className="flex items-center justify-end gap-1.5">
        {team && team.bans.length > 0 && (
          <>
            <span className="text-[0.85em]">Bans</span>
            <BanIcons bans={team.bans} champions={lookups.champions} size={density.ban} tile className="flex items-center" />
          </>
        )}
      </span>
    </div>
  );
}

function Objectives({ objectives }: { objectives: RiotObjectives }) {
  const items: [string, number | undefined, string][] = [
    ["T", objectives.tower?.kills, "Towers"],
    ["D", objectives.dragon?.kills, "Dragons"],
    ["B", objectives.baron?.kills, "Barons"],
    ["H", objectives.riftHerald?.kills, "Rift heralds"],
    ["G", objectives.horde?.kills, "Voidgrubs"],
    ["I", objectives.inhibitor?.kills, "Inhibitors"],
  ];
  return (
    <span className="flex items-center gap-x-2.5 font-mono">
      {items
        .filter(([, v]) => v !== undefined)
        .map(([tag, value, title]) => (
          <span key={tag} title={title}>
            <span className="text-text-dim">{tag}</span> <span className="text-text">{value}</span>
          </span>
        ))}
    </span>
  );
}
