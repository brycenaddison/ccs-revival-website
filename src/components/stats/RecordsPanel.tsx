/**
 * The Records tab — single-game bests, on `/stats/records/:conf`.
 *
 * This is the surface the Stats page had a placeholder for, because records genuinely need per-game rows
 * and the only per-game data any other endpoint serves is one team's matchlist at a time. Ranking a few
 * thousand performances is a query, not a page load.
 *
 * Everything about a board is server-owned — which boards exist, what they are called, what unit they are
 * in, and the order they arrive in. **Nothing here hardcodes a board list**, so a board added upstream
 * appears with no change on this side.
 *
 * One load per (conf, rows, min-minutes) combination, and both controls are in the query key, so flipping
 * back to a setting already seen is free.
 */

import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { errorMessage, fmtSec, type RecordBoard, type RecordUnit } from "../../lib/api";
import { queries } from "../../lib/queries";
import { dec, int, pct, signed } from "../../lib/statFormat";
import { rampColor } from "../../lib/statUi";
import { BarLeaderboard, type BarLeaderboardRow } from "./BarLeaderboard";
import { CONTROL_CLASS, Field, FilterBar, PillGroup } from "./FilterBar";

interface Props {
  conf: string;
  isMobile: boolean;
}

type Side = "players" | "teams";

const SIDES: readonly { value: string; label: string }[] = [
  { value: "players", label: "Players" },
  { value: "teams", label: "Teams" },
];

const ROW_OPTIONS = [3, 5, 10];

/** `value` is always raw so a bar can scale it; `unit` says how to read it. */
function formatter(unit: RecordUnit): (v: number) => string {
  switch (unit) {
    case "duration": return fmtSec;
    case "pct": return pct;
    case "signed": return signed;
    case "dec2": return dec(2);
    default: return int;
  }
}

export function RecordsPanel({ conf, isMobile }: Props) {
  const navigate = useNavigate();
  const [side, setSide] = useState<Side>("players");
  const [limit, setLimit] = useState(5);

  const { data, isPending, error } = useQuery(queries.records(conf, limit));
  // Team boards carry no champion art — `champImg` is null on them and `name` holds the team code — so
  // without this lookup they rendered a bare colour block where the crest should be.
  const teamsQuery = useQuery(queries.teamsForConf(conf));

  const logoOf = useMemo(
    () => new Map((teamsQuery.data ?? []).map(t => [t.code, t.logo])),
    [teamsQuery.data],
  );

  const boards: readonly RecordBoard[] = useMemo(
    () => (side === "players" ? data?.players : data?.teams) ?? [],
    [data, side],
  );

  if (isPending) return <div className="text-center py-10 text-text-subtle">Loading records...</div>;
  if (error) return <div className="text-center py-10 text-ccs-red">{errorMessage(error)}</div>;
  if (!data) return <div className="text-center py-10 text-text-dim">No games played yet this season.</div>;

  return (
    <div>
      <FilterBar isMobile={isMobile} columns={3}>
        <Field label="Rows">
          <select value={limit} onChange={e => setLimit(Number(e.target.value))} className={CONTROL_CLASS}>
            {ROW_OPTIONS.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </Field>

        <Field label="Boards" span={2}>
          <PillGroup options={SIDES} isActive={v => v === side} onSelect={v => setSide(v as Side)} />
        </Field>
      </FilterBar>

      {boards.length === 0 ? (
        <div className="text-center py-10 text-text-dim">No records for this season yet.</div>
      ) : (
        <div
          className="grid gap-3"
          style={{ gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fit, minmax(320px, 1fr))" }}
        >
          {boards.map(board => {
            const format = formatter(board.unit);

            /**
             * Tie detection runs over every row the server sent, not just the ones shown.
             *
             * Ties share a rank upstream and all of them are returned, which is why a board can arrive
             * longer than the row count asked for. Counting before the slice means a record shared with
             * someone who got cut still reads `T-1` rather than claiming an outright first.
             */
            const tally = new Map<number, number>();
            for (const r of board.rows) tally.set(r.rank, (tally.get(r.rank) ?? 0) + 1);

            // Trimmed to the requested count, so every board is the same height.
            const shown = board.rows.slice(0, limit);

            // Ramped by *rank*, not by value. Rank 1 is the record whichever direction the board sorts —
            // "Fastest Win" ranks the lowest duration first — so a value-normalised ramp would paint the
            // record red on any ascending board.
            const last = Math.max(1, shown.length - 1);

            const rows: BarLeaderboardRow[] = shown.map((r, i) => ({
              key: `${board.id}-${i}`,
              profileId: r.profileId,
              rank: (tally.get(r.rank) ?? 1) > 1 ? `T-${r.rank}` : String(r.rank),
              name: r.name,
              sub: [r.champ, `vs ${r.opponent}`, `W${r.seasonDay}`].filter(Boolean).join(" · "),
              // A null value never ranks upstream, so this is defensive rather than expected.
              value: r.value ?? 0,
              display: r.value === null ? "—" : format(r.value),
              // Champion art on a player board; the team crest on a team board, where `name` is the code.
              logo: r.champImg ?? logoOf.get(r.team) ?? logoOf.get(r.name),
              color: rampColor(1 - i / last),
            }));

            const matchOf = new Map(shown.map((r, i) => [`${board.id}-${i}`, r.matchId]));

            return (
              <BarLeaderboard
                key={board.id}
                title={board.title}
                rows={rows}
                isMobile={isMobile}
                emptyMessage="Nobody has one yet."
                // Rows are best-first, so the medals land where they should.
                medals
                onSelect={key => {
                  const matchId = matchOf.get(key);
                  if (matchId) navigate(`/game/${encodeURIComponent(matchId)}`);
                }}
              />
            );
          })}
        </div>
      )}

      <div className="mt-3 text-xs text-text-dim">
        {data.games !== null && <>{data.games.toLocaleString("en-US")} games</>}
        {data.lines !== null && <> · {data.lines.toLocaleString("en-US")} player performances</>}
        {" · click a row to open the game"}
      </div>
    </div>
  );
}
