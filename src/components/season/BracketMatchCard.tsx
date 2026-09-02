/**
 * One bracket match, as a card.
 *
 * Two rows — `top` and `bottom` — and everything on them is oriented to the *slot*, not to the
 * alphabet: `result.winsTop` belongs to `top.team`, and the winner is a side rather than a code.
 * Reading the winner off `winnerCode` instead would be wrong the moment two rows share a code, and
 * is a needless indirection the rest of the time.
 */

import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ExternalLink } from "lucide-react";
import { TeamBadge } from "../TeamBadge";
import { TeamLink } from "../league/TeamLink";
import { toBadge } from "../../lib/leagueAdapters";
import { fmtKickoff } from "../../lib/utils";
import { seriesComplete, sideProvenance, type BracketLayout } from "../../lib/bracketLayout";
import type { SeasonBracketMatch, SeasonBracketSide, SlotSide } from "../../lib/api";

interface Props {
  match: SeasonBracketMatch;
  /** Nothing consumes this result — an end of the bracket. Emphasis only. */
  terminal: boolean;
  layout: BracketLayout;
  conf: string;
  /** Registers the card element so the connector overlay can measure where it landed. */
  measureRef?: (el: HTMLDivElement | null) => void;
  /**
   * Replaces the team/provenance area of a row — the League Admin bracket puts a team picker there.
   *
   * Returning null falls back to the read-only rendering, which is what a derived slot wants even
   * inside an editor: nobody assigns a team to "Winner of Match 7" by hand.
   */
  slotControl?: (slot: SlotSide, side: SeasonBracketSide, match: SeasonBracketMatch) => ReactNode | null;
}

function SideRow({
  slot,
  side,
  wins,
  won,
  lost,
  showScore,
  layout,
  conf,
  control,
}: {
  slot: SlotSide;
  side: SeasonBracketSide;
  wins: number;
  won: boolean;
  lost: boolean;
  showScore: boolean;
  layout: BracketLayout;
  conf: string;
  control: ReactNode | null;
}) {
  const provenance = side.from ? sideProvenance(layout, side.from) : null;

  return (
    // `data-slot` is what the connector overlay measures to land a line on this row rather than on
    // the middle of the card. Keep it if this markup is reshuffled.
    <div
      data-slot={slot}
      className={`flex items-center gap-2 px-2.5 py-2 ${lost ? "opacity-55" : ""}`}
      style={{
        // The winner's own color, not green: a bracket loss is not a bad result to paint red, and
        // the team color is what ties this row to the connector leaving the card.
        borderLeft: `3px solid ${won && side.team ? side.team.colorHex : "transparent"}`,
      }}
    >
      {/*
        One reserved column, three things it can hold. A seed, for an entry slot. An arrow, for a
        slot fed by a *drop* — those edges are no longer drawn, because in a double-elimination
        bracket they are all long and all cross each other, so this is what is left to say a team
        arrived here by losing. Nothing, for a slot fed by a win, where the line says it already.
      */}
      <span
        className="w-5 shrink-0 text-right font-mono text-[10px] text-text-dim"
        title={side.from?.output === "loser" ? provenance ?? undefined : undefined}
      >
        {side.from === null ? (side.seed ? side.seed : "") : side.from.output === "loser" ? "↓" : ""}
      </span>

      {control ? (
        <div className="min-w-0 flex-1">{control}</div>
      ) : side.team ? (
        <TeamLink
          conf={conf}
          code={side.team.code}
          title={provenance ?? undefined}
          className="group flex min-w-0 flex-1 items-center gap-2 no-underline"
        >
          <TeamBadge team={toBadge(side.team)} size={20} />
          <span
            className={`truncate font-heading text-[13px] group-hover:text-brand ${
              won ? "font-bold text-text-bright" : "text-text"
            }`}
          >
            {side.team.name}
          </span>
        </TeamLink>
      ) : (
        <span className="min-w-0 flex-1 truncate text-[12px] italic text-text-dim" title={provenance ?? undefined}>
          {provenance ?? "TBD"}
        </span>
      )}

      {showScore && (
        <span
          className={`shrink-0 font-display text-[18px] ${won ? "text-text-bright" : "text-text-muted"}`}
        >
          {wins}
        </span>
      )}
    </div>
  );
}

export function BracketMatchCard({ match, terminal, layout, conf, measureRef, slotControl }: Props) {
  const result = match.result;
  const showScore = match.status === "played" && result !== null;
  const winner: SlotSide | null = result?.winner ?? null;

  // `winner` is null both mid-series and for a genuine split, so the counts against `bestOf` are the
  // only thing that separates them — see `seriesComplete`.
  const chip =
    showScore && winner === null ? (seriesComplete(match) ? "SPLIT" : "IN PROGRESS") : null;

  return (
    <div
      ref={measureRef}
      className={`relative overflow-hidden rounded-md border bg-bg2 ${
        match.status === "pending" ? "border-border bg-bg3" : "border-border"
      }`}
      style={terminal ? { borderTop: "2px solid var(--gold)" } : undefined}
      title={terminal ? "Nothing advances from this match" : undefined}
    >
      <div className="flex items-center gap-2 border-b border-border px-2.5 py-1.5">
        <span className="min-w-0 flex-1 truncate font-heading text-[10px] text-text-muted">
          {/* No synthetic name. The server names no final and no round, and `label` is the admin's
              own word for this match — inventing one here would be this client's guess. */}
          {match.label ?? ""}
        </span>

        {chip && (
          <span className="shrink-0 font-mono text-[9px] font-bold text-ccs-orange">{chip}</span>
        )}
        {/*
          `match.matchId` is the underlying `schedule_match` id, which is exactly what `/match/:id`
          takes — so this is the bracket's way into a series page, and currently the season page's only
          one. It sits in the header rather than wrapping the card because the side rows below already
          contain `TeamLink`s, and an anchor inside an anchor is invalid.

          Not offered on a `pending` node: a slot nobody has reached has nothing on its own page that
          this card isn't already showing. Nor inside an editor — `slotControl` is what marks one — where
          navigating away is how a half-finished bracket edit gets thrown away, and where the admin's own
          match drawer is the thing to open anyway.
        */}
        {slotControl === undefined && match.status !== "pending" && (
          <Link
            to={`/match/${match.matchId}`}
            className="shrink-0 font-mono text-[9px] text-text-muted no-underline hover:text-brand"
            title="Open the match page"
          >
            match →
          </Link>
        )}
        {result?.hasForfeit && (
          <span className="shrink-0 font-mono text-[9px] text-text-muted" title="Decided in part by a forfeit">
            FF
          </span>
        )}
        <span className="shrink-0 font-mono text-[9px] text-text-dim">Bo{match.bestOf}</span>
        {match.streamUrl && (
          <a
            href={match.streamUrl}
            target="_blank"
            rel="noreferrer"
            className="shrink-0 text-text-muted hover:text-brand"
            title="Watch"
          >
            <ExternalLink size={11} aria-hidden="true" />
          </a>
        )}
      </div>

      <SideRow
        slot="top"
        side={match.top}
        wins={result?.winsTop ?? 0}
        won={winner === "top"}
        lost={winner === "bottom"}
        showScore={showScore}
        layout={layout}
        conf={conf}
        control={slotControl?.("top", match.top, match) ?? null}
      />
      <div className="border-t border-border" />
      <SideRow
        slot="bottom"
        side={match.bottom}
        wins={result?.winsBottom ?? 0}
        won={winner === "bottom"}
        lost={winner === "top"}
        showScore={showScore}
        layout={layout}
        conf={conf}
        control={slotControl?.("bottom", match.bottom, match) ?? null}
      />

      {/* A kickoff is worth showing right up until the series starts. Once games exist the score is
          the news, and the date is just noise on the card. */}
      {match.status !== "played" && (
        <div className="border-t border-border px-2.5 py-1.5 text-[10px] text-text-dim">
          {fmtKickoff(match.scheduledAt)}
        </div>
      )}
    </div>
  );
}
