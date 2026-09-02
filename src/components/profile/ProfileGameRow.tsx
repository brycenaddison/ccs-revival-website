/**
 * One game, from the player's side — a single line.
 *
 * The first attempt split it in two: champion on top, a strip of captioned numbers below. Both rows
 * were wrong. The top one was a champion icon and a name in a full-width space, so almost all of it
 * was empty; the bottom one packed eight 10px values under 8px captions, which is smaller than
 * anything else on the page and the hardest thing on it to read.
 *
 * So the stats sit on the same line as the champion, in a fixed grid with one header row above the
 * list carrying the captions once instead of on every row. That buys back the vertical space the
 * captions were spending and lets the numbers grow to a readable size. The grid is shared with
 * `MatchHistory`'s header — change one and change both.
 *
 * Every number here is served. Nothing is derived: `kda`, `csMin`, `damageMin` and
 * `killParticipation` all come off the payload, and recomputing them from the raw counts would
 * produce values that disagree with the career totals above.
 */

import { Link } from "react-router-dom";
import { fmtSec, roleLabel, type ProfileGame } from "../../lib/api";
import { dec, int, pct, signed } from "../../lib/statFormat";
import { ChampionIcon } from "../ChampionIcon";
import { kdaText, kdaTone, metricText } from "./profileUi";

/**
 * Shared by the header strip and every row so the columns line up.
 *
 * The champion column flexes; everything else is fixed, because a number that changes width by a
 * character shouldn't move the column next to it. The KDA track is sized for a bold "Perfect",
 * which is the longest value that can land in it — a deathless game is common enough that it is not
 * an edge case to let overflow.
 *
 * **The champion track has a floor and the grid has a minimum width**, which is what makes the
 * narrow case behave. Without them the row kept shrinking: a phone got a champion name truncated to
 * three characters while nine numbers squeezed themselves illegibly thin. Now the row stops at a
 * width where the name is still readable and `MatchHistory` scrolls it sideways instead.
 *
 * `MIN_W` is the sum of the tracks, the eight gaps and the horizontal padding. It has to move when
 * any of those do — there is no way to express "as wide as my own tracks" while still letting the
 * champion column grow on a desktop.
 */
const MIN_W = "min-w-[680px]";

export const GAME_GRID =
  `grid ${MIN_W} grid-cols-[minmax(160px,1fr)_66px_58px_74px_50px_44px_50px_44px_46px] items-center gap-x-2`;

export function ProfileGameRow({ game }: { game: ProfileGame }) {
  const href = `/game/${encodeURIComponent(game.matchId)}`;
  // The exact tint `MatchResultList` gives a result row on a team page. A game row should not read
  // as a different kind of thing depending on which page it is on.
  const tone = game.win ? "bg-ccs-green/20 hover:bg-ccs-green/30" : "bg-ccs-red/20 hover:bg-ccs-red/30";

  return (
    // `MIN_W` here as well as on the grid inside. The `<li>` carries the tint and the divider, and
    // without its own floor it stayed as wide as the scroll *viewport* while the row inside it ran
    // on to 680px — so the color and the border stopped partway across and the rest of the scrolled
    // row sat on bare background.
    <li className={`${MIN_W} border-t border-border/40 ${tone}`}>
      <Link
        to={href}
        aria-label={`Open game ${game.game ?? ""}, ${game.win ? "win" : "loss"}`}
        className={`${GAME_GRID} px-3 py-2 no-underline`}
      >
        <span className="flex min-w-0 items-center gap-2">
          <span
            className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-sm font-heading text-xs font-bold ${
              game.win ? "bg-ccs-green/20 text-ccs-green" : "bg-ccs-red/20 text-ccs-red"
            }`}
          >
            {game.win ? "W" : "L"}
          </span>
          <ChampionIcon
            champion={game.champId}
            src={game.champImg}
            name={game.champ}
            size={24}
            tile
            decorative
            className="flex shrink-0"
          />
          <span className="min-w-0">
            <span className="block truncate font-heading text-xs text-text-bright">
              {game.champ ?? "Unknown"}
            </span>
            {game.role && (
              <span className="block truncate font-heading text-[9px] text-text-secondary">
                {roleLabel(game.role)}
              </span>
            )}
          </span>
        </span>

        <Value>{game.kills}/{game.deaths}/{game.assists}</Value>
        <Value tone={kdaTone(game.kda, "text-text-secondary")}>{kdaText(game.kda)}</Value>
        {/* Total with the per-minute rate in parentheses: the count is what a reader recognizes, the
            rate is what compares across games of different lengths. Both, or neither is much use. */}
        <Value>{int(game.cs)} ({metricText(game.csMin, dec(1))})</Value>
        <Value>{metricText(game.damageMin, int)}</Value>
        <Value>{metricText(game.killParticipation, pct)}</Value>
        <Value>{metricText(game.goldDiffAt14, signed)}</Value>
        <Value>{int(game.visionScore)}</Value>
        <Value>{fmtSec(game.durationS)}</Value>
      </Link>
    </li>
  );
}

/** The captions for `GAME_GRID`, rendered once above a series' games. */
export function GameRowHeader() {
  return (
    <div
      className={`${GAME_GRID} border-t border-border/40 bg-bg3/40 px-3 py-1 font-heading text-[9px] text-text-dim`}
    >
      <span>Champion</span>
      <span className="text-center">K/D/A</span>
      <span className="text-center">KDA</span>
      <span className="text-center">CS</span>
      <span className="text-center">DPM</span>
      <span className="text-center">KP</span>
      <span className="text-center">GD@14</span>
      <span className="text-center">Vision</span>
      <span className="text-center">Time</span>
    </div>
  );
}

function Value({ tone = "text-text-secondary", children }: { tone?: string; children: React.ReactNode }) {
  return <span className={`truncate text-center font-mono text-[11px] ${tone}`}>{children}</span>;
}
