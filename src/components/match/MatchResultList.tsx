/**
 * Team-perspective game results shared by match previews and team pages.
 *
 * Both surfaces read the same `MatchlistEntry` payload. Keeping the row here means its W/L treatment,
 * draft icons and game metadata cannot drift merely because one list is a preview and the other is a
 * full history. Callers still own ordering and truncation: a preview wants twelve recent games, while
 * a team page renders the complete served history.
 */

import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { fmtSec, type MatchlistEntry, type MatchlistRoleKey } from "../../lib/api";
import { useChampions } from "../../hooks/useChampions";
import { fmtRelativeDay } from "../../lib/utils";
import { ChampionIcon } from "../ChampionIcon";
import { TeamLink } from "../league/TeamLink";
import { BanIcons } from "./BanIcons";

const LANES: readonly MatchlistRoleKey[] = ["top", "jg", "mid", "bot", "sup"];

interface Props {
  matches: readonly MatchlistEntry[];
  conf: string;
  emptyMessage?: string;
}

export function MatchResultList({ matches, conf, emptyMessage = "No games played yet." }: Props) {
  const champions = useChampions();

  if (matches.length === 0) return <p className="px-4 py-3 text-xs text-text-dim">{emptyMessage}</p>;

  return (
    <ul className="@container flex flex-col">
      {matches.map(match => {
        const gameHref = `/game/${encodeURIComponent(match.matchId)}`;
        const tone = match.win
          ? "bg-ccs-green/20 hover:bg-ccs-green/30"
          : "bg-ccs-red/20 hover:bg-ccs-red/30";

        return (
          <li
            key={match.matchId}
            className={`border-b border-border/40 px-3 py-2 last:border-b-0 @4xl:grid @4xl:grid-cols-[54px_minmax(100px,1fr)_140px_140px_64px_52px_72px_84px_40px] @4xl:items-center @4xl:gap-x-4 ${tone}`}
          >
            <div className="grid grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-x-3 sm:grid-cols-[auto_minmax(0,1fr)_auto_auto_auto] @4xl:contents">
              <Link
                to={gameHref}
                aria-label={`Open game ${match.game}, ${match.win ? "win" : "loss"}`}
                className="flex shrink-0 items-center gap-1.5 no-underline @4xl:col-start-1 @4xl:row-start-1"
              >
                <span
                  className={`flex h-5 w-5 items-center justify-center rounded-sm font-heading text-xs font-bold ${
                    match.win ? "bg-ccs-green/20 text-ccs-green" : "bg-ccs-red/20 text-ccs-red"
                  }`}
                >
                  {match.win ? "W" : "L"}
                </span>
                <span className="font-mono text-[10px] text-text-dim">G{match.game}</span>
              </Link>

              <TeamLink
                conf={conf}
                code={match.opponent}
                className="min-w-0 max-w-full justify-self-start no-underline @4xl:col-start-2 @4xl:row-start-1"
              >
                <span className="block truncate font-heading text-xs text-text hover:text-brand">
                  vs {match.opponent}
                </span>
              </TeamLink>

              <Link
                to={gameHref}
                aria-label={`Open game ${match.game} KDA`}
                className="text-right font-mono text-[11px] text-text-secondary no-underline @4xl:col-start-5 @4xl:row-start-1 @4xl:text-center"
              >
                {match.kills}/{match.deaths}/{match.assists}
              </Link>

              <Link
                to={gameHref}
                aria-label={`Open game ${match.game} duration`}
                className="text-right font-mono text-[11px] text-text-secondary no-underline @4xl:col-start-6 @4xl:row-start-1 @4xl:text-center"
              >
                {fmtSec(match.time)}
              </Link>

              <Link
                to={gameHref}
                aria-label={`Open game ${match.game} date`}
                className="hidden text-right font-mono text-[10px] text-text-secondary no-underline sm:block @4xl:col-start-7 @4xl:row-start-1 @4xl:text-center"
              >
                {fmtRelativeDay(match.startTime)}
              </Link>
            </div>

            <div className="mt-2 grid grid-cols-[minmax(106px,1fr)_minmax(106px,1fr)_34px] items-center gap-x-2 sm:grid-cols-[minmax(120px,1fr)_minmax(120px,1fr)_84px_34px] sm:gap-x-3 @4xl:contents">
              <Link
                to={gameHref}
                aria-label={`Open game ${match.game} picks`}
                className="min-w-0 no-underline @4xl:col-start-3 @4xl:row-start-1"
              >
                <DraftIcons label="Picks">
                  {LANES.map(lane => {
                    const player = match.roles[lane];
                    return (
                      <ChampionIcon
                        key={lane}
                        champion={player?.champ}
                        lookup={champions}
                        fallbackLabel={player?.champ ?? "—"}
                        size={18}
                        className="flex w-[18px] shrink-0 items-center justify-center overflow-hidden text-[9px] text-text-dim"
                      />
                    );
                  })}
                </DraftIcons>
              </Link>

              <Link
                to={gameHref}
                aria-label={`Open game ${match.game} bans`}
                className="min-w-0 no-underline @4xl:col-start-4 @4xl:row-start-1"
              >
                <DraftIcons label="Bans">
                  {match.bans.length > 0 ? (
                    <BanIcons
                      bans={match.bans}
                      champions={champions}
                      size={18}
                      className="flex w-[18px] shrink-0 items-center justify-center overflow-hidden text-[9px] text-text-dim opacity-70 grayscale"
                    />
                  ) : (
                    <span className="text-[10px] text-text-secondary">—</span>
                  )}
                </DraftIcons>
              </Link>

              <Link
                to={gameHref}
                aria-label={`Open game ${match.game} objectives`}
                className="hidden items-center justify-self-end gap-2.5 font-mono text-[10px] text-text-secondary no-underline sm:flex @4xl:col-start-8 @4xl:row-start-1 @4xl:justify-self-center"
              >
                <ObjectiveCount label="T" title="Towers" value={match.towers} />
                <ObjectiveCount label="D" title="Dragons" value={match.dragons} />
                <ObjectiveCount label="B" title="Barons" value={match.barons} />
              </Link>

              <Link
                to={gameHref}
                aria-label={`Open game ${match.game}, ${match.blueside ? "blue" : "red"} side`}
                className={`justify-self-end text-right font-heading text-[10px] font-semibold tracking-wider no-underline @4xl:col-start-9 @4xl:row-start-1 @4xl:justify-self-center @4xl:text-center ${
                  match.blueside ? "text-ccs-blue" : "text-ccs-red"
                }`}
              >
                {match.blueside ? "BLUE" : "RED"}
              </Link>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function DraftIcons({ label, children }: { label: string; children: ReactNode }) {
  return (
    <span className="flex items-center gap-0.5 sm:gap-1">
      <span className="mr-0.5 font-heading text-[9px] font-semibold uppercase tracking-wider text-text-secondary">
        <span className="sm:hidden">{label.charAt(0)}</span>
        <span className="hidden sm:inline">{label}</span>
      </span>
      {children}
    </span>
  );
}

function ObjectiveCount({ label, title, value }: { label: string; title: string; value: number | null }) {
  return (
    <span title={title}>
      <span className="font-heading text-[9px] font-semibold text-text-secondary">{label}</span> {value ?? "—"}
    </span>
  );
}
