/**
 * One bracket match, as a card.
 *
 * Two rows — `top` and `bottom` — and everything on them is oriented to the *slot*, not to the
 * alphabet: `result.winsTop` belongs to `top.team`, and the winner is a side rather than a code.
 * Reading the winner off `winnerCode` instead would be wrong the moment two rows share a code, and
 * is a needless indirection the rest of the time.
 */

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
}

function SideRow({
  side,
  wins,
  won,
  lost,
  showScore,
  layout,
  conf,
}: {
  side: SeasonBracketSide;
  wins: number;
  won: boolean;
  lost: boolean;
  showScore: boolean;
  layout: BracketLayout;
  conf: string;
}) {
  const provenance = side.from ? sideProvenance(layout, side.from) : null;

  return (
    <div
      className={`flex items-center gap-2 px-2.5 py-2 ${lost ? "opacity-55" : ""}`}
      style={{
        // The winner's own colour, not green: a bracket loss is not a bad result to paint red, and
        // the team colour is what ties this row to the connector leaving the card.
        borderLeft: `3px solid ${won && side.team ? side.team.colorHex : "transparent"}`,
      }}
    >
      {/* A seed belongs to an entry slot. A propagated team arrived by winning, not by seeding, so
          the column stays reserved to keep the two rows aligned but holds nothing. */}
      <span className="w-5 shrink-0 text-right font-mono text-[10px] text-text-dim">
        {side.from === null && side.seed ? side.seed : ""}
      </span>

      {side.team ? (
        <TeamLink
          conf={conf}
          code={side.team.code}
          title={provenance ?? undefined}
          className="group flex min-w-0 flex-1 items-center gap-2 no-underline"
        >
          <TeamBadge team={toBadge(side.team)} size={20} />
          <span
            className={`truncate font-heading text-[13px] group-hover:text-accent ${
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

export function BracketMatchCard({ match, terminal, layout, conf, measureRef }: Props) {
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
        <span className="min-w-0 flex-1 truncate font-heading text-[10px] uppercase tracking-wider text-text-muted">
          {/* No synthetic name. The server names no final and no round, and `label` is the admin's
              own word for this match — inventing one here would be this client's guess. */}
          {match.label ?? ""}
        </span>

        {chip && (
          <span className="shrink-0 font-mono text-[9px] font-bold uppercase text-ccs-orange">{chip}</span>
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
            className="shrink-0 text-text-muted hover:text-accent"
            title="Watch"
          >
            <ExternalLink size={11} aria-hidden="true" />
          </a>
        )}
      </div>

      <SideRow
        side={match.top}
        wins={result?.winsTop ?? 0}
        won={winner === "top"}
        lost={winner === "bottom"}
        showScore={showScore}
        layout={layout}
        conf={conf}
      />
      <div className="border-t border-border" />
      <SideRow
        side={match.bottom}
        wins={result?.winsBottom ?? 0}
        won={winner === "bottom"}
        lost={winner === "top"}
        showScore={showScore}
        layout={layout}
        conf={conf}
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
