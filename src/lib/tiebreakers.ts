import type { Standing, Match, Game } from "../hooks/useLeagueData";

interface TeamGameRecord {
  gamesWon: number;
  gamesPlayed: number;
  gameWinPct: number;
}

/**
 * Build a map of team_id → { gamesWon, gamesPlayed, gameWinPct }
 * from the games table (individual games, not match series).
 */
export function buildGameRecords(games: Game[]): Record<string, TeamGameRecord> {
  const records: Record<string, TeamGameRecord> = {};

  for (const g of games) {
    if (!g.winner_team_id) continue;

    // Blue team
    if (g.blue_team_id) {
      if (!records[g.blue_team_id]) records[g.blue_team_id] = { gamesWon: 0, gamesPlayed: 0, gameWinPct: 0 };
      records[g.blue_team_id].gamesPlayed++;
      if (g.winner_team_id === g.blue_team_id) records[g.blue_team_id].gamesWon++;
    }

    // Red team
    if (g.red_team_id) {
      if (!records[g.red_team_id]) records[g.red_team_id] = { gamesWon: 0, gamesPlayed: 0, gameWinPct: 0 };
      records[g.red_team_id].gamesPlayed++;
      if (g.winner_team_id === g.red_team_id) records[g.red_team_id].gamesWon++;
    }
  }

  // Calculate percentages
  for (const id of Object.keys(records)) {
    const r = records[id];
    r.gameWinPct = r.gamesPlayed > 0 ? r.gamesWon / r.gamesPlayed : 0;
  }

  return records;
}

/**
 * Get head-to-head record between two teams from completed matches.
 * Returns positive if teamA leads, negative if teamB leads, 0 if tied.
 */
function headToHead(teamAId: string, teamBId: string, matches: Match[]): number {
  let aWins = 0;
  let bWins = 0;

  for (const m of matches) {
    if (m.status !== "completed" || !m.winner_team_id) continue;

    const involves = (
      (m.team_blue_id === teamAId && m.team_red_id === teamBId) ||
      (m.team_blue_id === teamBId && m.team_red_id === teamAId)
    );

    if (!involves) continue;

    if (m.winner_team_id === teamAId) aWins++;
    else if (m.winner_team_id === teamBId) bWins++;
  }

  return aWins - bWins;
}

/**
 * Sort standings with tiebreakers:
 * 1. Match record (wins desc, losses asc) — primary
 * 2. Individual game winning percentage — first tiebreaker
 * 3. Head-to-head record — second tiebreaker
 * 4. Alphabetical — final fallback
 */
export function sortStandingsWithTiebreakers(
  standings: Standing[],
  matches: Match[],
  gameRecords: Record<string, TeamGameRecord>,
): Standing[] {
  return [...standings].sort((a, b) => {
    // 1. Match record
    if (b.wins !== a.wins) return b.wins - a.wins;
    if (a.losses !== b.losses) return a.losses - b.losses;

    // Teams are tied on match record — apply tiebreakers
    const teamAId = a.teams?.id || a.team_id;
    const teamBId = b.teams?.id || b.team_id;

    // 2. Game win percentage
    const aGwp = gameRecords[teamAId]?.gameWinPct || 0;
    const bGwp = gameRecords[teamBId]?.gameWinPct || 0;
    if (Math.abs(bGwp - aGwp) > 0.001) return bGwp - aGwp;

    // 3. Head-to-head
    const h2h = headToHead(teamAId, teamBId, matches);
    if (h2h !== 0) return -h2h; // positive means A wins more, so A should rank higher (earlier)

    // 4. Alphabetical fallback
    return (a.teams?.name || "").localeCompare(b.teams?.name || "");
  });
}
