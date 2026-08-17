/**
 * One game of a best-of, as two box scores.
 *
 * **Blue on the left, red on the right**, each a table of five players — the same arrangement
 * `GameSummary` uses and for the reason its docblock gives: laid out horizontally a side reads as one
 * long strip of champions and comparing the two lineups becomes a matter of counting across, while
 * stacked the two role orders sit next to each other.
 *
 * A `<table>` per side rather than flex rows, because the columns have to *line up*: player names vary
 * in width, and a flex row sizes each cell to its own content, so five rows of numbers came out ragged
 * and unlabelled. Now every column has a heading and a fixed share of the width.
 *
 * Not `GameSummary` itself. That takes a `RiotMatch` — the raw match-v5 payload, which is what a
 * tournament-code preview has in hand and all it has — and this takes the server's own box score, which
 * knows the team codes, the objectives and each player's profile. Sharing a component would mean one of
 * the two pretending to be the other's shape.
 */

import { Link } from "react-router-dom";
import { fmtSec } from "../../lib/api";
import type { SeriesGame, SeriesSide } from "../../lib/api";
import { useChampions } from "../../hooks/useChampions";
import type { ChampionLookup } from "../../lib/championData";
import { ChampionIcon } from "../ChampionIcon";
import { BanIcons } from "./BanIcons";
import { TeamNameLink, type TeamNamer } from "./TeamNameLink";

const BLUE = "#3b82f6";
const RED = "#ef4444";

interface Props {
  game: SeriesGame;
  /** The fixture's own codes, for naming the winner of a game that has no box score. */
  codeA: string;
  codeB: string;
  nameOf: TeamNamer;
}

export function SeriesGameCard({ game, codeA, codeB, nameOf }: Props) {
  const champions = useChampions();
  const hasBoxScore = game.blue !== null || game.red !== null;

  /*
   * `blueside: null` means the `blue`/`red` keys are upstream's guess — a legacy row never recorded
   * which side it was, and rather than drop the box score the fixture's `teamA` took `blue`. So the
   * side captions and the side colours come off, and the columns are labelled by team instead. The
   * scorelines are still right; only "which end of the map" is unknown.
   */
  const sidesKnown = game.blue?.blueside !== null && game.red?.blueside !== null;

  return (
    <div className="mb-4 overflow-hidden rounded-lg border border-border bg-bg2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border bg-bg3 px-4 py-3">
        <span className="font-display text-sm tracking-widest text-text-bright">GAME {game.game}</span>

        {game.forfeit ? (
          <span className="font-heading text-[10px] uppercase tracking-wider text-ccs-orange">Forfeit</span>
        ) : (
          <span className="font-mono text-xs text-text-muted">{fmtSec(game.duration)}</span>
        )}

        {game.winner !== null && (
          <span className="ml-auto flex items-center gap-2">
            <span className="font-heading text-[10px] tracking-wider text-text-muted">WINNER</span>
            <span className="font-heading text-xs font-semibold text-ccs-green">{game.winner}</span>
          </span>
        )}
      </div>

      {!hasBoxScore ? (
        <NoBoxScore game={game} codeA={codeA} codeB={codeB} />
      ) : (
        <>
          <div className="grid grid-cols-1 divide-y divide-border lg:grid-cols-2 lg:divide-x lg:divide-y-0">
            <SideTable
              side={game.blue}
              label={sidesKnown ? "BLUE" : null}
              accent={sidesKnown ? BLUE : undefined}
              fallbackCode={codeA}
              nameOf={nameOf}
              champions={champions}
            />
            <SideTable
              side={game.red}
              label={sidesKnown ? "RED" : null}
              accent={sidesKnown ? RED : undefined}
              fallbackCode={codeB}
              nameOf={nameOf}
              champions={champions}
            />
          </div>

          {!sidesKnown && (
            <p className="border-t border-border px-4 py-2 text-[10px] text-text-dim">
              This game never recorded which side each team was on, so the two columns are labelled by
              team rather than by side.
            </p>
          )}

          {/*
            Only offered where there is a game to open. A game with no box score has no payload behind
            `/game/:matchId` either, so the link would lead to a page repeating the sentence above it.
          */}
          {game.matchId !== null && (
            <div className="border-t border-border px-4 py-2.5">
              <Link
                to={`/game/${encodeURIComponent(game.matchId)}`}
                className="font-heading text-[11px] uppercase tracking-wider text-ccs-green no-underline hover:underline"
              >
                Full box score &rarr;
              </Link>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/**
 * What to say about a game with no box score.
 *
 * Three causes, and the reader needs one distinction: a walkover, where nothing was played, and a game
 * that *was* played but whose statistics upstream cannot serve. Either way the result counts for the
 * series, the standings and the bracket, which is the part worth saying — an earlier version rendered
 * these as an empty table, which read as the game being broken.
 */
function NoBoxScore({ game, codeA, codeB }: { game: SeriesGame; codeA: string; codeB: string }) {
  const loser = game.winner === null ? null : game.winner === codeA ? codeB : codeA;

  return (
    <p className="px-4 py-4 text-xs text-text-secondary">
      {game.winner !== null && (
        <>
          <span className="font-heading tracking-wider text-text-bright">{game.winner}</span>
          {loser === null ? (
            " won this game. "
          ) : (
            <>
              {" beat "}
              <span className="font-heading tracking-wider text-text-bright">{loser}</span>.{" "}
            </>
          )}
        </>
      )}
      {game.forfeit
        ? "It was awarded by walkover, so there is no game to show — the result counts all the same."
        : "Riot did not collect data for this game. The result still counts, but statistics will not be counted."}
    </p>
  );
}

/**
 * Column headings, in the order the cells below are written, each with its width under `table-fixed`.
 *
 * Declared widths for the same reason the preview's roster table declares them: with automatic layout the
 * player column grows to fit the longest Riot ID, and this table lives in half a card — so one long tag
 * put a horizontal scrollbar under a box score. Fixed instead, and the name truncates.
 */
const COLUMNS = [
  { key: "kda", label: "K / D / A", title: "Kills, deaths and assists", width: "w-[80px]" },
  { key: "cs", label: "CS", title: "Farm", width: "w-[40px]" },
  { key: "gold", label: "GOLD", title: "Gold earned", width: "w-[52px]" },
  { key: "dmg", label: "DMG", title: "Damage to champions", width: "w-[52px]" },
  { key: "vs", label: "VS", title: "Vision score", width: "w-[36px]" },
] as const;

/** One side: who they were, what they took, and five labelled lines. */
function SideTable({
  side,
  label,
  accent,
  fallbackCode,
  nameOf,
  champions,
}: {
  side: SeriesSide | null;
  /** `BLUE`/`RED`, or null where the side is a guess and shouldn't be captioned as one. */
  label: string | null;
  /** The side colour, or undefined for the same reason. */
  accent?: string;
  /** Which of the fixture's two teams this column stands for when nothing was recorded for it. */
  fallbackCode: string;
  nameOf: TeamNamer;
  champions: ChampionLookup | null;
}) {
  const code = side?.team ?? fallbackCode;

  if (side === null) {
    return (
      <div className="px-4 py-3">
        <TeamHeading code={code} label={label} accent={accent} nameOf={nameOf} />
        <p className="mt-1 text-xs text-text-dim">Nothing recorded for this side.</p>
      </div>
    );
  }

  return (
    <div className="min-w-0 px-4 py-3">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <TeamHeading code={code} label={label} accent={accent} nameOf={nameOf} />
        <span
          className={`shrink-0 font-heading text-[10px] uppercase tracking-wider ${side.win ? "text-ccs-green" : "text-ccs-red"
            }`}
        >
          {side.win ? "win" : "loss"}
        </span>
      </div>

      {/*
        Objectives and bans on one line. They are both "what this side did before the box score", they
        each occupy a third of a row on their own, and stacked they pushed the five player rows below the
        fold on a phone. `flex-wrap` is what makes that safe: on a narrow column the bans drop onto their
        own line rather than squeezing the counts.

        `justify-between` rather than a margin, because it does the right thing on both lines: the two
        groups sit at opposite ends when they fit, and a wrapped line holding a single group is placed at
        the start — so the bans don't end up right-aligned and orphaned under a left-aligned stat line.
      */}
      <div className="mb-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
        <Objectives side={side} />
        {side.bans.length > 0 && (
          <div className="flex items-center gap-1.5">
            <span className="shrink-0 font-heading text-[10px] tracking-wider text-text-muted">BANS</span>
            <BanIcons
              bans={side.bans}
              champions={champions}
              size={20}
              className="flex items-center opacity-70 grayscale"
            />
          </div>
        )}
      </div>

      <div className="overflow-x-auto">
        {/* `min-w` is where the fixed columns stop fitting; below it the wrapper scrolls instead. */}
        <table className="w-full min-w-[380px] table-fixed border-collapse">
          <thead>
            <tr className="border-b border-border">
              <th className="py-1 pr-2 text-left font-heading text-[9px] font-normal uppercase tracking-wider text-text-dim">
                Player
              </th>
              {COLUMNS.map(c => (
                <th
                  key={c.key}
                  title={c.title}
                  className={`${c.width} whitespace-nowrap py-1 pl-2 text-right font-heading text-[9px] font-normal uppercase tracking-wider text-text-dim`}
                >
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {side.players.map((p, i) => (
              <tr key={p.profileId ?? `${i}-${p.championId}`} className="border-b border-border/40 last:border-b-0">
                <td className="py-1.5 pr-2">
                  <div className="flex items-center gap-2">
                    <ChampionIcon
                      champion={p.championId}
                      lookup={champions}
                      fallbackLabel={p.champion ?? undefined}
                      size={22}
                      className="flex w-[22px] shrink-0 items-center justify-center overflow-hidden text-[9px] text-text-dim"
                    />
                    <span className="min-w-0 truncate text-xs text-text" title={p.name ?? undefined}>
                      {p.name ?? "Unknown"}
                    </span>
                  </div>
                </td>
                <td className="whitespace-nowrap py-1.5 pl-2 text-right font-mono text-[11px] text-text-secondary">
                  {p.kills} / {p.deaths} / {p.assists}
                </td>
                <td className="py-1.5 pl-2 text-right font-mono text-[11px] text-text-muted">{p.cs}</td>
                <td className="py-1.5 pl-2 text-right font-mono text-[11px] text-text-muted">
                  {(p.gold / 1000).toFixed(1)}k
                </td>
                <td className="py-1.5 pl-2 text-right font-mono text-[11px] text-text-muted">
                  {(p.damage / 1000).toFixed(1)}k
                </td>
                <td className="py-1.5 pl-2 text-right font-mono text-[11px] text-text-muted">{p.visionScore}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** The side caption, where there is one, and whose column this is. */
function TeamHeading({
  code,
  label,
  accent,
  nameOf,
}: {
  code: string;
  label: string | null;
  accent?: string;
  nameOf: TeamNamer;
}) {
  return (
    <div className="flex min-w-0 items-baseline gap-2">
      {label !== null && (
        <span
          className="shrink-0 font-display text-[11px] tracking-widest"
          style={accent ? { color: accent } : undefined}
        >
          {label}
        </span>
      )}
      <TeamNameLink code={code} nameOf={nameOf} className="font-heading text-sm font-bold text-text-bright" />
    </div>
  );
}

/**
 * The side's objectives.
 *
 * Zeroes are shown rather than dropped: on a game where nobody took a baron, the absence of a baron is
 * information, and a line whose entries come and go can't be read across two columns.
 *
 * No margin of its own — it shares a wrapping row with the bans, which owns the spacing.
 */
function Objectives({ side }: { side: SeriesSide }) {
  const items: [string, string, string][] = [
    ["K", String(side.kills), "Kills"],
    ["G", `${(side.gold / 1000).toFixed(1)}k`, "Gold earned"],
    ["T", String(side.towers), "Towers"],
    ["D", String(side.dragons), "Dragons"],
    ["B", String(side.barons), "Barons"],
    ["H", String(side.heralds), "Rift heralds"],
    ["V", String(side.grubs), "Voidgrubs"],
  ];

  return (
    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 font-mono text-[11px] text-text-muted">
      {items.map(([tag, value, title]) => (
        <span key={tag} title={title}>
          <span className="text-text-dim">{tag}</span> {value}
        </span>
      ))}
    </div>
  );
}
