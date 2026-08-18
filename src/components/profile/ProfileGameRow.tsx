/**
 * One game, from the player's side.
 *
 * Built on `MatchResultList`'s density idiom rather than a table: it is a `@container` whose two
 * layout wrappers become `contents` at `@4xl`, promoting every cell into a single aligned row when
 * there is width for one and letting them stack into two rows when there isn't. A table would have
 * had to scroll sideways on a phone; this reflows instead.
 *
 * Every number here is already on the payload. Nothing is derived — `kda`, `csMin`, `damageMin` and
 * `killParticipation` are all served, and recomputing any of them from the raw counts would produce
 * a number that disagrees with the career totals above.
 */

import { ChevronDown } from "lucide-react";
import { Link } from "react-router-dom";
import { fmtSec, roleLabel, type ProfileGame } from "../../lib/api";
import { dec, int, pct, signed } from "../../lib/statFormat";
import { ChampionIcon } from "../ChampionIcon";
import { GameBuildDetail } from "./GameBuildDetail";
import { kdaText, kdaTone, metricText } from "./profileUi";

interface Props {
  game: ProfileGame;
  puuids: ReadonlySet<string>;
  open: boolean;
  onToggle: () => void;
}

export function ProfileGameRow({ game, puuids, open, onToggle }: Props) {
  const href = `/game/${encodeURIComponent(game.matchId)}`;
  const tone = game.win ? "bg-ccs-green/10 hover:bg-ccs-green/20" : "bg-ccs-red/10 hover:bg-ccs-red/20";

  return (
    <li className={`@container border-t border-border/40 ${tone}`}>
      <div className="px-3 py-2 @4xl:grid @4xl:grid-cols-[46px_minmax(120px,1fr)_58px_86px_72px_58px_56px_60px_56px_60px_34px] @4xl:items-center @4xl:gap-x-3">
        <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 @4xl:contents">
          <Link
            to={href}
            aria-label={`Open game ${game.game ?? ""}, ${game.win ? "win" : "loss"}`}
            className="flex shrink-0 items-center gap-1.5 no-underline @4xl:col-start-1 @4xl:row-start-1"
          >
            <span
              className={`flex h-5 w-5 items-center justify-center rounded-sm font-heading text-xs font-bold ${
                game.win ? "bg-ccs-green/20 text-ccs-green" : "bg-ccs-red/20 text-ccs-red"
              }`}
            >
              {game.win ? "W" : "L"}
            </span>
            {game.game !== null && <span className="font-mono text-[10px] text-text-dim">G{game.game}</span>}
          </Link>

          <Link
            to={href}
            className="flex min-w-0 items-center gap-2 no-underline @4xl:col-start-2 @4xl:row-start-1"
          >
            <ChampionIcon champion={game.champId} src={game.champImg} name={game.champ} size={26} decorative />
            <span className="min-w-0">
              <span className="block truncate font-heading text-xs text-text-bright">
                {game.champ ?? "Unknown"}
              </span>
              {game.role && (
                <span className="block font-heading text-[9px] uppercase tracking-wider text-text-secondary">
                  {roleLabel(game.role)}
                </span>
              )}
            </span>
          </Link>

          <button
            type="button"
            onClick={onToggle}
            aria-expanded={open}
            aria-label={open ? "Hide build" : "Show build"}
            className="shrink-0 p-1 text-text-dim hover:text-text-bright @4xl:col-start-11 @4xl:row-start-1 @4xl:justify-self-center"
          >
            <ChevronDown size={14} className={open ? "rotate-180" : ""} aria-hidden="true" />
          </button>
        </div>

        <div className="mt-1.5 grid grid-cols-4 gap-x-2 gap-y-1 sm:grid-cols-8 @4xl:contents">
          <Cell label="K/D/A" className="@4xl:col-start-3">
            {game.kills}/{game.deaths}/{game.assists}
          </Cell>
          <Cell label="KDA" className="@4xl:col-start-4" tone={kdaTone(game.kda)}>
            {kdaText(game.kda)}
          </Cell>
          <Cell label="CS" className="@4xl:col-start-5">
            {int(game.cs)}
            <span className="text-text-dim"> · {metricText(game.csMin, dec(1))}</span>
          </Cell>
          <Cell label="DPM" className="@4xl:col-start-6">{metricText(game.damageMin, int)}</Cell>
          <Cell label="KP" className="@4xl:col-start-7">{metricText(game.killParticipation, pct)}</Cell>
          <Cell label="GD@14" className="@4xl:col-start-8">{metricText(game.goldDiffAt14, signed)}</Cell>
          <Cell label="VS/m" className="@4xl:col-start-9">{metricText(game.visionScoreMin, dec(2))}</Cell>
          <Cell label="Time" className="@4xl:col-start-10">
            {fmtSec(game.durationS)}
            {game.blueside !== null && (
              <span className={game.blueside ? "text-ccs-blue" : "text-ccs-red"}>
                {" "}
                {game.blueside ? "BLUE" : "RED"}
              </span>
            )}
          </Cell>
        </div>
      </div>

      {open && (
        <div className="border-t border-border/40 bg-bg/40 px-3 py-3">
          <GameBuildDetail matchId={game.matchId} puuids={puuids} champId={game.champId} win={game.win} />
        </div>
      )}
    </li>
  );
}

/**
 * A metric with its caption above it.
 *
 * The caption is what makes the stacked layout readable — eight bare numbers in a row on a phone
 * are unidentifiable — and it stays in the wide layout too, because the row has no table header to
 * carry it.
 */
function Cell({
  label,
  className,
  /** Colour for the value only — the caption stays dim so the row keeps one visual rhythm. */
  tone = "text-text-secondary",
  children,
}: {
  label: string;
  className?: string;
  tone?: string;
  children: React.ReactNode;
}) {
  return (
    <span className={`min-w-0 @4xl:row-start-1 @4xl:text-center ${className ?? ""}`}>
      <span className="block font-heading text-[8px] uppercase tracking-wider text-text-dim">{label}</span>
      <span className={`block truncate font-mono text-[11px] ${tone}`}>{children}</span>
    </span>
  );
}
