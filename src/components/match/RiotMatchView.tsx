import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  errorMessage,
  fmtSec,
  type RiotParticipant,
  type RiotTeam,
} from "../../lib/api";
import { queries } from "../../lib/queries";
import { useChampions } from "../../hooks/useChampions";
import type { ChampionLookup } from "../../lib/championData";
import { ChampionIcon } from "../ChampionIcon";
import { BanIcons } from "./BanIcons";
import { ResultOnlyCard } from "./GameSummary";

interface Props {
  matchId: string;
  onBack: () => void;
  backLabel: "Back" | "Home";
}

/**
 * The history-aware navigation button, and whatever there is to show under it.
 *
 * Hoisted out of the success branch, where it used to live: every other outcome — loading, a failure,
 * a game with no payload — rendered a page with no way off it but the browser's own history. Those are
 * exactly the pages most likely to be reached from a stale link, so the caller supplies the safe action
 * and whether that action means Back or Home.
 */
function Shell({
  onBack,
  backLabel,
  children,
}: {
  onBack: () => void;
  backLabel: "Back" | "Home";
  children: ReactNode;
}) {
  return (
    <div>
      <button
        type="button"
        onClick={onBack}
        className="mb-4 text-xs text-text-secondary hover:text-accent font-heading tracking-wider uppercase"
      >
        ← {backLabel}
      </button>
      {children}
    </div>
  );
}

export function RiotMatchView({ matchId, onBack, backLabel }: Props) {
  // The raw Riot payload has no champion artwork or display names; resolve them from Community Dragon.
  const champions = useChampions();
  // A finished game never changes, so this is cached for the session and never revalidated.
  const { data, isPending, error } = useQuery(queries.matchData(matchId));

  if (isPending) {
    return (
      <Shell onBack={onBack} backLabel={backLabel}>
        <div className="text-center py-10 text-text-subtle">Loading match...</div>
      </Shell>
    );
  }
  if (error) {
    return (
      <Shell onBack={onBack} backLabel={backLabel}>
        <div className="text-center py-10 text-ccs-red">{errorMessage(error)}</div>
      </Shell>
    );
  }

  /*
    **A missing payload is not the same as a missing game**, and this used to answer both with "No
    match data found."

    `matchData` is a bare `getOne`, so every absence flattens to `null`: a game that was never
    recorded, and a game that *was* recorded but has no payload to store — upstream's `result-only`,
    where Riot's match index denies a match id it is still reporting on the tournament code. The
    second is a working result. It counts for the standings, the series and the bracket; there is
    simply nothing to draw, and a re-check picks the payload up if Riot's index recovers.

    Nothing reachable from here can tell the two apart — no endpoint resolves a bare match id to its
    `matchlist` row — so this says what is true of both and names the possibility rather than
    asserting the game doesn't exist.
  */
  if (!data) {
    return (
      <Shell onBack={onBack} backLabel={backLabel}>
        <ResultOnlyCard
          matchId={matchId}
          label="no data"
          result={null}
          note="Nothing is stored for this game. Either it was never recorded, or it is recorded as a result only — Riot sometimes denies a game it has already reported on the tournament code, and there is no payload to show for one of those. A result-only game still counts for the standings, and a re-check picks the game up if Riot's index recovers."
        />
      </Shell>
    );
  }

  // Stored but unreadable, which is a different problem from stored-and-absent: the row exists and
  // its payload is malformed.
  if (!data.info) {
    return (
      <Shell onBack={onBack} backLabel={backLabel}>
        <ResultOnlyCard
          matchId={matchId}
          label="unreadable"
          result={null}
          note="This game's data is stored but could not be read, so there is nothing to show."
        />
      </Shell>
    );
  }

  const info = data.info;
  const teams = info.teams ?? [];
  const participants = info.participants ?? [];
  const blueTeam = teams.find(t => t.teamId === 100);
  const redTeam = teams.find(t => t.teamId === 200);

  return (
    <Shell onBack={onBack} backLabel={backLabel}>
      {/* Header */}
      <div className="bg-bg2 border border-border rounded-md p-4 mb-5 text-center">
        <div className="text-[10px] text-text-secondary font-heading tracking-wider uppercase">Match</div>
        <div className="font-mono text-xs text-text-dim">{matchId}</div>
        <div className="mt-2 flex justify-center items-center gap-6">
          <div className={`font-display text-2xl tracking-widest ${blueTeam?.win ? "text-ccs-green" : "text-ccs-red"}`}>
            {blueTeam?.win ? "WIN" : "LOSS"}
          </div>
          <div className="text-text-dim text-xs">vs</div>
          <div className={`font-display text-2xl tracking-widest ${redTeam?.win ? "text-ccs-green" : "text-ccs-red"}`}>
            {redTeam?.win ? "WIN" : "LOSS"}
          </div>
        </div>
        <div className="mt-2 text-xs text-text-secondary font-mono">
          {fmtSec(info.gameDuration)}
          {info.gameVersion ? ` · ${info.gameVersion}` : ""}
          {info.gameCreation ? ` · ${new Date(info.gameCreation).toLocaleDateString()}` : ""}
        </div>
      </div>

      {/* Teams */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <TeamPanel side="BLUE" team={blueTeam} players={participants.filter(p => p.teamId === 100)} champions={champions} />
        <TeamPanel side="RED" team={redTeam} players={participants.filter(p => p.teamId === 200)} champions={champions} />
      </div>
    </Shell>
  );
}

function thousands(v: number | undefined): string {
  return v === undefined ? "—" : `${(v / 1000).toFixed(1)}k`;
}

function TeamPanel({
  side,
  team,
  players,
  champions,
}: {
  side: "BLUE" | "RED";
  team?: RiotTeam;
  players: RiotParticipant[];
  champions: ChampionLookup | null;
}) {
  const color = side === "BLUE" ? "#3b82f6" : "#ef4444";
  return (
    <div className="bg-bg2 border border-border rounded-md p-4">
      <div className="flex justify-between items-center mb-3">
        <h3 className="font-display tracking-widest" style={{ color }}>{side}</h3>
        <span className={`font-heading text-xs uppercase tracking-wider ${team?.win ? "text-ccs-green" : "text-ccs-red"}`}>
          {team?.win ? "Victory" : "Defeat"}
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[10px] text-text-secondary uppercase tracking-wider border-b border-border">
              <th className="text-left py-2 pr-2">Player</th>
              <th className="text-left py-2 px-2">Champion</th>
              <th className="text-center py-2 px-2">K/D/A</th>
              <th className="text-center py-2 px-2">CS</th>
              <th className="text-center py-2 px-2">Gold</th>
              <th className="text-center py-2 px-2">DMG</th>
              <th className="text-center py-2 px-2">Vis</th>
            </tr>
          </thead>
          <tbody>
            {players.map((p, i) => (
              <tr key={p.puuid ?? i} className="border-b border-border last:border-b-0">
                <td className="py-2 pr-2 text-xs font-bold">{p.riotIdGameName || p.summonerName || "Unknown"}</td>
                <td className="py-2 px-2">
                  <ChampionIcon
                    champion={p.championId ?? p.championName}
                    lookup={champions}
                    fallbackLabel={p.championName}
                    size={22}
                    showName
                  />
                </td>
                <td className="text-center py-2 px-2 text-xs font-mono">{p.kills ?? 0}/{p.deaths ?? 0}/{p.assists ?? 0}</td>
                <td className="text-center py-2 px-2 text-xs font-mono">{(p.totalMinionsKilled ?? 0) + (p.neutralMinionsKilled ?? 0)}</td>
                <td className="text-center py-2 px-2 text-xs font-mono">{thousands(p.goldEarned)}</td>
                <td className="text-center py-2 px-2 text-xs font-mono">{thousands(p.totalDamageDealtToChampions)}</td>
                <td className="text-center py-2 px-2 text-xs font-mono">{p.visionScore ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {team?.bans && team.bans.length > 0 && (
        <div className="mt-3 pt-3 border-t border-border">
          <div className="text-[10px] text-text-secondary uppercase tracking-wider mb-1.5">Bans</div>
          <div className="flex flex-wrap gap-1.5">
            <BanIcons
              bans={team.bans}
              champions={champions}
              size={26}
              className="flex items-center opacity-70 grayscale hover:opacity-100 hover:grayscale-0 transition"
            />
          </div>
        </div>
      )}
    </div>
  );
}
