/**
 * One game, small enough to read at a glance.
 *
 * The compact counterpart to the match viewer (`pages/GameDetail.tsx`), and it exists for the moment
 * *before* a game is recorded: `POST .../codes/check` attaches a tournament code as pending and hands back the raw
 * match-v5 payload without storing anything, so an admin can see what they are about to ingest.
 * That payload is in hand, which is why `GameSummary` takes data rather than an id — a preview of an
 * unstored game has no `/m/:matchId` to fetch. `LinkedGameSummary` is the other case: a code that
 * already produced a game, where only the id is known.
 *
 * Neither renders a game with **no** payload. That is upstream's `result-only` — a game Riot reports
 * on the code but denies the match id of — and it is a result, not an empty game: the winner and loser
 * are known and the standings are right. What to say about one differs by caller, so each says it
 * itself rather than this component guessing.
 *
 * Deliberately not the viewer's scoreboard. That is a box score, a dozen columns per player, and a
 * summary that needs scrolling answers a different question. This one answers "is this the right
 * game?", and links through to the viewer for everything else.
 *
 * **The two sides are columns, blue then red**, each a vertical list of five players. Laying a side
 * out horizontally read as one long strip of champions and made comparing the two lineups a matter
 * of counting across; stacked in columns, the two roster orders sit next to each other.
 */

import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  errorMessage,
  fmtSec,
  type GameResult,
  type RiotMatch,
  type RiotParticipant,
  type RiotTeam,
} from "../../lib/api";
import { queries } from "../../lib/queries";
import { useChampions } from "../../hooks/useChampions";
import type { ChampionLookup } from "../../lib/championData";
import { ChampionIcon } from "../ChampionIcon";
import { BanIcons } from "./BanIcons";

/** Riot's side ids. 100 is blue, 200 is red, and nothing else appears in a tournament game. */
const BLUE = 100;
const RED = 200;

export function GameSummary({
  data,
  matchId,
}: {
  /**
   * A payload, never `null`.
   *
   * A game with no payload is not a game with nothing to say — it is upstream's `result-only`, whose
   * winner and loser *are* known — and what to say about one depends on which caller is asking. So
   * that case belongs to the caller, and this component renders games it can actually draw.
   */
  data: RiotMatch;
  /** Omitted for a preview of a game we have no id for. Drives the box-score link when present. */
  matchId?: string;
}) {
  const champions = useChampions();

  // A stored payload with no `info` is malformed rather than absent — nothing else to do but say so.
  if (!data.info) {
    return (
      <p className="text-text-dim text-xs">
        That game&apos;s data is stored but unreadable, so there is nothing to show.
      </p>
    );
  }

  const info = data.info;
  const participants = info.participants ?? [];
  const teams = info.teams ?? [];
  const blueTeam = teams.find(t => t.teamId === BLUE);
  const redTeam = teams.find(t => t.teamId === RED);
  const id = matchId ?? data.metadata?.matchId;

  return (
    <div className="bg-bg3 border border-border rounded-md overflow-hidden">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 px-3 py-2 border-b border-border">
        <span className="font-mono text-[11px] text-text-dim break-all">{id ?? "unstored game"}</span>
        <div className="flex items-baseline gap-3">
          <span className="text-text-secondary text-[11px] font-mono">
            {fmtSec(info.gameDuration)}
            {info.gameVersion ? ` · ${info.gameVersion}` : ""}
            {info.gameCreation ? ` · ${new Date(info.gameCreation).toLocaleDateString()}` : ""}
          </span>
          {id && (
            /*
             * A new tab, not a navigation. This summary is opened from the middle of an edit — a
             * staged code awaiting confirmation, or a codes panel expanded three matches down a day
             * — and leaving the page throws all of that away for a look at a box score.
             */
            <Link
              to={`/game/${encodeURIComponent(id)}`}
              target="_blank"
              rel="noreferrer"
              className="text-brand font-heading text-[10px] no-underline hover:underline whitespace-nowrap"
            >
              Box score ↗
            </Link>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-border">
        <SideColumn
          label="Blue"
          team={blueTeam}
          players={participants.filter(p => p.teamId === BLUE)}
          champions={champions}
        />
        <SideColumn
          label="Red"
          team={redTeam}
          players={participants.filter(p => p.teamId === RED)}
          champions={champions}
        />
      </div>
    </div>
  );
}

/**
 * A game with no payload, in the shape of one that has.
 *
 * The counterpart to `GameSummary`, and shared by both surfaces that meet a `result-only` game — the
 * preview of a staged code and the summary of a confirmed one — because the whole point of the status
 * is that an admin recognizes it, which a differently-shaped notice in each place would undo. Each
 * caller brings its own `note`, since what to do about one differs: confirm it, or re-check it.
 *
 * A card rather than a line of prose for the same reason: it sits in a list of `GameSummary` cards,
 * one per game, and a bare paragraph between two cards doesn't read as one of the games.
 */
export function ResultOnlyCard({
  matchId,
  label,
  result,
  note,
}: {
  matchId: string;
  /** The tag on the right — what this game *is*, in two words. */
  label: string;
  /** Who won. `null` when even that is unknown, and then the note carries the whole message. */
  result: GameResult | null;
  /** What it means here, and what to do about it. */
  note: string;
}) {
  return (
    <div className="bg-bg3 border border-border rounded-md px-3 py-2 flex flex-col gap-1">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="font-mono text-[11px] text-text-dim break-all">{matchId}</span>
        <span className="font-heading text-[10px] text-text-dim">{label}</span>
      </div>

      <p className="text-xs text-text-secondary">
        {result !== null && (
          <>
            <span className="text-text-bright font-heading ">{result.winner}</span> beat{" "}
            <span className="text-text-bright font-heading ">{result.loser}</span>.{" "}
          </>
        )}
        {note}
      </p>
    </div>
  );
}

/**
 * The same summary for a game that is already stored, where all we hold is its id.
 *
 * **A `null` payload here is `result-only`, not a failure.** `GET /m/:matchId` 404s for a game whose
 * `matchlist` row was written from the reported winner and loser because `match-v5` denied the match
 * id existed — the result counts for the standings, the series and the bracket, and there is simply no
 * payload to render. Reporting that as "Riot wouldn't hand over the data" read as a broken game and
 * sent an admin chasing a result that was already correct.
 *
 * So the caller passes the result down beside the id, and it is shown instead. It comes from the same
 * `matchlist` row the 404 proves has no payload behind it, which is why this is the one summary that
 * needs telling rather than fetching.
 */
export function LinkedGameSummary({
  matchId,
  result = null,
}: {
  matchId: string;
  /**
   * The recorded result, for the case where there is nothing else. Defaults to `null` — a caller with
   * no result to offer gets a card that says the game is unreadable rather than one that invents a
   * winner.
   */
  result?: GameResult | null;
}) {
  // A finished game never changes, so this is cached for the session — reopening the same summary
  // costs nothing.
  const { data, isPending, error } = useQuery(queries.matchData(matchId));

  if (isPending) return <p className="text-text-dim text-xs">Loading the game…</p>;
  if (error) return <p className="text-ccs-red text-xs">{errorMessage(error)}</p>;

  if (!data) {
    return (
      <ResultOnlyCard
        matchId={matchId}
        label={result === null ? "no data" : "result only"}
        result={result}
        note={
          result === null
            ? "Riot has no data for this game and no result is recorded against it either, so there is nothing to show."
            : "Riot has no data for this game, so there is no game to view — only the result, which counts for the standings and the series. A re-check picks the game up if Riot's index recovers."
        }
      />
    );
  }

  return <GameSummary data={data} matchId={matchId} />;
}

/**
 * One side: who won, and the five players stacked.
 *
 * `win` comes off `info.teams` rather than off a participant, because a game abandoned before a
 * winner exists leaves it undefined on both — and reading undefined as a loss would show two losses.
 */
function SideColumn({
  label,
  team,
  players,
  champions,
}: {
  label: "Blue" | "Red";
  team: RiotTeam | undefined;
  players: RiotParticipant[];
  champions: ChampionLookup | null;
}) {
  const win = team?.win;

  return (
    <div className="px-3 py-2 min-w-0">
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <span className={`font-display text-[11px] ${label === "Blue" ? "text-side-blue" : "text-side-red"}`}>
          {label}
        </span>
        <span
          className={`font-heading text-[10px] ${
            win === undefined ? "text-text-dim" : win ? "text-ccs-green" : "text-ccs-red"
          }`}
        >
          {win === undefined ? "undecided" : win ? "win" : "loss"}
        </span>
      </div>

      <ul className="flex flex-col gap-1">
        {players.map((p, i) => (
          <li key={p.puuid ?? i} className="flex items-center gap-2 min-w-0">
            <ChampionIcon
              champion={p.championId ?? p.championName}
              lookup={champions}
              fallbackLabel={p.championName}
              size={20}
              tile
            />
            <span className="text-xs text-text truncate grow min-w-0">
              {p.riotIdGameName || p.summonerName || "Unknown"}
            </span>
            <span className="font-mono text-[11px] text-text-dim shrink-0">
              {p.kills ?? 0}/{p.deaths ?? 0}/{p.assists ?? 0}
            </span>
          </li>
        ))}
      </ul>

      {team?.bans && team.bans.length > 0 && (
        <div className="mt-2 flex items-center gap-1.5 border-t border-border/60 pt-2">
          <span className="shrink-0 font-heading text-[10px] text-text-muted">Bans</span>
          <BanIcons
            bans={team.bans}
            champions={champions}
            size={20}
            tile
            className="flex items-center"
          />
        </div>
      )}
    </div>
  );
}
