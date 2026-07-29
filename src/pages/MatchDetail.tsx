import { useMemo } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  errorMessage,
  fmtSec,
  type MatchlistEntry,
  type MatchlistRoleKey,
  type TeamRecord,
} from "../lib/api";
import { bestOfForWeek, parseSeriesKey } from "../lib/leagueAdapters";
import { queries } from "../lib/queries";
import { TeamBadge } from "../components/TeamBadge";
import { TeamLink } from "../components/league/TeamLink";
import { ChampionIcon } from "../components/match/ChampionIcon";
import { useChampions } from "../hooks/useChampions";

/**
 * A match series (best-of-N).
 *
 * The API has no series endpoint, but the series id encodes conf, week and both team codes,
 * so one team's match history is enough to reconstruct every game — including the per-role
 * player lines. That keeps this page to two requests instead of rebuilding the whole league.
 */

const ROLE_LABELS: Record<MatchlistRoleKey, string> = {
  top: "TOP",
  jg: "JGL",
  mid: "MID",
  bot: "BOT",
  sup: "SUP",
};

interface SeriesData {
  conf: string;
  week: number;
  codeA: string;
  codeB: string;
  teamA?: TeamRecord;
  teamB?: TeamRecord;
  /** Games from team A's perspective, in order. */
  games: MatchlistEntry[];
  bestOf?: number;
  seasonName?: string;
}

function badgeOf(team: TeamRecord | undefined, code: string) {
  return {
    name: team?.name ?? code,
    abbreviation: code,
    color_primary: team?.colorHex ?? "#3a3a3a",
    color_accent: team?.colorHex ?? "#555555",
    logo_url: team?.logo,
  };
}

export default function MatchDetail() {
  const { seriesId } = useParams<{ seriesId: string }>();
  const navigate = useNavigate();
  // Matchlist rows carry a champion display name but no icon.
  const champions = useChampions();

  const parsed = seriesId ? parseSeriesKey(seriesId) : null;

  // Three queries, all shared: the conf listing and the tournament list are the same ones the
  // league loader holds, so arriving from a scoreboard link usually only fetches the team detail.
  const detailQuery = useQuery({ ...queries.teamDetail(parsed?.conf ?? "", parsed?.codeA ?? ""), enabled: !!parsed });
  const recordsQuery = useQuery({ ...queries.teamsForConf(parsed?.conf ?? ""), enabled: !!parsed });
  const tournamentsQuery = useQuery(queries.tournaments());

  const loading = !!parsed && (detailQuery.isPending || recordsQuery.isPending);
  const failure = detailQuery.error ?? recordsQuery.error;

  const data = useMemo<SeriesData | null>(() => {
    if (!parsed || !detailQuery.data) return null;
    const games = detailQuery.data.matchlist.filter(
      m => m.week === parsed.week && m.opponent === parsed.codeB,
    );
    if (games.length === 0) return null;
    const records = recordsQuery.data ?? [];
    // A failed tournament list costs the best-of and the season label, nothing more.
    const tournament = (tournamentsQuery.data ?? []).find(t => t.conf === parsed.conf);
    return {
      ...parsed,
      teamA: records.find(t => t.code === parsed.codeA),
      teamB: records.find(t => t.code === parsed.codeB),
      games,
      bestOf: bestOfForWeek(tournament, parsed.week),
      seasonName: tournament?.shortname ?? tournament?.name,
    };
  }, [parsed, detailQuery.data, recordsQuery.data, tournamentsQuery.data]);

  const error = !parsed
    ? "That match link isn't valid."
    : failure
      ? errorMessage(failure)
      : !loading && !data
        ? "No games recorded for this match."
        : null;

  if (loading) {
    return (
      <div className="bg-bg min-h-screen w-full text-text font-body flex items-center justify-center">
        <div className="text-text-muted font-heading tracking-wider text-sm">Loading match...</div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="bg-bg min-h-screen w-full text-text font-body flex flex-col items-center justify-center gap-4">
        <div className="text-text-muted font-heading tracking-wider text-sm">{error ?? "Match not found."}</div>
        <button onClick={() => navigate(-1)} className="text-ccs-green font-heading text-sm hover:underline bg-transparent border-none cursor-pointer">
          &larr; Back
        </button>
      </div>
    );
  }

  const winsA = data.games.filter(g => g.win).length;
  const winsB = data.games.length - winsA;
  const a = badgeOf(data.teamA, data.codeA);
  const b = badgeOf(data.teamB, data.codeB);

  return (
    <div className="bg-bg min-h-screen w-full text-text font-body">
      <div className="bg-bg border-b border-bg2 px-4 py-3">
        <div className="max-w-[960px] mx-auto">
          <button onClick={() => navigate(-1)} className="text-ccs-green font-heading text-xs tracking-wider hover:underline bg-transparent border-none cursor-pointer">
            &larr; BACK
          </button>
        </div>
      </div>

      <div className="max-w-[960px] mx-auto px-4 py-6">
        {/* Series header */}
        <div className="bg-bg2 border border-border rounded-lg p-6 mb-6">
          <div className="flex items-center justify-center gap-6 md:gap-10">
            <TeamLink conf={data.conf} code={data.codeA} className="flex items-center gap-3 flex-1 justify-end no-underline group">
              <span className={`font-heading font-medium text-base md:text-lg group-hover:text-accent ${winsA > winsB ? "text-text-bright font-bold" : "text-text-muted"}`}>
                <span className="hidden md:inline">{a.name}</span>
                <span className="md:hidden">{a.abbreviation}</span>
              </span>
              <TeamBadge team={a} size={44} />
            </TeamLink>

            <div className="flex items-center gap-3 min-w-[80px] justify-center">
              <span className={`font-display text-3xl md:text-4xl ${winsA > winsB ? "text-text-bright" : "text-text-muted"}`}>{winsA}</span>
              <span className="font-display text-lg text-text-subtle">-</span>
              <span className={`font-display text-3xl md:text-4xl ${winsB > winsA ? "text-text-bright" : "text-text-muted"}`}>{winsB}</span>
            </div>

            <TeamLink conf={data.conf} code={data.codeB} className="flex items-center gap-3 flex-1 no-underline group">
              <TeamBadge team={b} size={44} />
              <span className={`font-heading font-medium text-base md:text-lg group-hover:text-accent ${winsB > winsA ? "text-text-bright font-bold" : "text-text-muted"}`}>
                <span className="hidden md:inline">{b.name}</span>
                <span className="md:hidden">{b.abbreviation}</span>
              </span>
            </TeamLink>
          </div>

          <div className="flex items-center justify-center gap-3 mt-4 text-[11px] text-text-muted font-heading tracking-wider">
            {data.seasonName && <span>{data.seasonName.toUpperCase()}</span>}
            <span className="text-text-subtle">·</span>
            <span>WEEK {data.week}</span>
            {data.bestOf && (
              <>
                <span className="text-text-subtle">·</span>
                <span>BO{data.bestOf}</span>
              </>
            )}
            {data.games[0]?.startTime && (
              <>
                <span className="text-text-subtle">·</span>
                <span>{new Date(data.games[0].startTime).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })}</span>
              </>
            )}
          </div>
        </div>

        {/* Games */}
        {data.games.map(g => (
          <div key={g.matchId} className="bg-bg2 border border-border rounded-lg mb-4 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-bg3">
              <div className="flex items-center gap-3">
                <span className="font-display text-sm text-text-bright tracking-widest">GAME {g.game}</span>
                <span className="text-text-muted text-xs font-mono">{fmtSec(g.time)}</span>
                <span className="text-[10px] font-bold" style={{ color: g.blueside ? "#3b82f6" : "#ef4444" }}>
                  {data.codeA} ON {g.blueside ? "BLUE" : "RED"}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-text-muted font-heading tracking-wider">WINNER</span>
                <TeamBadge team={g.win ? a : b} size={20} />
                <span className="text-ccs-green font-heading text-xs font-semibold">{g.win ? data.codeA : data.codeB}</span>
              </div>
            </div>

            {(g.bans.length > 0 || g.bansAgainst.length > 0) && (
              <div className="flex flex-col sm:flex-row items-stretch border-b border-border">
                <div className="flex-1 px-4 py-2.5 flex items-center gap-2 border-b sm:border-b-0 sm:border-r border-border">
                  <span className="text-[10px] text-text-muted font-heading tracking-wider mr-1 shrink-0">{data.codeA} BANS</span>
                  <div className="flex gap-1.5 flex-wrap">
                    {g.bans.map(ban => (
                      <ChampionIcon
                        key={`${ban.pickTurn}-${ban.championId}`}
                        champion={ban.championId}
                        lookup={champions}
                        fallbackLabel={ban.name}
                        size={24}
                        className="flex items-center opacity-70 grayscale"
                      />
                    ))}
                  </div>
                </div>
                <div className="flex-1 px-4 py-2.5 flex items-center gap-2">
                  <span className="text-[10px] text-text-muted font-heading tracking-wider mr-1 shrink-0">{data.codeB} BANS</span>
                  <div className="flex gap-1.5 flex-wrap">
                    {g.bansAgainst.map(ban => (
                      <ChampionIcon
                        key={`${ban.pickTurn}-${ban.championId}`}
                        champion={ban.championId}
                        lookup={champions}
                        fallbackLabel={ban.name}
                        size={24}
                        className="flex items-center opacity-70 grayscale"
                      />
                    ))}
                  </div>
                </div>
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[10px] text-text-muted font-heading tracking-wider border-b border-border">
                    <th className="text-left px-4 py-2.5 w-[50px]">ROLE</th>
                    <th className="text-left px-2 py-2.5 min-w-[140px]">PLAYER</th>
                    <th className="text-left px-2 py-2.5 min-w-[90px]">CHAMPION</th>
                    <th className="text-center px-2 py-2.5 w-[70px]">K/D/A</th>
                    <th className="text-center px-2 py-2.5 w-[50px]">CS</th>
                    <th className="text-center px-2 py-2.5 w-[55px]">CS/M</th>
                    <th className="text-right px-2 py-2.5 w-[70px]">DAMAGE</th>
                    <th className="text-right px-4 py-2.5 w-[60px]">KP</th>
                  </tr>
                </thead>
                <tbody>
                  {(Object.keys(ROLE_LABELS) as MatchlistRoleKey[]).map(role => {
                    const p = g.roles[role];
                    return (
                      <tr key={role} className="border-b border-border/50 text-text-secondary">
                        <td className="px-4 py-2 font-heading text-[10px] text-text-muted tracking-wider">{ROLE_LABELS[role]}</td>
                        <td className="px-2 py-2 font-heading text-xs text-text">{p?.name ?? "—"}</td>
                        <td className="px-2 py-2">
                          <ChampionIcon champion={p?.champ} lookup={champions} fallbackLabel={p?.champ ?? "—"} size={22} showName />
                        </td>
                        <td className="px-2 py-2 text-center font-mono text-xs">
                          {p ? `${p.kills}/${p.deaths}/${p.assists}` : "—"}
                        </td>
                        <td className="px-2 py-2 text-center font-mono text-xs">{p?.cs ?? "—"}</td>
                        <td className="px-2 py-2 text-center font-mono text-xs">{p?.csm?.toFixed(1) ?? "—"}</td>
                        <td className="px-2 py-2 text-right font-mono text-xs">{p ? p.dmg.toLocaleString() : "—"}</td>
                        <td className="px-4 py-2 text-right font-mono text-xs">
                          {p?.kp === null || p?.kp === undefined ? "—" : `${Math.round(p.kp * 100)}%`}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="px-4 py-2.5 border-t border-border">
              <Link to={`/game/${encodeURIComponent(g.matchId)}`} className="text-ccs-green font-heading text-[11px] tracking-wider uppercase no-underline hover:underline">
                Full box score &rarr;
              </Link>
            </div>
          </div>
        ))}

        <p className="text-[10px] text-text-dim mt-4">
          Only {data.codeA}'s players are listed per game — the API exposes match history one team at a time.
          Open the full box score for both teams.
        </p>
      </div>
    </div>
  );
}
