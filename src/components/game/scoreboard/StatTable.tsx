/**
 * The client's post-game stat table: one column per player, one collapsible section per group.
 *
 * Everything is read straight off the participant rows, plus a Laning group at 14:00 from the
 * timeline when there is one long enough: a frame at index 14 is the state at fourteen minutes, and
 * the differences are against the lane opponent, who is the player in the same position on the other
 * side (falling back to the participant five slots over, which is the payload's pairing).
 *
 * Column heads are champion icons ringed in the side token, because ten names across a table this
 * dense would not fit; the names are on the scoreboard directly above.
 */

import { Check, ChevronDown, ChevronRight } from "lucide-react";
import { useState, type ReactNode } from "react";
import type { RiotParticipant, RiotParticipantFrame } from "../../../lib/riot/matchV5";
import type { GameParticipant, Participants } from "../../../lib/game/participants";
import { frameAt } from "../../../lib/game/timelineStats";
import { ChampionIcon } from "../../ChampionIcon";
import { useGameView } from "../GameView";

type Getter = (p: RiotParticipant) => number | boolean | string;

/** The client's groups, in its order. Labels are the client's. */
const STAT_GROUPS: Record<string, Record<string, Getter>> = {
  Combat: {
    KDA: p => `${p.kills}/${p.deaths}/${p.assists}`,
    "Largest killing spree": p => p.largestKillingSpree,
    "Largest multi kill": p => p.largestMultiKill,
    "Crowd control score": p => p.timeCCingOthers,
    "First blood": p => p.firstBloodKill,
  },
  "Damage dealt": {
    "Total damage to champions": p => p.totalDamageDealtToChampions,
    "Physical damage to champions": p => p.physicalDamageDealtToChampions,
    "Magic damage to champions": p => p.magicDamageDealtToChampions,
    "True damage to champions": p => p.trueDamageDealtToChampions,
    "Total damage dealt": p => p.totalDamageDealt,
    "Physical damage dealt": p => p.physicalDamageDealt,
    "Magic damage dealt": p => p.magicDamageDealt,
    "True damage dealt": p => p.trueDamageDealt,
    "Largest critical strike": p => p.largestCriticalStrike,
    "Total damage to turrets": p => p.damageDealtToTurrets,
    "Total damage to objectives": p => p.damageDealtToObjectives,
  },
  "Damage taken and healed": {
    "Damage healed": p => p.totalHeal,
    "Damage taken": p => p.totalDamageTaken,
    "Physical damage taken": p => p.physicalDamageTaken,
    "Magic damage taken": p => p.magicDamageTaken,
    "True damage taken": p => p.trueDamageTaken,
    "Self mitigated damage": p => p.damageSelfMitigated,
  },
  Vision: {
    "Vision score": p => p.visionScore,
    "Wards placed": p => p.wardsPlaced,
    "Wards destroyed": p => p.wardsKilled,
    "Control wards purchased": p => p.visionWardsBoughtInGame,
  },
  Income: {
    "Gold earned": p => p.goldEarned,
    "Gold spent": p => p.goldSpent,
    "Minions killed": p => p.totalMinionsKilled,
    "Jungle minions killed": p => p.neutralMinionsKilled,
  },
  Objectives: {
    "Towers destroyed": p => p.turretKills,
    "Inhibitors destroyed": p => p.inhibitorKills,
    "Objectives stolen": p => p.objectivesStolen,
  },
};

/** The player in the same position on the other side, else the payload's pairing five slots over. */
function laneOpponent(player: GameParticipant, participants: Participants): GameParticipant | undefined {
  const others = Object.values(participants).filter(p => p.teamId !== player.teamId);
  return (
    (player.role !== null ? others.find(p => p.role === player.role) : undefined) ??
    participants[player.participantId + (player.teamId === 100 ? 5 : -5)]
  );
}

export function StatTable() {
  const { match, participants, timeline, lookups } = useGameView();
  const players = Object.values(participants);
  const frames = timeline ? frameAt(timeline, 14) : null;

  const laning: Record<string, Getter> | null = frames
    ? (() => {
        const frameOf = (p: RiotParticipant): RiotParticipantFrame | undefined => frames[String(p.participantId)];
        const diff = (p: RiotParticipant, read: (f: RiotParticipantFrame) => number): number => {
          const own = frameOf(p);
          const player = participants[p.participantId];
          const opponent = player ? laneOpponent(player, participants) : undefined;
          const theirs = opponent ? frameOf(opponent.raw) : undefined;
          return own && theirs ? read(own) - read(theirs) : 0;
        };
        return {
          "Gold difference at 14:00": p => diff(p, f => f.totalGold),
          "CS difference at 14:00": p => diff(p, f => f.minionsKilled + f.jungleMinionsKilled),
          "Experience difference at 14:00": p => diff(p, f => f.xp),
          "Level difference at 14:00": p => diff(p, f => f.level),
          "Gold at 14:00": p => frameOf(p)?.totalGold ?? 0,
          "CS at 14:00": p => {
            const f = frameOf(p);
            return f ? f.minionsKilled + f.jungleMinionsKilled : 0;
          },
          "Experience at 14:00": p => frameOf(p)?.xp ?? 0,
          "Level at 14:00": p => frameOf(p)?.level ?? 0,
        };
      })()
    : null;

  const groups: [string, Record<string, Getter>][] = [
    ...(laning ? ([["Laning", laning]] as [string, Record<string, Getter>][]) : []),
    ...Object.entries(STAT_GROUPS),
  ];

  return (
    <div className="mt-6 overflow-x-auto rounded-lg border border-border bg-bg2">
      <table className="w-full min-w-[720px] border-collapse text-[10px] md:text-xs xl:text-sm [&_td]:px-1 [&_td]:py-1">
        <thead>
          <tr className="border-b border-border">
            <th className="w-6 lg:w-8" />
            <th className="py-2 pl-2 text-left font-heading text-[10px] font-normal text-text-dim">
              Stat
            </th>
            {players.map(player => (
              <th key={player.participantId} className="w-12 py-2 lg:w-[4.5rem] xl:w-20">
                <span className="mx-auto block w-fit" title={player.displayName}>
                  <ChampionIcon
                    champion={player.championId}
                    lookup={lookups.champions}
                    fallbackLabel={player.raw.championName}
                    size={32}
                    tile
                    className="flex"
                  />
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {groups.map(([label, getters]) => (
            <Section key={label} label={label}>
              {Object.entries(getters).map(([row, read]) => (
                <tr key={row} className="border-b border-border/40 last:border-b-0">
                  <td />
                  <td className="whitespace-nowrap pl-2 text-text-secondary">{row}</td>
                  {match.info.participants.map(p => {
                    const value = read(p);
                    return (
                      <td key={p.participantId} className="whitespace-nowrap text-center font-mono text-text">
                        {typeof value === "number" ? (
                          value.toLocaleString()
                        ) : typeof value === "string" ? (
                          value
                        ) : value ? (
                          <Check className="mx-auto h-4 w-4 text-ccs-green" aria-label="Yes" />
                        ) : null}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </Section>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** A collapsible group. The header row spans the table; the chevron says which way it is. */
function Section({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <>
      <tr>
        <td colSpan={12} className="p-0!">
          <button
            type="button"
            onClick={() => setOpen(o => !o)}
            aria-expanded={open}
            className="flex w-full cursor-pointer items-center gap-1.5 border-b border-border bg-bg3 px-2 py-2 text-left font-display text-sm text-text-bright hover:bg-bg-input"
          >
            {open ? <ChevronDown className="h-4 w-4 text-text-muted" /> : <ChevronRight className="h-4 w-4 text-text-muted" />}
            {label}
          </button>
        </td>
      </tr>
      {open && children}
    </>
  );
}
